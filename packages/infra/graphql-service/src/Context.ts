import type { IncomingHttpHeaders } from 'node:http';
import type { BaseContext } from '@apollo/server';
import type { AuthPrincipal } from '@justtellme/auth-token';
import { getPrincipal } from '@justtellme/web-auth';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import type { GraphQLErrorExtensions } from 'graphql';
import { GraphQLError } from 'graphql';
import type { Context } from 'graphql-ws';
import { wrapAsCaseInsensitiveMap } from './caseInsensitiveMap.ts';
import type { JTMGraphQLConfigurationSchema } from './config.ts';
import type {
  JTMGraphQLRequestLocals,
  JTMGraphQLServiceLocals,
  JTMGraphQLServiceRequest,
  JTMGraphQLServiceResponse,
} from './types.ts';

export interface JTMGraphQLContext<
  SLocals extends
    JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
> extends BaseContext {
  locals: SLocals;
  app: ServiceExpress<SLocals>;

  reject(why: 'unauthenticated' | 'unauthorized'): never;
  gqlError(args: {
    message: string;
    status?: number;
    code: string;
    extensions?: GraphQLErrorExtensions;
  }): GraphQLError;
  principal(): Promise<AuthPrincipal | undefined>;
  xAuthTokenHeader(): Promise<string | undefined>;

  headers: IncomingHttpHeaders;
  user?: AuthPrincipal;
  cookies?: Record<string, string>;
}

abstract class BaseContextClass<
  SLocals extends
    JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
> implements JTMGraphQLContext<SLocals>
{
  app: ServiceExpress<SLocals>;

  constructor(app: ServiceExpress<SLocals>) {
    this.app = app;
  }

  get locals() {
    return this.app.locals;
  }

  reject(why: 'unauthenticated' | 'unauthorized'): never {
    throw new GraphQLError(why === 'unauthenticated' ? 'Authentication required' : 'Forbidden', {
      extensions: {
        code: why === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      },
    });
  }

  gqlError(args: {
    message: string;
    status?: number;
    code: string;
    extensions?: GraphQLErrorExtensions;
  }) {
    return new GraphQLError(args.message, {
      extensions: {
        code: args.code,
        ...(args.status ? { http: { status: args.status } } : undefined),
        ...args.extensions,
      },
    });
  }

  async xAuthTokenHeader() {
    const user = await this.principal();
    return user?.encodeJwt();
  }

  abstract principal(): Promise<AuthPrincipal | undefined>;
  abstract get headers(): IncomingHttpHeaders;
  abstract get user(): AuthPrincipal | undefined;
  abstract set user(user: AuthPrincipal | undefined);
  abstract get cookies(): Record<string, string>;
}

export class WsJTMGraphQLContext<
  SLocals extends
    JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
> extends BaseContextClass<SLocals> {
  wsContext: Context;
  user: AuthPrincipal | undefined;
  headers: IncomingHttpHeaders;
  private readonly parsedCookies: Record<string, string>;

  constructor(
    app: ServiceExpress<SLocals>,
    wsContext: Context,
    trustedConnectionHeaders: IncomingHttpHeaders = {},
  ) {
    super(app);
    this.wsContext = wsContext;
    const upgradeHeaders =
      (
        wsContext.extra as {
          request?: { headers?: IncomingHttpHeaders };
        }
      ).request?.headers ?? {};
    this.headers = wrapAsCaseInsensitiveMap({
      ...upgradeHeaders,
      ...trustedConnectionHeaders,
    } as Record<string, string>);
    this.parsedCookies = parseCookieHeader(this.headers.cookie);
  }

  get cookies(): Record<string, string> {
    return this.parsedCookies;
  }

  async principal(): Promise<AuthPrincipal | undefined> {
    if (!this.user) {
      this.user = await getPrincipal(this);
    }
    return this.user;
  }
}

function parseCookieHeader(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  return Object.fromEntries(
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        const key = separator < 0 ? part : part.slice(0, separator);
        const raw = separator < 0 ? '' : part.slice(separator + 1);
        try {
          return [key, decodeURIComponent(raw)];
        } catch {
          return [key, raw];
        }
      }),
  );
}

export class HttpJTMGraphQLContext<
  SLocals extends
    JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
  RLocals extends JTMGraphQLRequestLocals = JTMGraphQLRequestLocals,
> extends BaseContextClass<SLocals> {
  req: JTMGraphQLServiceRequest<SLocals>;
  res: JTMGraphQLServiceResponse<SLocals, RLocals>;

  constructor(
    req: JTMGraphQLServiceRequest<SLocals>,
    res: JTMGraphQLServiceResponse<SLocals, RLocals>,
  ) {
    super(req.app);
    this.req = req;
    this.res = res;
  }

  get headers(): IncomingHttpHeaders {
    return this.req.headers;
  }

  get user(): AuthPrincipal | undefined {
    return this.req.user;
  }

  set user(user: AuthPrincipal | undefined) {
    this.req.user = user;
  }

  get cookies(): Record<string, string> {
    return this.req.cookies;
  }

  async principal(): Promise<AuthPrincipal | undefined> {
    return this.user;
  }
}

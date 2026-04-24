import type { BaseContext } from '@apollo/server';
import { getPrincipal } from '@justtellme/web-auth';
import type { JTMPrincipal } from '@justtellme/auth-token';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import type { GraphQLErrorExtensions } from 'graphql';
import { GraphQLError } from 'graphql';
import type { Context } from 'graphql-ws';
import type { IncomingHttpHeaders } from 'http';
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
  xAuthTokenHeader(): Promise<string | undefined>;

  headers: IncomingHttpHeaders;
  user?: JTMPrincipal;
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
    if (this.headers['x-auth-token']) {
      return this.headers['x-auth-token'] as string;
    }
    if (this.user) {
      return this.user.encodeJwt();
    }
    const user = await getPrincipal(this);
    this.user = user;
    return user?.encodeJwt();
  }

  abstract get headers(): IncomingHttpHeaders;
  abstract get user(): JTMPrincipal | undefined;
  abstract set user(user: JTMPrincipal | undefined);
  abstract get cookies(): Record<string, string>;
}

export class WsJTMGraphQLContext<
  SLocals extends
    JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
> extends BaseContextClass<SLocals> {
  wsContext: Context;
  user: JTMPrincipal | undefined;
  headers: IncomingHttpHeaders;

  constructor(app: ServiceExpress<SLocals>, wsContext: Context) {
    super(app);
    this.wsContext = wsContext;
    this.headers = wrapAsCaseInsensitiveMap(
      (wsContext.connectionParams?.headers as Record<string, string>) ?? {},
    );
  }

  get cookies(): Record<string, string> {
    return {};
  }
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

  get user(): JTMPrincipal | undefined {
    return this.req.user;
  }

  set user(user: JTMPrincipal | undefined) {
    this.req.user = user;
  }

  get cookies(): Record<string, string> {
    return this.req.cookies;
  }
}

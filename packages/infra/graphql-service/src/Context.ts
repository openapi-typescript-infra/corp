import type { IncomingHttpHeaders } from 'http';

import type { GraphQLErrorExtensions } from 'graphql';
import { GraphQLError } from 'graphql';
import type { BaseContext } from '@apollo/server';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import type { Context } from 'graphql-ws';
import { getPrincipal, type HSPrincipal } from '@justtellme/web-auth';

import type { HSGraphQLConfigurationSchema } from './config.ts';
import type {
  HSGraphQLRequestLocals,
  HSGraphQLServiceLocals,
  HSGraphQLServiceRequest,
  HSGraphQLServiceResponse,
} from './types.ts';
import { wrapAsCaseInsensitiveMap } from './caseInsensitiveMap.ts';

export interface HSGraphQLContext<
  SLocals extends HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
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
  user?: HSPrincipal;
  cookies?: Record<string, string>;
}

abstract class BaseContextClass<
  SLocals extends HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
> implements HSGraphQLContext<SLocals> {
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
  abstract get user(): HSPrincipal | undefined;
  abstract set user(user: HSPrincipal | undefined);
  abstract get cookies(): Record<string, string>;
}

export class WsHSGraphQLContext<
  SLocals extends HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
> extends BaseContextClass<SLocals> {
  wsContext: Context;
  user: HSPrincipal | undefined;
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

export class HttpHSGraphQLContext<
  SLocals extends HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
  RLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
> extends BaseContextClass<SLocals> {
  req: HSGraphQLServiceRequest<SLocals>;
  res: HSGraphQLServiceResponse<SLocals, RLocals>;

  constructor(
    req: HSGraphQLServiceRequest<SLocals>,
    res: HSGraphQLServiceResponse<SLocals, RLocals>,
  ) {
    super(req.app);
    this.req = req;
    this.res = res;
  }

  get headers(): IncomingHttpHeaders {
    return this.req.headers;
  }

  get user(): HSPrincipal | undefined {
    return this.req.user;
  }

  set user(user: HSPrincipal | undefined) {
    this.req.user = user;
  }

  get cookies(): Record<string, string> {
    return this.req.cookies;
  }
}

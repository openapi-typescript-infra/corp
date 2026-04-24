import type { ContextFunction } from '@apollo/server';
import type { ExpressContextFunctionArgument } from '@as-integrations/express5';
import type {
  HSAuthRequestLocals,
  HSAuthService,
  HSAuthServiceLocals,
} from '@justtellme/service-with-auth';
import type {
  RequestLike,
  RequestWithApp,
  ServiceExpress,
  ServiceRouter,
} from '@openapi-typescript-infra/service';
import type { NextFunction, Request, Response } from 'express';
import type { ExecutionArgs } from 'graphql';
import type { Context, SubscribeMessage } from 'graphql-ws';
import type { JTMGraphQLContext } from './Context.ts';
import type { JTMGraphQLConfigurationSchema } from './config.ts';

export interface JTMGraphQLServiceLocals<
  Config extends JTMGraphQLConfigurationSchema = JTMGraphQLConfigurationSchema,
> extends HSAuthServiceLocals<Config> {
  /**
   * A middleware function that will add session to the request
   */
  withSession(req: Request, res: Response, next: NextFunction): void;
  /**
   * A middleware function that will add session to the request and add
   * user information to the request
   */
  withAuthAndSession(req: Request, res: Response, next: NextFunction): void;
}

export interface JTMGraphQLRequestLocals extends HSAuthRequestLocals {
  query: string;
  /**
   * An estimate of the query complexity based on analysis of the query and annotations on the schema.
   */
  complexity: number;
  /**
   * A "bottoms up" measure of the cost of the query, maintained by your code adding to the value as it executes
   * expensive things (like API requests)
   */
  cost: number;
}

export interface JTMGraphQLService<
  ServiceLocals extends
    HSAuthServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
  RequestLocals extends JTMGraphQLRequestLocals = JTMGraphQLRequestLocals,
> extends HSAuthService<ServiceLocals, RequestLocals> {
  getContext: ContextFunction<[ExpressContextFunctionArgument], JTMGraphQLContext<ServiceLocals>>;
  getWsContext: (
    app: ServiceExpress<ServiceLocals>,
    context: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
  ) => Promise<JTMGraphQLContext<ServiceLocals>> | JTMGraphQLContext<ServiceLocals>;
}

/**
 * Convenience types for the basic request and response
 */
export type JTMGraphQLServiceRequest<
  ServiceLocals extends
    HSAuthServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
> = RequestWithApp<ServiceLocals>;

export type JTMGraphQLServiceResponse<
  ResBody = object,
  RequestLocals extends JTMGraphQLRequestLocals = JTMGraphQLRequestLocals,
> = Response<ResBody, RequestLocals>;

export type JTMGraphQLServiceRouter<
  SLocals extends JTMGraphQLServiceLocals = JTMGraphQLServiceLocals,
  RLocals extends JTMGraphQLRequestLocals = JTMGraphQLRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type JTMGraphQLRequestLike<
  SLocals extends
    HSAuthServiceLocals<JTMGraphQLConfigurationSchema> = JTMGraphQLServiceLocals<JTMGraphQLConfigurationSchema>,
  RLocals extends JTMGraphQLRequestLocals = JTMGraphQLRequestLocals,
> = RequestLike<SLocals, RLocals>;

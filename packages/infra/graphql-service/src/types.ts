import type {
  RequestLike,
  RequestWithApp,
  ServiceExpress,
  ServiceRouter,
} from '@openapi-typescript-infra/service';
import type { NextFunction, Request, Response } from 'express';
import type {
  HSAuthRequestLocals,
  HSAuthService,
  HSAuthServiceLocals,
} from '@justtellme/service-with-auth';
import type { ContextFunction } from '@apollo/server';
import type { ExpressContextFunctionArgument } from '@as-integrations/express5';
import type { Context, SubscribeMessage } from 'graphql-ws';
import type { ExecutionArgs } from 'graphql';

import type { HSGraphQLConfigurationSchema } from './config.ts';
import type { HSGraphQLContext } from './Context.ts';

export interface HSGraphQLServiceLocals<
  Config extends HSGraphQLConfigurationSchema = HSGraphQLConfigurationSchema,
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

export interface HSGraphQLRequestLocals extends HSAuthRequestLocals {
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

export interface HSGraphQLService<
  ServiceLocals extends HSAuthServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
  RequestLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
> extends HSAuthService<ServiceLocals, RequestLocals> {
  getContext: ContextFunction<[ExpressContextFunctionArgument], HSGraphQLContext<ServiceLocals>>;
  getWsContext: (
    app: ServiceExpress<ServiceLocals>,
    context: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
  ) => Promise<HSGraphQLContext<ServiceLocals>> | HSGraphQLContext<ServiceLocals>;
}

/**
 * Convenience types for the basic request and response
 */
export type HSGraphQLServiceRequest<
  ServiceLocals extends HSAuthServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
> = RequestWithApp<ServiceLocals>;

export type HSGraphQLServiceResponse<
  ResBody = object,
  RequestLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
> = Response<ResBody, RequestLocals>;

export type HSGraphQLServiceRouter<
  SLocals extends HSGraphQLServiceLocals = HSGraphQLServiceLocals,
  RLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type HSGraphQLRequestLike<
  SLocals extends HSAuthServiceLocals<HSGraphQLConfigurationSchema> =
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
  RLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
> = RequestLike<SLocals, RLocals>;

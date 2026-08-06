import type { JTMRequestLocals, JTMService, JTMServiceLocals } from '@justtellme/service';
import type { AuthDatasources, getMiddleware } from '@justtellme/web-auth';
import type { RequestLike, RequestWithApp, ServiceRouter } from '@openapi-typescript-infra/service';
import type { NextFunction, Request, Response } from 'express';

import type { JTMAuthConfigurationSchema } from './config.ts';

type SessionMiddlewareInfo = Awaited<ReturnType<typeof getMiddleware>>;

export interface JTMAuthServiceLocals<
  Config extends JTMAuthConfigurationSchema = JTMAuthConfigurationSchema,
> extends JTMServiceLocals<Config>,
    AuthDatasources {
  /**
   * A middleware function that will add session to the request
   */
  withSession(req: Request, res: Response, next: NextFunction): void;
  /**
   * A middleware function that will add session to the request and add
   * user information to the request
   */
  withAuthAndSession(req: Request, res: Response, next: NextFunction): void;
  /**
   * withAuthorization generates a middleware function that will validate an
   * authorization rule against the request context. Typically you would
   * add this to a route to both establish session and authentication, and then
   * enforce a rule. additionalParameters can add extra data that is not readily
   * accessible from the request, such as graphql query parameters or external
   * API results.
   */
  withAuthorization(
    rule: string,
    additionalParameters?: Record<string, unknown>,
  ): SessionMiddlewareInfo['withAuthorization'];

  /**
   * In case you need access to the Redis client directly. This is the Redis instance
   * that stores browser sessions, so use it if that is the appropriate store.
   */
  redis: SessionMiddlewareInfo['redis'];
}

export interface JTMAuthRequestLocals extends JTMRequestLocals {
  /**
   * Get the HTTP headers required to forward authentication to a downstream service (possibly doing legacy authz).
   * Note that this is more than just forwarding inbound headers, because the user may have been set in the context
   * of this request.
   */
  getForwardHeaders(): Promise<Record<string, string> | undefined>;
}

export type JTMAuthService<
  ServiceLocals extends
    JTMServiceLocals<JTMAuthConfigurationSchema> = JTMAuthServiceLocals<JTMAuthConfigurationSchema>,
  RequestLocals extends JTMAuthRequestLocals = JTMAuthRequestLocals,
> = JTMService<ServiceLocals, RequestLocals>;

/**
 * Convenience types for the basic request and response
 */
export type JTMAuthServiceRequest<
  ServiceLocals extends
    JTMServiceLocals<JTMAuthConfigurationSchema> = JTMAuthServiceLocals<JTMAuthConfigurationSchema>,
> = RequestWithApp<ServiceLocals>;

export type JTMAuthServiceResponse<
  ResBody = object,
  ServiceLocals extends
    JTMServiceLocals<JTMAuthConfigurationSchema> = JTMAuthServiceLocals<JTMAuthConfigurationSchema>,
> = Response<ResBody, ServiceLocals>;
export type JTMAuthServiceRouter<
  SLocals extends JTMAuthServiceLocals = JTMAuthServiceLocals,
  RLocals extends JTMAuthRequestLocals = JTMAuthRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type JTMAuthRequestLike<
  SLocals extends
    JTMServiceLocals<JTMAuthConfigurationSchema> = JTMAuthServiceLocals<JTMAuthConfigurationSchema>,
  RLocals extends JTMAuthRequestLocals = JTMAuthRequestLocals,
> = RequestLike<SLocals, RLocals>;

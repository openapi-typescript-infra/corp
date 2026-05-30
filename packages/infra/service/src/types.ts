import type {
  RequestLike,
  RequestLocals,
  RequestWithApp,
  Service,
  ServiceExpress,
  ServiceLocals,
  ServiceRouter,
} from '@openapi-typescript-infra/service';
import type { Response } from 'express';

import type { JTMConfigurationSchema } from './config.ts';

export interface JTMServiceLocals<Config extends JTMConfigurationSchema = JTMConfigurationSchema>
  extends ServiceLocals<Config> {
  gcpProjectId: string;
}

// This allows our type constraints to be loose but to extract
// config type when necessary
// biome-ignore lint/suspicious/noExplicitAny: This intentionally accepts any service config type.
export type AnyJTMServiceLocals = JTMServiceLocals<any>;

/**
 * These per-request values hang off of the Response object
 * in express (I don't love that, but :shrug:). Express@5
 * also hangs res off req, so we can use a single argument
 * to get both locals when necessary
 */
export type JTMRequestLocals = RequestLocals;

export type JTMExpress<
  ServiceLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
> = ServiceExpress<ServiceLocals>;

export type JTMService<
  ServiceLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  RequestLocals extends JTMRequestLocals = JTMRequestLocals,
> = Service<ServiceLocals, RequestLocals>;

/**
 * Convenience types for the basic request and response
 */
export type JTMServiceRequest<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
> = RequestWithApp<SLocals>;

export type JTMServiceResponse<ResBody = object> = Response<ResBody, JTMRequestLocals>;
export type JTMServiceRouter<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  RLocals extends JTMRequestLocals = JTMRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type JTMRequestLike<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  RLocals extends JTMRequestLocals = JTMRequestLocals,
> = RequestLike<SLocals, RLocals>;

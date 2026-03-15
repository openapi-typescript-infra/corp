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

import type { HSConfigurationSchema } from './config.ts';

export interface HSServiceLocals<
  Config extends HSConfigurationSchema = HSConfigurationSchema,
> extends ServiceLocals<Config> {
  gcpProjectId: string;
}

// This allows our type constraints to be loose but to extract
// config type when necessary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHSServiceLocals = HSServiceLocals<any>;

/**
 * These per-request values hang off of the Response object
 * in express (I don't love that, but :shrug:). Express@5
 * also hangs res off req, so we can use a single argument
 * to get both locals when necessary
 */
export type HSRequestLocals = RequestLocals;

export type HSExpress<
  ServiceLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
> = ServiceExpress<ServiceLocals>;

export type HSService<
  ServiceLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  RequestLocals extends HSRequestLocals = HSRequestLocals,
> = Service<ServiceLocals, RequestLocals>;

/**
 * Convenience types for the basic request and response
 */
export type HSServiceRequest<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
> = RequestWithApp<SLocals>;

export type HSServiceResponse<ResBody = object> = Response<ResBody, HSRequestLocals>;
export type HSServiceRouter<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  RLocals extends HSRequestLocals = HSRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type HSRequestLike<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  RLocals extends HSRequestLocals = HSRequestLocals,
> = RequestLike<SLocals, RLocals>;

import type createClient from 'openapi-fetch';
import type {
  RequestLike,
  RequestWithApp,
  ServiceRouter,
  ServiceTypes,
} from '@openapi-typescript-infra/service';
import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import type { NextFunction, Request, Response } from 'express';
import type {
  HSAuthRequestLocals,
  HSAuthService,
  HSAuthServiceLocals,
} from '@justtellme/service-with-auth';

import type { HSWebConfigurationSchema } from './config.ts';

export interface HSWebServiceLocals<
  Config extends HSWebConfigurationSchema = HSWebConfigurationSchema,
> extends HSAuthServiceLocals<Config> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  next: ReturnType<typeof import('next').default>;
  /**
   * A middleware function that will add session to the request
   */
  withSession(req: Request, res: Response, next: NextFunction): void;
  /**
   * A middleware function that will add session to the request and add
   * user information to the request
   */
  withAuthAndSession(req: Request, res: Response, next: NextFunction): void;

  datasources: {
    identityInternal: ReturnType<typeof createClient<IdentityInternal>>;
  };
}

export type HSWebRequestLocals = HSAuthRequestLocals;

export type HSWebService<
  ServiceLocals extends HSAuthServiceLocals<HSWebConfigurationSchema> =
    HSWebServiceLocals<HSWebConfigurationSchema>,
  RequestLocals extends HSWebRequestLocals = HSWebRequestLocals,
> = HSAuthService<ServiceLocals, RequestLocals>;

/**
 * Convenience types for the basic request and response
 */
export type HSWebServiceRequest<
  ServiceLocals extends HSAuthServiceLocals<HSWebConfigurationSchema> =
    HSWebServiceLocals<HSWebConfigurationSchema>,
> = RequestWithApp<ServiceLocals>;

export type HSWebServiceResponse<
  ResBody = object,
  ServiceLocals extends HSAuthServiceLocals<HSWebConfigurationSchema> =
    HSWebServiceLocals<HSWebConfigurationSchema>,
> = Response<ResBody, ServiceLocals>;
export type HSWebServiceRouter<
  SLocals extends HSWebServiceLocals = HSWebServiceLocals,
  RLocals extends HSWebRequestLocals = HSWebRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type HSWebRequestLike<
  SLocals extends HSAuthServiceLocals<HSWebConfigurationSchema> =
    HSWebServiceLocals<HSWebConfigurationSchema>,
  RLocals extends HSWebRequestLocals = HSWebRequestLocals,
> = RequestLike<SLocals, RLocals>;

export type HSWebServiceTypes = ServiceTypes<HSWebServiceLocals, HSWebRequestLocals>;

import type { paths as IdentityInternal } from '@justtellme/identity-internal-client';
import type {
  JTMAuthRequestLocals,
  JTMAuthService,
  JTMAuthServiceLocals,
} from '@justtellme/service-with-auth';
import type {
  RequestLike,
  RequestWithApp,
  ServiceRouter,
  ServiceTypes,
} from '@openapi-typescript-infra/service';
import type { NextFunction, Request, Response } from 'express';
import type createClient from 'openapi-fetch';

import type { JTMWebConfigurationSchema } from './config.ts';

export interface JTMWebServiceLocals<
  Config extends JTMWebConfigurationSchema = JTMWebConfigurationSchema,
> extends JTMAuthServiceLocals<Config> {
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

export type JTMWebRequestLocals = JTMAuthRequestLocals;

export type JTMWebService<
  ServiceLocals extends
    JTMAuthServiceLocals<JTMWebConfigurationSchema> = JTMWebServiceLocals<JTMWebConfigurationSchema>,
  RequestLocals extends JTMWebRequestLocals = JTMWebRequestLocals,
> = JTMAuthService<ServiceLocals, RequestLocals>;

/**
 * Convenience types for the basic request and response
 */
export type JTMWebServiceRequest<
  ServiceLocals extends
    JTMAuthServiceLocals<JTMWebConfigurationSchema> = JTMWebServiceLocals<JTMWebConfigurationSchema>,
> = RequestWithApp<ServiceLocals>;

export type JTMWebServiceResponse<
  ResBody = object,
  ServiceLocals extends
    JTMAuthServiceLocals<JTMWebConfigurationSchema> = JTMWebServiceLocals<JTMWebConfigurationSchema>,
> = Response<ResBody, ServiceLocals>;
export type JTMWebServiceRouter<
  SLocals extends JTMWebServiceLocals = JTMWebServiceLocals,
  RLocals extends JTMWebRequestLocals = JTMWebRequestLocals,
> = ServiceRouter<SLocals, RLocals>;

/**
 * This type should be used (or extended) to pass "context"
 * into functions not directly wired into the Express request
 * handling flow. It will allow "synthetic" requests to be
 * easily constructed without depending on things they should not,
 * like query strings or body or similar. Most often, you want the
 * logger.
 */
export type JTMWebRequestLike<
  SLocals extends
    JTMAuthServiceLocals<JTMWebConfigurationSchema> = JTMWebServiceLocals<JTMWebConfigurationSchema>,
  RLocals extends JTMWebRequestLocals = JTMWebRequestLocals,
> = RequestLike<SLocals, RLocals>;

export type JTMWebServiceTypes = ServiceTypes<JTMWebServiceLocals, JTMWebRequestLocals>;

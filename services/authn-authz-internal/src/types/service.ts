import type { HSRequestLocals, HSServiceLocals } from '@justtellme/service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { Client as StytchClient } from 'stytch';
import type { Metrics } from '#src/lib/metrics.ts';
import type { operationHandlers } from '../generated/service/index.ts';
import type { AuthnAuthzInternalConfigSchema } from './config.ts';
import type { createAuthnAuthzInternalDatasources } from './datasources.ts';

export interface AuthnAuthzInternalLocals extends HSServiceLocals<AuthnAuthzInternalConfigSchema> {
  datasources: ReturnType<typeof createAuthnAuthzInternalDatasources>;
  metrics: Metrics;
  stytch: StytchClient;
}

export type AuthnAuthzInternalRequestLocals = HSRequestLocals;

export type AuthnAuthzInternal = ServiceTypes<
  AuthnAuthzInternalLocals,
  AuthnAuthzInternalRequestLocals
>;

export type AuthnAuthzInternalApi = operationHandlers<
  AuthnAuthzInternalLocals,
  AuthnAuthzInternalRequestLocals
>;

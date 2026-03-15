import type { Kysely } from 'kysely';
import type { RedisClientType } from 'redis';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { HSRequestLocals, HSServiceLocals } from '@justtellme/service';

import type { DB } from '../generated/database.ts';
import type { operationHandlers } from '../generated/service/index.ts';

import type { createPaymentInternalDatasources } from './datasources.ts';
import type { PaymentInternalConfigSchema } from './config.ts';

export interface PaymentInternalLocals extends HSServiceLocals<PaymentInternalConfigSchema> {
  datasources: ReturnType<typeof createPaymentInternalDatasources>;
  db: Kysely<DB>;
  redis?: RedisClientType;
}

export type PaymentInternalRequestLocals = HSRequestLocals;

export type PaymentInternal = ServiceTypes<PaymentInternalLocals, PaymentInternalRequestLocals>;

export type PaymentInternalApi = operationHandlers<
  PaymentInternalLocals,
  PaymentInternalRequestLocals
>;

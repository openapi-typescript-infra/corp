import type { JTMRequestLocals, JTMServiceLocals } from '@justtellme/service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { Kysely } from 'kysely';
import type { RedisClientType } from 'redis';

import type { DB } from '../generated/database.ts';
import type { operationHandlers } from '../generated/service/index.ts';
import type { PaymentInternalConfigSchema } from './config.ts';
import type { createPaymentInternalDatasources } from './datasources.ts';

export interface PaymentInternalLocals extends JTMServiceLocals<PaymentInternalConfigSchema> {
  datasources: ReturnType<typeof createPaymentInternalDatasources>;
  db: Kysely<DB>;
  redis?: RedisClientType;
}

export type PaymentInternalRequestLocals = JTMRequestLocals;

export type PaymentInternal = ServiceTypes<PaymentInternalLocals, PaymentInternalRequestLocals>;

export type PaymentInternalApi = operationHandlers<
  PaymentInternalLocals,
  PaymentInternalRequestLocals
>;

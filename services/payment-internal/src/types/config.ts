import type { HSConfigurationSchema } from '@justtellme/service';
import type { ClientConfig } from 'pg';
import type { RedisClientOptions } from 'redis';

import type { createPaymentInternalDatasources } from './datasources.ts';

export interface PaymentInternalConfigSchema extends HSConfigurationSchema {
  datasources: ReturnType<typeof createPaymentInternalDatasources>;

  db: ClientConfig;

  redis: { enabled: boolean } & RedisClientOptions;
}

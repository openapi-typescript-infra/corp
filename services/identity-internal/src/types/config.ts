import type { ClientConfig } from 'pg';
import type { RedisClientOptions } from 'redis';
import type { HSConfigurationSchema } from '@justtellme/service';

export interface IdentityInternalConfigSchema extends HSConfigurationSchema {
  db: ClientConfig;

  googleMapsKey: string;

  redis: { enabled: boolean } & RedisClientOptions;
}

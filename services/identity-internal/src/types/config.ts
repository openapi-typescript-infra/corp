import type { JTMConfigurationSchema } from '@justtellme/service';
import type { ClientConfig } from 'pg';
import type { RedisClientOptions } from 'redis';

export interface IdentityInternalConfigSchema extends JTMConfigurationSchema {
  db: ClientConfig;

  googleMapsKey: string;

  redis: { enabled: boolean } & RedisClientOptions;
}

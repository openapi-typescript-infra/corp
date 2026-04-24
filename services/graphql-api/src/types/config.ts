import type { JTMGraphQLConfigurationSchema } from '@justtellme/graphql-service';
import type { RedisClientOptions } from 'redis';

import type { createGraphqlApiDatasources } from './datasources.ts';

export interface GraphqlApiConfigSchema extends JTMGraphQLConfigurationSchema {
  datasources: ReturnType<typeof createGraphqlApiDatasources> &
    JTMGraphQLConfigurationSchema['datasources'];
  redis: { enabled: boolean } & RedisClientOptions;
}

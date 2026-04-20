import type { HSGraphQLConfigurationSchema } from '@justtellme/graphql-service';
import type { RedisClientOptions } from 'redis';

import type { createGraphqlApiDatasources } from './datasources.ts';

export interface GraphqlApiConfigSchema extends HSGraphQLConfigurationSchema {
  datasources: ReturnType<typeof createGraphqlApiDatasources> &
    HSGraphQLConfigurationSchema['datasources'];
  redis: { enabled: boolean } & RedisClientOptions;
}

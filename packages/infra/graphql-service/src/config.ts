import type { HSAuthConfigurationSchema } from '@justtellme/service-with-auth';

export interface JTMGraphQLConfigurationSchema extends HSAuthConfigurationSchema {
  graphql: {
    ws?: boolean;
    introspection: boolean;
    maximumComplexity: number;
  };
}

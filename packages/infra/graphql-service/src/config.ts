import type { HSAuthConfigurationSchema } from '@justtellme/service-with-auth';

export interface HSGraphQLConfigurationSchema extends HSAuthConfigurationSchema {
  graphql: {
    ws?: boolean;
    introspection: boolean;
    maximumComplexity: number;
  };
}

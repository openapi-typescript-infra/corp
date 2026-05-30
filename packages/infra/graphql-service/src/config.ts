import type { JTMAuthConfigurationSchema } from '@justtellme/service-with-auth';

export interface JTMGraphQLConfigurationSchema extends JTMAuthConfigurationSchema {
  graphql: {
    ws?: boolean;
    introspection: boolean;
    maximumComplexity: number;
  };
}

import type { CodegenConfig } from '@graphql-codegen/cli';

import { enhanced } from '../gql-plugin/enhanced-gql.ts';

const enhancedConfig: CodegenConfig = {
  schema: './api/**/*.graphql',
  generates: {
    './src/generated/schema.graphql': {
      plugins: [
        {
          '@graphql-codegen/justtellme': {},
        },
      ],
    },
  },
  pluginLoader(name) {
    if (name === '@graphql-codegen/justtellme') {
      return { plugin: enhanced };
    }
    return import(name);
  },
};

// eslint-disable-next-line import/no-default-export
export default enhancedConfig;

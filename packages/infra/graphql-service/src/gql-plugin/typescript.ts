import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './src/generated/schema.graphql',
  generates: {
    './src/generated/graphql.ts': {
      config: {
        contextType:
          process.env.APOLLO_CONTEXT || '@justtellme/graphql-service#HSGraphQLContext',
        strictScalars: true,
        useTypeImports: true,
        scalars: {
          Date: 'Date',
          DateTime: 'Date',
          EmailAddress: 'string',
          JSONObject: 'Record<string, any>',
          PositiveInt: 'Int',
          URL: 'string',
        },
      },
      plugins: [
        {
          add: {
            content: '/* eslint-disable */',
          },
        },
        'typescript',
        'typescript-resolvers',
      ],
    },
  },
};

// eslint-disable-next-line import/no-default-export
export default config;

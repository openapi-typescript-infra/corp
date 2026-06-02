import graphqlPlugin from '@graphql-eslint/eslint-plugin';

export default [
  {
    ignores: ['src/generated/**'],
  },
  {
    files: ['**/*.graphql'],
    languageOptions: {
      parser: graphqlPlugin.parser,
      parserOptions: {
        graphQLConfig: {
          schema: './src/generated/schema.graphql',
        },
      },
    },
    plugins: {
      '@graphql-eslint': graphqlPlugin,
    },
    rules: {
      '@graphql-eslint/description-style': ['error', { style: 'inline' }],
      '@graphql-eslint/known-directives': 'error',
      '@graphql-eslint/no-anonymous-operations': 'error',
      '@graphql-eslint/no-duplicate-fields': 'error',
      '@graphql-eslint/require-description': [
        'error',
        {
          types: true,
          FieldDefinition: true,
          DirectiveDefinition: true,
        },
      ],
    },
  },
];

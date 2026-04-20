import graphqlPlugin from '@graphql-eslint/eslint-plugin';

export default [
  {
    files: ['**/*.graphql'],
    languageOptions: {
      parser: graphqlPlugin.parser,
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

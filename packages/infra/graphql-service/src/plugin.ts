import type { GraphQLRequestListener } from '@apollo/server';
import { ApolloServerErrorCode } from '@apollo/server/errors';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import { context as otelContext, trace } from '@opentelemetry/api';
import type { DocumentNode, GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { GraphQLError, separateOperations } from 'graphql';
import { directiveEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';

import type { HttpHSGraphQLContext } from './Context.ts';
import type { HSGraphQLConfigurationSchema } from './config.ts';
import type { HSGraphQLRequestLocals, HSGraphQLServiceLocals } from './types.ts';

function getOperationName(document: DocumentNode) {
  const operationDef = document.definitions.find(
    (def) => def.kind === 'OperationDefinition',
  ) as OperationDefinitionNode;

  return operationDef?.name?.value ? operationDef.name.value : '';
}

export function hsApolloPlugin<
  SLocals extends
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> = HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
  RLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
>(app: ServiceExpress<SLocals>, schema: GraphQLSchema) {
  const maximumComplexity = app.locals.config.graphql.maximumComplexity;
  const plugin: GraphQLRequestListener<HttpHSGraphQLContext<SLocals, RLocals>> = {
    async didResolveOperation({ contextValue, request, document }) {
      const name = getOperationName(document);
      if (name) {
        contextValue.res.locals.query = name;
        const span = trace.getSpan(otelContext.active());
        if (span) {
          span.setAttribute('graphql.operation.name', name);
        }
      }
      const complexity = getComplexity({
        schema,
        // To calculate query complexity properly,
        // we have to check if the document contains multiple operations
        // and eventually extract it operation from the whole query document.
        query: request.operationName
          ? separateOperations(document)[request.operationName]
          : document,
        // The variables for our GraphQL query
        variables: request.variables,
        estimators: [
          // The decision here is that fields cost us nothing, but explicitly marked queries
          // cost us something. This is a bit of a simplification, but it's a start.
          directiveEstimator({ name: 'complexity' }),
          simpleEstimator({ defaultComplexity: 0 }),
        ],
      });
      if (complexity > maximumComplexity) {
        throw new GraphQLError('Query is too complex', {
          extensions: {
            code: ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
            complexity,
            http: {
              status: 400,
            },
          },
        });
      }
      if (contextValue.res?.locals) {
        contextValue.res.locals.complexity = complexity;
        contextValue.res.locals.cost = 0;
      }
    },
    async didEncounterErrors({ contextValue, errors }) {
      errors.forEach((error) => {
        contextValue.app.locals.logger.error(error, 'GraphQL error');
      });
    },
  };

  return {
    async requestDidStart() {
      return plugin;
    },
  };
}

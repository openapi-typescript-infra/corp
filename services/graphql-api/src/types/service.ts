import type { HSGraphQLRequestLocals, HSGraphQLServiceLocals } from '@justtellme/graphql-service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { dataloaders } from '#src/lib/dataloaders/index.ts';
import type { GraphqlApiConfigSchema } from './config.ts';
import type { createGraphqlApiDatasources } from './datasources.ts';

export interface GraphqlApiLocals extends HSGraphQLServiceLocals<GraphqlApiConfigSchema> {
  datasources: ReturnType<typeof createGraphqlApiDatasources>;
}

export interface GraphqlApiRequestLocals extends HSGraphQLRequestLocals {
  loaders: ReturnType<typeof dataloaders>;
}

export type GraphqlApi = ServiceTypes<GraphqlApiLocals, GraphqlApiRequestLocals>;

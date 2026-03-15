import { useHSGraphQLService, type HSGraphQLService } from '@justtellme/graphql-service';

import { createGraphqlApiDatasources } from './types/datasources.ts';
import type { GraphqlApi, GraphqlApiLocals, GraphqlApiRequestLocals } from './types/index.ts';
import { getTranslatedAuthHeaders } from './lib/auth/wss.ts';
import { GraphQLApiWsContext, GraphQLHttpApiContext } from './types/context.ts';

export function service(): HSGraphQLService<GraphqlApiLocals, GraphqlApiRequestLocals> {
  const base = useHSGraphQLService<GraphqlApiLocals, GraphqlApiRequestLocals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);
      // Load and configure your service wide infra here

      // Assign your service-wide capabilities here
      Object.assign(app.locals, {
        datasources: createGraphqlApiDatasources(app),
      });
    },
    async getWsContext(app, context) {
      const incomingHeaders = context.connectionParams?.headers as Record<string, string>;
      const additionalHeaders = await getTranslatedAuthHeaders(
        app,
        (context.connectionParams?.headers as Record<string, string>)?.Authorization as string,
      );
      Object.assign(incomingHeaders, additionalHeaders);
      return new GraphQLApiWsContext(app, context);
    },
    async getContext({ req, res }) {
      return new GraphQLHttpApiContext(req as GraphqlApi['Request'], res as GraphqlApi['Response']);
    },
    async stop(app) {
      await base.stop?.(app);
      // Shutdown any service wide infra here
    },
  };
}

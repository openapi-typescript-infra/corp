import type { HSGraphQLContext } from '@justtellme/graphql-service';
import { HttpHSGraphQLContext, WsHSGraphQLContext } from '@justtellme/graphql-service';
import type { Context } from 'graphql-ws';

import type { GraphqlApi, GraphqlApiLocals, GraphqlApiRequestLocals } from './service.ts';

import { dataloaders } from '#src/lib/dataloaders/index.ts';

export interface GraphQLApiContext extends HSGraphQLContext<GraphqlApiLocals> {
  loaders: ReturnType<typeof dataloaders>;
  addCost(cost: number): void;

  // If a guest token was presented, values will be stored here.
  guestToken?: {
    token: string;
    patientUuid: string;
    encounterUuid: string;
  };
}

export class GraphQLHttpApiContext extends HttpHSGraphQLContext<
  GraphqlApiLocals,
  GraphqlApiRequestLocals
> {
  loaders: ReturnType<typeof dataloaders>;

  constructor(req: GraphqlApi['Request'], res: GraphqlApi['Response']) {
    super(req, res);
    this.loaders = dataloaders(this, (cost = 1) => {
      res.locals.cost += cost;
    });
  }

  addCost(cost: number) {
    this.res.locals.cost += cost;
  }
}

export class GraphQLApiWsContext extends WsHSGraphQLContext<GraphqlApiLocals> {
  loaders: ReturnType<typeof dataloaders>;

  constructor(app: GraphqlApi['App'], context: Context) {
    super(app, context);
    // Can't measure cost in WS yet.
    this.loaders = dataloaders(this, () => {});
  }

  addCost() {
    // Can't measure cost in WS yet.
  }
}

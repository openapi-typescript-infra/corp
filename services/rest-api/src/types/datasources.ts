import type { paths as AgentInternal } from '@justtellme/agent-internal-client';
import type { DatasourcesType } from '@justtellme/service';
import { createDatasourceClients } from '@justtellme/service';

import type { RestApi } from './service.ts';

export const Datasources = ['agentInternal'] as const;
export type Datasources = (typeof Datasources)[number];

interface DatasourcePaths {
  agentInternal: AgentInternal;
}

export function createRestApiDatasources(
  app: RestApi['App'],
): DatasourcesType<Datasources, DatasourcePaths> {
  return createDatasourceClients(app, Datasources);
}

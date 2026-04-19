import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import type { DatasourcesType, HSConfigurationSchema, HSServiceLocals } from '@justtellme/service';
import { createDatasourceClients } from '@justtellme/service';
import type { ServiceExpress } from '@openapi-typescript-infra/service';

export const Datasources = ['identityInternal'] as const;
export type Datasources = (typeof Datasources)[number];

interface DatasourcePaths {
  identityInternal: IdentityInternal;
}

export function createAuthDatasources(
  app: ServiceExpress<HSServiceLocals<HSConfigurationSchema>>,
): DatasourcesType<Datasources, DatasourcePaths> {
  return createDatasourceClients(app, Datasources);
}

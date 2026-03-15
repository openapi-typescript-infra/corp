import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import type { DatasourcesType } from '@justtellme/service';
import { createDatasourceClients } from '@justtellme/service';

import type { AuthnAuthzInternal } from './service.ts';

export const Datasources = ['identityInternal'] as const;
export type Datasources = (typeof Datasources)[number];

interface DatasourcePaths {
  identityInternal: IdentityInternal;
}

export function createAuthnAuthzInternalDatasources(
  app: AuthnAuthzInternal['App'],
): DatasourcesType<Datasources, DatasourcePaths> {
  return createDatasourceClients(app, Datasources);
}

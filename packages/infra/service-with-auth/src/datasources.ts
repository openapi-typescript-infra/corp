import type { paths as IdentityInternal } from '@justtellme/identity-internal-client';
import type {
  DatasourcesType,
  JTMConfigurationSchema,
  JTMServiceLocals,
} from '@justtellme/service';
import { createDatasourceClients } from '@justtellme/service';
import type { ServiceExpress } from '@openapi-typescript-infra/service';

export const Datasources = ['identityInternal'] as const;
export type Datasources = (typeof Datasources)[number];

interface DatasourcePaths {
  identityInternal: IdentityInternal;
}

export function createAuthDatasources(
  app: ServiceExpress<JTMServiceLocals<JTMConfigurationSchema>>,
): DatasourcesType<Datasources, DatasourcePaths> {
  return createDatasourceClients(app, Datasources);
}

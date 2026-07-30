import type { JTMAuthRequestLocals, JTMAuthServiceLocals } from '@justtellme/service-with-auth';
import type { ServiceTypes } from '@openapi-typescript-infra/service';

import type { operationHandlers } from '../generated/service/index.ts';
import type { RestApiConfigSchema } from './config.ts';
import type { createRestApiDatasources } from './datasources.ts';

export interface RestApiLocals extends JTMAuthServiceLocals<RestApiConfigSchema> {
  datasources: ReturnType<typeof createRestApiDatasources> &
    JTMAuthServiceLocals<RestApiConfigSchema>['datasources'];
}

export type RestApiRequestLocals = JTMAuthRequestLocals;
export type RestApi = ServiceTypes<RestApiLocals, RestApiRequestLocals>;
export type RestApiApi = operationHandlers<RestApiLocals, RestApiRequestLocals>;

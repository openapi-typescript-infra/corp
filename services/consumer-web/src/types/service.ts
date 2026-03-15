import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { HSWebRequestLocals, HSWebServiceLocals } from '@justtellme/web-service';

import type { operationHandlers } from '../generated/service/index.ts';

import type { createConsumerWebDatasources } from './datasources.ts';
import type { ConsumerWebConfigSchema } from './config.ts';

export interface ConsumerWebLocals extends HSWebServiceLocals<ConsumerWebConfigSchema> {
  datasources: ReturnType<typeof createConsumerWebDatasources>;
}

export type ConsumerWebRequestLocals = HSWebRequestLocals;

export type ConsumerWeb = ServiceTypes<ConsumerWebLocals, ConsumerWebRequestLocals>;

export type ConsumerWebApi = operationHandlers<ConsumerWebLocals, ConsumerWebRequestLocals>;

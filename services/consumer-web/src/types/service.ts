import type { JTMWebRequestLocals, JTMWebServiceLocals } from '@justtellme/web-service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';

import type { operationHandlers } from '../generated/service/index.ts';
import type { ConsumerWebConfigSchema } from './config.ts';
import type { createConsumerWebDatasources } from './datasources.ts';

export interface ConsumerWebLocals extends JTMWebServiceLocals<ConsumerWebConfigSchema> {
  datasources: ReturnType<typeof createConsumerWebDatasources>;
}

export type ConsumerWebRequestLocals = JTMWebRequestLocals;

export type ConsumerWeb = ServiceTypes<ConsumerWebLocals, ConsumerWebRequestLocals>;

export type ConsumerWebApi = operationHandlers<ConsumerWebLocals, ConsumerWebRequestLocals>;

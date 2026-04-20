import type { HSWebConfigurationSchema } from '@justtellme/web-service';

import type { createConsumerWebDatasources } from './datasources.ts';

export type ConsumerWebConfigSchema = HSWebConfigurationSchema & {
  datasources: ReturnType<typeof createConsumerWebDatasources>;
};

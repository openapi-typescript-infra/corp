import type { JTMWebConfigurationSchema } from '@justtellme/web-service';

import type { createConsumerWebDatasources } from './datasources.ts';

export type ConsumerWebConfigSchema = JTMWebConfigurationSchema & {
  datasources: ReturnType<typeof createConsumerWebDatasources>;
};

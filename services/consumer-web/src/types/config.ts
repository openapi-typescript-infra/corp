import type { HSWebConfigurationSchema } from '@justtellme/web-service';

import type { createConsumerWebDatasources } from './datasources.ts';

export interface ConsumerWebConfigSchema extends HSWebConfigurationSchema {
  datasources: ReturnType<typeof createConsumerWebDatasources>;
}

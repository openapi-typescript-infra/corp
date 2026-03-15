import { useHSWebService } from '@justtellme/web-service';

import { createConsumerWebDatasources } from './types/datasources.ts';
import type { ConsumerWeb, ConsumerWebLocals } from './types/index.ts';

export function service(): ConsumerWeb['Service'] {
  const base = useHSWebService<ConsumerWebLocals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);
      Object.assign(app.locals, {
        datasources: createConsumerWebDatasources(app),
      });
    },
    async stop(app) {
      await base.stop?.(app);
      // Shutdown any service wide infra here
    },
  };
}

import { useJTMServiceWithAuth } from '@justtellme/service-with-auth';

import { createRestApiDatasources } from './types/datasources.ts';
import type { RestApi, RestApiLocals } from './types/index.ts';

export function service(): RestApi['Service'] {
  const base = useJTMServiceWithAuth<RestApiLocals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);
      Object.assign(app.locals, {
        datasources: {
          ...app.locals.datasources,
          ...createRestApiDatasources(app),
        },
      });
    },
    async stop(app) {
      await base.stop?.(app);
    },
  };
}

import ApiSpec from '@justtellme/api/specs/payment-internal' with { type: 'json' };
import { getPgPool } from '@justtellme/cloud-sql';
import { useJTMService } from '@justtellme/service';
import { Kysely, PostgresDialect } from 'kysely';
import { createClient } from 'redis';

import type { DB } from './generated/database.ts';
import { createPaymentInternalDatasources } from './types/datasources.ts';
import type { PaymentInternal, PaymentInternalLocals } from './types/index.ts';

export function service(): PaymentInternal['Service'] {
  const base = useJTMService<PaymentInternalLocals>();
  let dbShutdown: () => Promise<void>;

  return {
    ...base,
    async start(app) {
      await base.start(app);
      // Load and configure your service wide infra here
      const { pool, shutdown } = await getPgPool(app);
      const db = new Kysely<DB>({
        dialect: new PostgresDialect({ pool }),
      });
      dbShutdown = shutdown;

      const { enabled: redisEnabled, ...redisConfig } = app.locals.config.redis || {};
      const redis = redisEnabled ? createClient(redisConfig) : undefined;
      if (redis) {
        await redis.connect();
      }

      // Assign your service-wide capabilities here
      Object.assign(app.locals, {
        datasources: createPaymentInternalDatasources(app),
        db,
        redis,
      });
    },
    configure(startOptions, options) {
      if (!base.configure) {
        throw new Error('Service infrastructure is misconfigured - base.configure is missing');
      }
      const config = base.configure(startOptions, options);
      Object.assign(config, {
        openApiOptions: { ...config.openApiOptions, apiSpec: ApiSpec },
      });
      return config;
    },
    async stop(app) {
      await base.stop?.(app);
      await dbShutdown();
      await app.locals.redis?.quit();
    },
  };
}

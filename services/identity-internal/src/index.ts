import ApiSpec from '@justtellme/api/specs/identity-internal' with { type: 'json' };
import { createTableCache, getPgPool } from '@justtellme/cloud-sql';
import { useJTMService } from '@justtellme/service';
import { Kysely, PostgresDialect } from 'kysely';
import { createClient } from 'redis';

import type { DB } from './generated/database.ts';
import type { IdentityInternal, IdentityInternalLocals } from './types/index.ts';

export function service(): IdentityInternal['Service'] {
  const base = useJTMService<IdentityInternalLocals>();
  let dbShutdown: () => Promise<void>;

  return {
    ...base,
    async start(app) {
      await base.start(app);
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

      Object.assign(app.locals, {
        db,
        redis,
        tables: {
          groupTypes: createTableCache(pool, {
            tableName: 'group_types',
            idColumn: 'group_type_id',
            nameColumn: 'name',
          }),
          identifierNamespaces: createTableCache(pool, {
            tableName: 'identifier_namespaces',
            idColumn: 'identifier_namespace_id',
            nameColumn: 'name',
          }),
          profileSchemas: createTableCache(pool, {
            tableName: 'profile_schemas',
            idColumn: 'profile_schema_id',
            nameColumn: 'name',
          }),
        },
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

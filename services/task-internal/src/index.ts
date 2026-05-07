import ApiSpec from '@justtellme/api/specs/task-internal' with { type: 'json' };
import { createTableCache, getPgPool } from '@justtellme/cloud-sql';
import { useJTMService } from '@justtellme/service';
import { Kysely, PostgresDialect } from 'kysely';

import type { DB } from './generated/database.ts';
import type { TaskInternal, TaskInternalLocals } from './types/index.ts';

export function service(): TaskInternal['Service'] {
  const base = useJTMService<TaskInternalLocals>();
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

      Object.assign(app.locals, {
        db,
        tables: {
          taskTypes: createTableCache(pool, {
            tableName: 'task_types',
            idColumn: 'task_type_id',
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
    },
  };
}

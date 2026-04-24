import { fileURLToPath } from 'node:url';
import { createTableCache, getPgPool } from '@justtellme/cloud-sql';
import { useJTMService } from '@justtellme/service';
import { combineActivities, Temporal } from '@openapi-typescript-infra/temporal-worker';
import { TemplateManager } from '@sesamecare-oss/ai-templating';
import type { Selectable } from 'kysely';
import { Kysely, PostgresDialect } from 'kysely';
import { createClient } from 'redis';
import type { Clients, DB, Models } from './generated/database.js';
import { AiModels } from './lib/ai.js';
import { setupLangfuseTelemetry } from './telemetry/langfuse.js';
import { createAgentActivities } from './temporal/activities/index.js';
import type { AgentInternal, AgentInternalLocals } from './types/index.js';

export function service(): AgentInternal['Service'] {
  const base = useJTMService<AgentInternalLocals>();
  let dbShutdown: () => Promise<void>;

  return {
    ...base,
    async start(app) {
      await base.start(app);

      const { pool, roPool, shutdown } = await getPgPool(app);
      dbShutdown = shutdown;

      const db = new Kysely<DB>({
        dialect: new PostgresDialect({ pool }),
      });
      const roDb = roPool
        ? new Kysely<DB>({
            dialect: new PostgresDialect({ pool: roPool }),
          })
        : db;

      const { client: langfuse } = setupLangfuseTelemetry(app.locals.config.langfuse);

      const redis = createClient(app.locals.config.redis);
      await redis.connect();
      redis.on('error', (err) => {
        app.locals.logger.error(err, 'Redis error');
      });

      const models = createTableCache<Selectable<Models>, 'model_id', 'name'>(pool, {
        tableName: 'models',
        idColumn: 'model_id',
        nameColumn: 'name',
      });
      const clients = createTableCache<Selectable<Clients>, 'client_id', 'name'>(pool, {
        tableName: 'clients',
        idColumn: 'client_id',
        nameColumn: 'name',
      });
      const aiModels = new AiModels(app);

      const time = process.hrtime();
      app.locals.logger.debug('Loading templates');
      const templates = new TemplateManager(app, {
        langfuse,
        rootDir: fileURLToPath(new URL('../private', import.meta.url)),
      });
      await templates.loadTemplates();
      const duration = process.hrtime(time);
      const elapsed = duration[0] + duration[1] / 1e9;
      app.locals.logger.info({ elapsed }, 'Templates loaded');

      Object.assign(app.locals, {
        db,
        roDb,
        langfuse,
        aiModels,
        clients,
        models,
        redis,
        templates,
      });

      if (app.locals.config.defaultTemporal) {
        const temporalConfig = app.locals.config.defaultTemporal;
        const temporal = new Temporal(app);
        await temporal.start(
          { ...temporalConfig, taskQueue: temporalConfig.taskQueue ?? 'agent-internal' },
          combineActivities(createAgentActivities(app)),
        );
        app.locals.defaultTemporal = temporal;
      }
    },
    async stop(app) {
      await app.locals.defaultTemporal?.stop();
      await app.locals.langfuse.shutdown();
      await app.locals.redis.quit();
      await base.stop?.(app);
      await dbShutdown();
    },
  };
}

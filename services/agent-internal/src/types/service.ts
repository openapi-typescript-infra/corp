import type { TableCache } from '@justtellme/cloud-sql';
import type { JTMServiceLocals } from '@justtellme/service';
import type { LangfuseClient } from '@langfuse/client';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { Temporal } from '@openapi-typescript-infra/temporal-worker';
import type { TemplateManager } from '@sesamecare-oss/ai-templating';
import type { Kysely, Selectable } from 'kysely';
import type { createClient } from 'redis';

import type { Clients, DB, Models } from '#src/generated/database.js';
import type { AiModels } from '#src/lib/ai.js';
import type { AgentInternalConfig } from './config.js';

export interface AgentInternalLocals extends JTMServiceLocals<AgentInternalConfig> {
  db: Kysely<DB>;
  roDb: Kysely<DB>;
  redis: ReturnType<typeof createClient>;
  langfuse: LangfuseClient;
  aiModels: AiModels;
  models: TableCache<Selectable<Models>, 'model_id', 'name'>;
  clients: TableCache<Selectable<Clients>, 'client_id', 'name'>;
  templates: TemplateManager;
  defaultTemporal?: Temporal;
}

export type AgentInternal = ServiceTypes<AgentInternalLocals>;

export type AgentInternalApi = Record<
  string,
  (req: AgentInternal['Request'], res: AgentInternal['Response']) => Promise<void>
>;

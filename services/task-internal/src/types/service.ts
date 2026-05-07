import type { TableCache } from '@justtellme/cloud-sql';
import type { HSRequestLocals, JTMServiceLocals } from '@justtellme/service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { Kysely, Selectable } from 'kysely';

import type { DB, TaskTypes } from '../generated/database.ts';
import type { operationHandlers } from '../generated/service/index.ts';

import type { TaskInternalConfigSchema } from './config.ts';

export interface TaskInternalLocals extends JTMServiceLocals<TaskInternalConfigSchema> {
  db: Kysely<DB>;
  tables: {
    taskTypes: TableCache<Selectable<TaskTypes>, 'task_type_id', 'name'>;
  };
}

export type TaskInternalRequestLocals = HSRequestLocals;

export type TaskInternal = ServiceTypes<TaskInternalLocals, TaskInternalRequestLocals>;

export type TaskInternalApi = operationHandlers<TaskInternalLocals, TaskInternalRequestLocals>;

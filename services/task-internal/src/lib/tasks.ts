import { ServiceError } from '@openapi-typescript-infra/service';
import type { Application } from 'express-serve-static-core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '#src/generated/database.ts';
import type { TaskInternalLocals } from '#src/types/service.ts';

export type EntityType = 'user' | 'agent' | 'service' | 'system';
export type TaskType = string;
export type TaskStatus = 'todo' | 'in-progress' | 'waiting' | 'blocked' | 'done' | 'skipped';

export interface CreateTaskContext {
  title?: string;
  summary?: string;
  submitter_type?: EntityType;
  submitter_uuid?: string;
  subject_type?: EntityType;
  subject_uuid?: string;
  extra_data?: Record<string, unknown>;
}

export interface CreateTaskTracking {
  status?: TaskStatus;
  priority?: number;
  due_at?: string;
  closed_at?: string;
}

export interface CreateTaskRequest {
  task_uuid?: string;
  task_type: TaskType;
  idempotency_id?: string;
  context?: CreateTaskContext;
  tracking?: CreateTaskTracking;
}

export interface TaskListQuery {
  task_uuid?: string;
  task_type?: TaskType;
  idempotency_id?: string;
  status?: TaskStatus | TaskStatus[];
  subject_type?: EntityType;
  subject_uuid?: string;
  submitter_type?: EntityType;
  submitter_uuid?: string;
  due_before?: string;
  page?: string;
  page_size?: string;
}

interface TaskRow {
  task_id: string;
  task_uuid: string;
  task_type: TaskType;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TaskContextRow {
  task_id: string;
  title: string | null;
  summary: string | null;
  submitter_type: EntityType | null;
  submitter_uuid: string | null;
  subject_type: EntityType | null;
  subject_uuid: string | null;
  extra_data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface TaskTrackingRow {
  task_id: string;
  status: TaskStatus;
  priority: number;
  due_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskResponse {
  task_uuid: string;
  task_type: TaskType;
  idempotency_id?: string;
  context?: {
    title?: string;
    summary?: string;
    submitter_type?: EntityType;
    submitter_uuid?: string;
    subject_type?: EntityType;
    subject_uuid?: string;
    extra_data?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  };
  tracking?: {
    status: TaskStatus;
    priority: number;
    due_at?: string;
    closed_at?: string;
    created_at: string;
    updated_at: string;
  };
  created_at: string;
  updated_at: string;
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  page: number;
  page_size: number;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toTaskResponse(
  task: TaskRow,
  context?: TaskContextRow,
  tracking?: TaskTrackingRow,
): TaskResponse {
  return {
    task_uuid: task.task_uuid,
    task_type: task.task_type,
    idempotency_id: task.idempotency_key ?? undefined,
    context: context
      ? {
          title: context.title ?? undefined,
          summary: context.summary ?? undefined,
          submitter_type: context.submitter_type ?? undefined,
          submitter_uuid: context.submitter_uuid ?? undefined,
          subject_type: context.subject_type ?? undefined,
          subject_uuid: context.subject_uuid ?? undefined,
          extra_data: context.extra_data,
          created_at: toIsoString(context.created_at),
          updated_at: toIsoString(context.updated_at),
        }
      : undefined,
    tracking: tracking
      ? {
          status: tracking.status,
          priority: tracking.priority,
          due_at: tracking.due_at ? toIsoString(tracking.due_at) : undefined,
          closed_at: tracking.closed_at ? toIsoString(tracking.closed_at) : undefined,
          created_at: toIsoString(tracking.created_at),
          updated_at: toIsoString(tracking.updated_at),
        }
      : undefined,
    created_at: toIsoString(task.created_at),
    updated_at: toIsoString(task.updated_at),
  };
}

async function hydrateTasks(db: Kysely<DB> | Transaction<DB>, taskRows: TaskRow[]) {
  if (taskRows.length === 0) {
    return [];
  }

  const taskIds = taskRows.map((row) => row.task_id);
  const [contexts, trackings] = await Promise.all([
    sql<TaskContextRow>`
      SELECT
        task_id,
        title,
        summary,
        submitter_type,
        submitter_uuid,
        subject_type,
        subject_uuid,
        extra_data,
        created_at,
        updated_at
      FROM task_context
      WHERE task_id = ANY(${taskIds}::bigint[])
        AND deleted_at IS NULL
    `.execute(db),
    sql<TaskTrackingRow>`
      SELECT
        task_id,
        status,
        priority,
        due_at,
        closed_at,
        created_at,
        updated_at
      FROM task_tracking
      WHERE task_id = ANY(${taskIds}::bigint[])
        AND deleted_at IS NULL
    `.execute(db),
  ]);

  const contextByTaskId = new Map(contexts.rows.map((row) => [String(row.task_id), row]));
  const trackingByTaskId = new Map(trackings.rows.map((row) => [String(row.task_id), row]));

  return taskRows.map((task) =>
    toTaskResponse(task, contextByTaskId.get(task.task_id), trackingByTaskId.get(task.task_id)),
  );
}

export async function getTaskByInternalId(db: Kysely<DB> | Transaction<DB>, taskId: string) {
  const task = await sql<TaskRow>`
    SELECT
      t.task_id,
      t.task_uuid,
      tt.name AS task_type,
      t.idempotency_key,
      t.created_at,
      t.updated_at
    FROM tasks t
    INNER JOIN task_types tt ON tt.task_type_id = t.task_type_id
    WHERE t.task_id = ${taskId}
      AND t.deleted_at IS NULL
  `.execute(db);

  return (await hydrateTasks(db, task.rows))[0];
}

export async function getTaskByUuid(db: Kysely<DB>, taskUuid: string) {
  const task = await sql<TaskRow>`
    SELECT
      t.task_id,
      t.task_uuid,
      tt.name AS task_type,
      t.idempotency_key,
      t.created_at,
      t.updated_at
    FROM tasks t
    INNER JOIN task_types tt ON tt.task_type_id = t.task_type_id
    WHERE t.task_uuid = ${taskUuid}::uuid
      AND t.deleted_at IS NULL
  `.execute(db);

  return (await hydrateTasks(db, task.rows))[0];
}

function numberParam(
  value: string | undefined,
  fallback: number,
  options: { min: number; max: number },
) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    return fallback;
  }

  return parsed;
}

function statusArray(status: TaskListQuery['status']) {
  if (!status) {
    return undefined;
  }
  return Array.isArray(status) ? status : [status];
}

export async function listTasks(app: Application<TaskInternalLocals>, query: TaskListQuery) {
  const page = numberParam(query.page, 1, { min: 1, max: 100_000 });
  const pageSize = numberParam(query.page_size, 50, { min: 1, max: 100 });
  const offset = (page - 1) * pageSize;
  const statuses = statusArray(query.status);
  const taskTypeId = query.task_type ? await resolveTaskTypeId(app, query.task_type) : undefined;
  const conditions = [sql`t.deleted_at IS NULL`];

  if (query.task_uuid) {
    conditions.push(sql`t.task_uuid = ${query.task_uuid}::uuid`);
  }
  if (taskTypeId) {
    conditions.push(sql`t.task_type_id = ${taskTypeId}`);
  }
  if (query.idempotency_id) {
    conditions.push(sql`t.idempotency_key = ${query.idempotency_id}`);
  }
  if (statuses?.length) {
    conditions.push(sql`tr.status = ANY(${statuses}::task_status_enum[])`);
  }
  if (query.subject_type) {
    conditions.push(sql`tc.subject_type = ${query.subject_type}::entity_type_enum`);
  }
  if (query.subject_uuid) {
    conditions.push(sql`tc.subject_uuid = ${query.subject_uuid}::uuid`);
  }
  if (query.submitter_type) {
    conditions.push(sql`tc.submitter_type = ${query.submitter_type}::entity_type_enum`);
  }
  if (query.submitter_uuid) {
    conditions.push(sql`tc.submitter_uuid = ${query.submitter_uuid}::uuid`);
  }
  if (query.due_before) {
    conditions.push(sql`tr.due_at <= ${query.due_before}::timestamptz`);
  }

  const tasks = await sql<TaskRow>`
    SELECT
      t.task_id,
      t.task_uuid,
      tt.name AS task_type,
      t.idempotency_key,
      t.created_at,
      t.updated_at
    FROM tasks t
    INNER JOIN task_types tt ON tt.task_type_id = t.task_type_id
    LEFT JOIN task_context tc ON tc.task_id = t.task_id AND tc.deleted_at IS NULL
    LEFT JOIN task_tracking tr ON tr.task_id = t.task_id AND tr.deleted_at IS NULL
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY t.created_at DESC, t.task_id DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `.execute(app.locals.db);

  return {
    tasks: await hydrateTasks(app.locals.db, tasks.rows),
    page,
    page_size: pageSize,
  } satisfies TaskListResponse;
}

export async function resolveTaskTypeId(app: Application<TaskInternalLocals>, taskType: string) {
  try {
    const [row] = await app.locals.tables.taskTypes.resolveIdsFromNames([taskType]);
    return row.task_type_id;
  } catch {
    throw new ServiceError(app, `Unknown task_type: ${taskType}`, { status: 400 });
  }
}

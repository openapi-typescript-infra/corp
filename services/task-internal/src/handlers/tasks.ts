import { ServiceError } from '@openapi-typescript-infra/service';
import type { Request, Response } from 'express';
import type { Application, ParamsDictionary, Query } from 'express-serve-static-core';
import { sql, type Transaction } from 'kysely';
import type { DB } from '#src/generated/database.ts';
import {
  type CreateTaskContext,
  type CreateTaskRequest,
  getTaskByInternalId,
  listTasks,
  resolveTaskTypeId,
  type TaskListQuery,
  type TaskListResponse,
  type TaskResponse,
} from '#src/lib/tasks.ts';
import type { TaskInternalLocals } from '#src/types/service.ts';

type CreateTaskExpressRequest = Omit<
  Request<ParamsDictionary, TaskResponse, CreateTaskRequest, Query, TaskInternalLocals>,
  'app'
> & {
  app: Application<TaskInternalLocals>;
};

type ListTasksExpressRequest = Omit<
  Request<ParamsDictionary, TaskListResponse, unknown, TaskListQuery, TaskInternalLocals>,
  'app'
> & {
  app: Application<TaskInternalLocals>;
};

function assertPairedFields(
  req: CreateTaskExpressRequest,
  context: CreateTaskContext,
  typeField: 'submitter_type' | 'subject_type',
  uuidField: 'submitter_uuid' | 'subject_uuid',
) {
  if ((context[typeField] === undefined) !== (context[uuidField] === undefined)) {
    throw new ServiceError(req.app, `${typeField} and ${uuidField} must be supplied together`, {
      status: 400,
    });
  }
}

export const GET = async (
  req: ListTasksExpressRequest,
  res: Response<TaskListResponse, TaskInternalLocals>,
) => {
  res.json(await listTasks(req.app, req.query));
};

export const POST = async (
  req: CreateTaskExpressRequest,
  res: Response<TaskResponse, TaskInternalLocals>,
) => {
  const { task_uuid, task_type, idempotency_id, context, tracking } = req.body;

  if (context) {
    assertPairedFields(req, context, 'submitter_type', 'submitter_uuid');
    assertPairedFields(req, context, 'subject_type', 'subject_uuid');
  }

  const db = req.app.locals.db;
  const taskTypeId = await resolveTaskTypeId(req.app, task_type);

  const result = await db.transaction().execute(async (trx: Transaction<DB>) => {
    const createdTask = await sql<{ task_id: string }>`
      INSERT INTO tasks (
        task_uuid,
        task_type_id,
        idempotency_key
      )
      VALUES (
        COALESCE(${task_uuid ?? null}::uuid, gen_random_uuid()),
        ${taskTypeId},
        ${idempotency_id ?? null}
      )
      ON CONFLICT DO NOTHING
      RETURNING task_id
    `.execute(trx);
    const taskId = createdTask.rows[0]?.task_id;

    if (!taskId) {
      const existingByIdempotency =
        idempotency_id === undefined
          ? undefined
          : (
              await sql<{ task_id: string }>`
        SELECT task_id
        FROM tasks
        WHERE task_type_id = ${taskTypeId}
          AND idempotency_key = ${idempotency_id}
          AND deleted_at IS NULL
      `.execute(trx)
            ).rows[0];
      const existingByUuid =
        task_uuid === undefined
          ? undefined
          : (
              await sql<{ task_id: string }>`
        SELECT task_id
        FROM tasks
        WHERE task_uuid = ${task_uuid}::uuid
          AND deleted_at IS NULL
      `.execute(trx)
            ).rows[0];
      const existingTaskId = existingByIdempotency?.task_id ?? existingByUuid?.task_id;

      if (!existingTaskId) {
        throw new ServiceError(req.app, 'Unable to create task', { status: 400 });
      }

      return {
        status: 409,
        task: await getTaskByInternalId(trx, existingTaskId),
      };
    }

    if (context) {
      await sql`
        INSERT INTO task_context (
          task_id,
          title,
          summary,
          submitter_type,
          submitter_uuid,
          subject_type,
          subject_uuid,
          extra_data
        )
        VALUES (
          ${taskId},
          ${context.title ?? null},
          ${context.summary ?? null},
          ${context.submitter_type ?? null}::entity_type_enum,
          ${context.submitter_uuid ?? null}::uuid,
          ${context.subject_type ?? null}::entity_type_enum,
          ${context.subject_uuid ?? null}::uuid,
          ${JSON.stringify(context.extra_data ?? {})}::jsonb
        )
      `.execute(trx);
    }

    if (tracking) {
      await sql`
        INSERT INTO task_tracking (
          task_id,
          status,
          priority,
          due_at,
          closed_at
        )
        VALUES (
          ${taskId},
          COALESCE(${tracking.status ?? null}::task_status_enum, 'todo'::task_status_enum),
          COALESCE(${tracking.priority ?? null}::smallint, 0),
          ${tracking.due_at ?? null}::timestamptz,
          ${tracking.closed_at ?? null}::timestamptz
        )
      `.execute(trx);
    }

    return {
      status: 201,
      task: await getTaskByInternalId(trx, taskId),
    };
  });

  if (!result.task) {
    throw new ServiceError(req.app, 'Unable to create task', { status: 400 });
  }

  res.status(result.status).json(result.task);
};

import { ServiceError } from '@openapi-typescript-infra/service';
import type { Request, Response } from 'express';
import type { Application, Query } from 'express-serve-static-core';
import { getTaskByUuid, type TaskResponse } from '#src/lib/tasks.ts';
import type { TaskInternalLocals } from '#src/types/service.ts';

interface TaskUuidParams {
  task_uuid: string;
}

type GetTaskExpressRequest = Omit<
  Request<TaskUuidParams, TaskResponse, unknown, Query, TaskInternalLocals>,
  'app'
> & {
  app: Application<TaskInternalLocals>;
};

export const GET = async (
  req: GetTaskExpressRequest,
  res: Response<TaskResponse, TaskInternalLocals>,
) => {
  const task = await getTaskByUuid(req.app.locals.db, req.params.task_uuid);

  if (!task) {
    throw new ServiceError(req.app, 'Task not found', { status: 404 });
  }

  res.json(task);
};

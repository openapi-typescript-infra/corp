import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { describe, expect } from 'vitest';
import type { components } from './generated/service/index.ts';
import { testWithApp } from './test.fixtures.ts';

function expectNoInternalIds(value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    expect(key).not.toBe('task_id');
    expect(key).not.toBe('task_type_id');
    expect(key).not.toBe('task_context_id');
    expect(key).not.toBe('task_tracking_id');
    expect(key).not.toBe('task_step_id');
    expectNoInternalIds(child);
  }
}

describe('tasks API', () => {
  testWithApp('creates and retrieves a task through the API', async ({ app, client }) => {
    await sql`
      INSERT INTO task_types (name, description)
      VALUES ('follow-up', 'A follow-up task')
      ON CONFLICT (name) DO NOTHING
    `.execute(app.locals.db);

    const taskUuid = randomUUID();
    const submitterUuid = randomUUID();
    const subjectUuid = randomUUID();
    const idempotencyId = `tasks-api-test-${randomUUID()}`;
    const dueAt = '2026-04-25T12:00:00.000Z';

    const createRequest: components['schemas']['CreateTaskRequest'] = {
      task_uuid: taskUuid,
      task_type: 'follow-up',
      idempotency_id: idempotencyId,
      context: {
        title: 'Follow up with user',
        summary: 'Verify the user completed the onboarding flow.',
        submitter_type: 'system',
        submitter_uuid: submitterUuid,
        subject_type: 'user',
        subject_uuid: subjectUuid,
        extra_data: {
          source: 'task-internal-api-test',
          attempt: 1,
        },
      },
      tracking: {
        status: 'todo',
        priority: 3,
        due_at: dueAt,
      },
    };

    const created = await client.POST('/tasks', { body: createRequest });
    expect(created.response.status).toBe(201);

    expect(created.data).toMatchObject({
      task_uuid: taskUuid,
      task_type: 'follow-up',
      idempotency_id: idempotencyId,
      context: {
        title: createRequest.context?.title,
        summary: createRequest.context?.summary,
        submitter_type: 'system',
        submitter_uuid: submitterUuid,
        subject_type: 'user',
        subject_uuid: subjectUuid,
        extra_data: createRequest.context?.extra_data,
      },
      tracking: {
        status: 'todo',
        priority: 3,
        due_at: dueAt,
      },
    });
    expect(created.data?.created_at).toBeDefined();
    expect(created.data?.updated_at).toBeDefined();
    expect(created.data?.context?.created_at).toBeDefined();
    expect(created.data?.tracking?.created_at).toBeDefined();
    expectNoInternalIds(created.data);

    const duplicate = await client.POST('/tasks', { body: createRequest });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.error).toMatchObject({
      task_uuid: taskUuid,
      task_type: 'follow-up',
      idempotency_id: idempotencyId,
    });
    expectNoInternalIds(duplicate.error);

    const byUuid = await client.GET('/tasks/{task_uuid}', {
      params: { path: { task_uuid: taskUuid } },
    });
    expect(byUuid.response.status).toBe(200);
    expect(byUuid.data).toMatchObject(created.data ?? {});
    expectNoInternalIds(byUuid.data);

    const byIdempotency = await client.GET('/tasks', {
      params: {
        query: {
          task_type: 'follow-up',
          idempotency_id: idempotencyId,
        },
      },
    });
    expect(byIdempotency.response.status).toBe(200);
    expect(byIdempotency.data).toMatchObject({
      page: 1,
      page_size: 50,
      tasks: [
        {
          task_uuid: taskUuid,
          task_type: 'follow-up',
          idempotency_id: idempotencyId,
        },
      ],
    });
    expect(byIdempotency.data?.tasks).toHaveLength(1);
    expectNoInternalIds(byIdempotency.data);
  });
});

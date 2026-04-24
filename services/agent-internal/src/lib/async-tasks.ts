import type { AsyncTaskInfo } from '@justtellme/tools';
import type { AgentInternal } from '#src/types/index.js';

/**
 * Derive a Temporal workflow ID for an async task within a conversation.
 */
export function getAsyncTaskWorkflowId(conversationId: string, jobId: string) {
  return `async-task:${conversationId}:${jobId}`;
}

/**
 * Query the Temporal workflow for an async task's status.
 * Falls back to a 'running' status if the workflow is not found or not available.
 */
export async function queryAsyncTaskWorkflow(
  app: AgentInternal['App'],
  conversationId: string,
  jobId: string,
): Promise<AsyncTaskInfo> {
  if (!app.locals.defaultTemporal) {
    return { jobId, type: 'unknown', status: 'running' };
  }

  try {
    const workflowId = getAsyncTaskWorkflowId(conversationId, jobId);
    const handle = app.locals.defaultTemporal.client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    if (description.status?.name === 'COMPLETED') {
      const result = await handle.result();
      return { jobId, type: 'unknown', status: 'completed', result };
    }

    if (description.status?.name === 'FAILED') {
      return {
        jobId,
        type: 'unknown',
        status: 'errored',
        error: { message: 'Async task workflow failed' },
      };
    }

    return { jobId, type: 'unknown', status: 'running' };
  } catch {
    return { jobId, type: 'unknown', status: 'running' };
  }
}

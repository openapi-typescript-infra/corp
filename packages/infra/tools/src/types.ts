import type { AsyncTaskInfo, AsyncTaskRequest, QueuedAsyncTask } from './async-task.js';

/**
 * Session available inside {@link ToolDefinition.processClientResult}.
 *
 * This is a narrowed view of {@link ToolUseSession} that omits
 * `queueAsyncTask` because processClientResult runs in the HTTP handler
 * (outside async task contexts) where async task queueing is not available.
 */
export type ProcessClientResultSession = Omit<ToolUseSession, 'queueAsyncTask'>;

/**
 * Contextual session passed to tools during execution.
 *
 * Hosts should extend this interface (via declaration merging or a
 * wrapper) to add application-specific properties such as datasource
 * clients, authenticated principals, or dataloaders.
 *
 * @example
 * ```ts
 * declare module '@justtellme/tools' {
 *   interface ToolUseSession {
 *     app: MyExpressApp;
 *     principal?: MyPrincipal;
 *     patient_uuid?: string;
 *   }
 * }
 * ```
 */
export interface ToolUseSession {
  /** Role of the current user in this session */
  role: string;

  /** Queue an async backend job. Only present when the host supplies an AsyncTaskProvider. */
  queueAsyncTask(request: AsyncTaskRequest): Promise<QueuedAsyncTask>;
  /** Check status / retrieve result of a previously queued async task. */
  getAsyncTask(jobId: string): Promise<AsyncTaskInfo>;
}

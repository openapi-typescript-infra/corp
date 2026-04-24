// ── Task request types ──────────────────────────────────────────────

/**
 * Base interface for async task requests. Application-specific task
 * types should extend this interface.
 */
export interface AsyncTaskRequest {
  jobId: string;
  type: string;
  [key: string]: unknown;
}

// ── Task results ───────────────────────────────────────────────────

export type AsyncTaskStatus = 'running' | 'completed' | 'errored';

export interface AsyncTaskInfo<T = unknown> {
  jobId: string;
  type: string;
  status: AsyncTaskStatus;
  /** Present when status is 'completed'. */
  result?: T;
  /** Present when status is 'errored'. */
  error?: { message: string; code?: string };
}

export interface QueuedAsyncTask {
  jobId: string;
  type: string;
}

// ── Provider interface (hosts implement this) ──────────────────────

export interface AsyncTaskProvider {
  queue(request: AsyncTaskRequest): Promise<QueuedAsyncTask>;
  get(jobId: string): Promise<AsyncTaskInfo>;
}

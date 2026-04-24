import type { AsyncTaskProvider, AsyncTaskRequest } from './async-task.js';
import type { ToolUseSession } from './types.js';

/**
 * Create a minimal {@link ToolUseSession}.
 *
 * Hosts that need richer sessions (datasource clients, principals, etc.)
 * should extend this with their own factory or augment the
 * {@link ToolUseSession} interface via declaration merging.
 */
export function createToolUseSession(options: {
  role: string;
  asyncTaskProvider?: AsyncTaskProvider;
}): ToolUseSession {
  const provider = options.asyncTaskProvider;
  return {
    role: options.role,
    queueAsyncTask(request: AsyncTaskRequest) {
      if (!provider) {
        throw new Error('No async task provider configured');
      }
      return provider.queue(request);
    },
    getAsyncTask(jobId: string) {
      if (!provider) {
        throw new Error('No async task provider configured');
      }
      return provider.get(jobId);
    },
  };
}

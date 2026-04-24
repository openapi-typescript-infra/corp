import type { AuthPrincipal } from '@justtellme/auth-token';
import type {
  AsyncTaskInfo,
  AsyncTaskProvider,
  QueuedAsyncTask,
  ToolUseSession,
} from '@justtellme/tools';
import { getTools } from '@justtellme/tools';
import type { Tool } from 'ai';

export type ToolRegistry = Record<string, Tool>;

export interface ToolSession {
  role: ToolUseSession['role'];
  principal?: AuthPrincipal;
}

export const noopAsyncTaskProvider: AsyncTaskProvider = {
  async queue(): Promise<QueuedAsyncTask> {
    throw new Error('Async task queueing is not available in this context');
  },
  async get(jobId: string): Promise<AsyncTaskInfo> {
    return { jobId, type: 'unknown', status: 'running' };
  },
};

export function createToolRegistryFromSession(session: ToolUseSession): ToolRegistry {
  return getTools(session) as ToolRegistry;
}

export function getAvailableToolNames(registry: ToolRegistry) {
  return Object.keys(registry as Record<string, unknown>).sort();
}

export function assertEnabledToolsAreAvailable(
  registry: ToolRegistry,
  enabledTools: readonly string[],
) {
  const unknownTools = enabledTools.filter((toolName) => !(toolName in registry));

  if (unknownTools.length > 0) {
    throw new Error(`Unknown tools configured for conversation: ${unknownTools.join(', ')}`);
  }
}

export function createInteractiveTools(
  registry: ToolRegistry,
  enabledTools?: readonly string[],
  extraTools?: Record<string, unknown>,
): Record<string, unknown> {
  const extra = extraTools ?? {};

  if (enabledTools === undefined) {
    return { ...registry, ...extra };
  }

  const registryToolNames = enabledTools.filter((name) => !(name in extra));
  assertEnabledToolsAreAvailable(registry, registryToolNames);

  const registryTools: Partial<ToolRegistry> = {};
  for (const toolName of registryToolNames) {
    registryTools[toolName] = registry[toolName];
  }

  return { ...registryTools, ...extra } satisfies Record<string, unknown>;
}

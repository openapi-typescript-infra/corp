import type { InferToolInput, InferToolOutput, Tool, ToolExecutionOptions } from 'ai';

import type { ToolDefinition } from './tool.js';
import { getRegistry } from './tool.js';
import type { ProcessClientResultSession, ToolUseSession } from './types.js';

function isAsyncIterable<T>(value: T | AsyncIterable<T>): value is AsyncIterable<T> {
  return value != null && typeof value === 'object' && Symbol.asyncIterator in value;
}

/**
 * Execute a hydrated Tool directly.
 */
export async function executeTool<TOOL extends Tool>(
  tool: TOOL,
  input: InferToolInput<TOOL>,
  options?: Partial<ToolExecutionOptions>,
): Promise<InferToolOutput<TOOL>>;

/**
 * Execute a ToolDefinition by hydrating it with the given session first.
 */
export async function executeTool<TOOL extends Tool>(
  definition: ToolDefinition,
  session: ToolUseSession,
  input: InferToolInput<TOOL>,
  options?: Partial<ToolExecutionOptions>,
): Promise<InferToolOutput<TOOL>>;

export async function executeTool(
  toolOrDef: Tool | ToolDefinition,
  inputOrSession: unknown,
  inputOrOptions?: unknown,
  maybeOptions?: Partial<ToolExecutionOptions>,
): Promise<unknown> {
  let resolvedTool: Tool;
  let input: unknown;
  let options: Partial<ToolExecutionOptions> | undefined;

  if ('hydrate' in toolOrDef) {
    // ToolDefinition overload
    resolvedTool = toolOrDef.hydrate(inputOrSession as ToolUseSession);
    input = inputOrOptions;
    options = maybeOptions;
  } else {
    // Direct Tool overload
    resolvedTool = toolOrDef;
    input = inputOrSession;
    options = inputOrOptions as Partial<ToolExecutionOptions> | undefined;
  }

  if (!resolvedTool.execute) {
    throw new Error('Tool is not executable');
  }

  const result = await resolvedTool.execute(input, {
    messages: [],
    toolCallId: 'test-tool-call',
    ...options,
  });

  if (!isAsyncIterable(result)) {
    return result;
  }

  let finalResult: unknown;
  for await (const output of result) {
    finalResult = output;
  }

  if (finalResult === undefined) {
    throw new Error('Tool returned an empty async iterable');
  }

  return finalResult;
}

/**
 * Process a client's response to a {@link returnToClient} deferral.
 *
 * If the tool defines a `processClientResult` callback, it is invoked with the
 * client's response. The callback may:
 * - Return a plain result -> the deferral round-trip is complete.
 * - Return another `returnToClient(...)` -> another round of client interaction is needed.
 *
 * If the tool has no `processClientResult`, the client result is returned as-is
 * (preserving the existing single-round behaviour).
 */
export async function processToolClientResult(
  toolName: string,
  session: ProcessClientResultSession,
  clientResult: unknown,
  options?: Partial<ToolExecutionOptions>,
): Promise<unknown> {
  const definition = getRegistry().get(toolName);
  if (!definition?.processClientResult) {
    return clientResult;
  }
  return definition.processClientResult(session, clientResult, {
    messages: [],
    toolCallId: 'tool-call',
    ...options,
  });
}

/**
 * Process a stored tool-result before the model sees it.
 *
 * Called from the host with the full {@link ToolUseSession}, so the callback
 * may queue async tasks or perform other server-side work.
 *
 * If the tool defines a `processToolResult` callback, it is invoked with the
 * stored result. The callback may:
 * - Return a plain result -> replaces the stored content for model consumption.
 * - Return a `returnToClient(...)` -> halts the turn (model does not run).
 *
 * If the tool has no `processToolResult`, the stored result is returned as-is.
 */
export async function processStoredToolResult(
  toolName: string,
  session: ToolUseSession,
  storedResult: unknown,
  options?: Partial<ToolExecutionOptions>,
): Promise<unknown> {
  const definition = getRegistry().get(toolName);
  if (!definition?.processToolResult) {
    return storedResult;
  }
  return definition.processToolResult(session, storedResult, {
    messages: [],
    toolCallId: 'tool-call',
    ...options,
  });
}

import type { FlexibleSchema } from '@ai-sdk/provider-utils';
import { tool as aiTool, type Tool, type ToolExecutionOptions } from 'ai';

import type { ProcessClientResultSession, ToolUseSession } from './types.js';

export type ToolTag = string;

/**
 * The ai-sdk's `tool()` uses complex conditional types (NeverOptional, FlexibleSchema)
 * that cannot be satisfied with `unknown` — the overload resolution and type-level
 * arithmetic require `any` to bridge between our session-injected signatures and the
 * ai-sdk's expected shapes. This is confined to the implementation body; callers get
 * full type inference from the overload signatures above.
 */
// biome-ignore lint/suspicious/noExplicitAny: required by ai-sdk type bridging
type ToolAny = any;

export interface ToolDefinition<INPUT = ToolAny, OUTPUT = ToolAny> {
  readonly name: string;
  readonly tags: readonly ToolTag[];
  /**
   * Zod schema for the tool input. Exposed on the definition (in addition to
   * being passed to the ai-sdk via `hydrate`) so the OpenAPI codegen can
   * derive `<X>Input.yaml` from the same source of truth.
   */
  readonly inputSchema: FlexibleSchema<INPUT>;
  /**
   * Optional Zod schema for the tool output. Same rationale as inputSchema —
   * drives the generated `<X>Output.yaml`.
   */
  readonly outputSchema?: FlexibleSchema<OUTPUT>;
  canUse(session: ToolUseSession): boolean;
  hydrate(session: ToolUseSession): Tool<INPUT, OUTPUT>;
  /**
   * Optional callback invoked when a client responds to a {@link returnToClient}
   * deferral, or with `undefined` when the client did not respond (e.g. the user
   * sent a new message instead of answering the tool's question).
   *
   * Return a plain result to accept the client's response (it will be fed to the LLM).
   * Return another `returnToClient(...)` to start another round of client interaction.
   * The consumer loop should keep calling this until the result is no longer a
   * `returnToClient` sentinel.
   *
   * Tools without this callback use the default behaviour: the client's response is
   * accepted as-is and passed straight to the LLM.
   */
  processClientResult?(
    session: ProcessClientResultSession,
    clientResult: unknown,
    options: ToolExecutionOptions,
  ): OUTPUT | PromiseLike<OUTPUT>;

  /**
   * Optional callback invoked when the host reads a stored tool-result
   * message before feeding it to the model.
   *
   * Unlike {@link processClientResult} (which runs in the HTTP handler),
   * this callback receives the full {@link ToolUseSession} including
   * `queueAsyncTask`, making it the right place for server-side side-effects
   * like starting async jobs.
   *
   * Return a plain result to replace the stored content for model consumption.
   * Return another `returnToClient(...)` to halt the turn and re-defer to the
   * client without running the model.
   */
  processToolResult?(
    session: ToolUseSession,
    storedResult: unknown,
    options: ToolExecutionOptions,
  ): OUTPUT | PromiseLike<OUTPUT>;
}

// ── registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, ToolDefinition>();

export function getRegistry(): ReadonlyMap<string, ToolDefinition> {
  return registry;
}

export function getTools(session: ToolUseSession): Record<string, Tool> {
  const result: Record<string, Tool> = {};
  for (const [name, def] of registry) {
    if (def.canUse(session)) {
      result[name] = def.hydrate(session);
    }
  }
  return result;
}

export function getToolByName(session: ToolUseSession, name: string): Tool | undefined {
  const def = registry.get(name);
  if (!def?.canUse(session)) {
    return undefined;
  }
  return def.hydrate(session);
}

export function getToolsByTag(session: ToolUseSession, tags: ToolTag[]): Record<string, Tool> {
  const tagSet = new Set(tags);
  const result: Record<string, Tool> = {};
  for (const [name, def] of registry) {
    if (def.canUse(session) && def.tags.some((t) => tagSet.has(t))) {
      result[name] = def.hydrate(session);
    }
  }
  return result;
}

// ── config types ────────────────────────────────────────────────────────────

interface ToolConfigBase {
  name: string;
  tags: ToolTag[];
  canUse?: (session: ToolUseSession) => boolean;
  description?: string;
}

interface ToolConfigWithExecuteAndOutput<INPUT, OUTPUT> extends ToolConfigBase {
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
  execute: (
    session: ToolUseSession,
    input: INPUT,
    options: ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT> | AsyncIterable<OUTPUT>;
  /** Process a client response after a {@link returnToClient} deferral. See {@link ToolDefinition.processClientResult}. */
  processClientResult?: (
    session: ProcessClientResultSession,
    clientResult: unknown,
    options: ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT>;
  /** Process a stored tool result before the model sees it. See {@link ToolDefinition.processToolResult}. */
  processToolResult?: (
    session: ToolUseSession,
    storedResult: unknown,
    options: ToolExecutionOptions,
  ) => OUTPUT | PromiseLike<OUTPUT>;
}

interface ToolConfigClientOnly<INPUT, OUTPUT> extends ToolConfigBase {
  inputSchema: FlexibleSchema<INPUT>;
  /**
   * Schema for the value the client UI returns. Not enforced at runtime here
   * — the client is the source of the value — but required so the generated
   * OpenAPI has a consistent wire-format shape (every AgentToolResponse<X>
   * variant has a `complex_result` field). Use `z.object({})` if the tool
   * truly returns no structured data.
   */
  outputSchema: FlexibleSchema<OUTPUT>;
  execute?: undefined;
  /** Process a client response (or `undefined` if the client did not respond). See {@link ToolDefinition.processClientResult}. */
  processClientResult?: (
    session: ProcessClientResultSession,
    clientResult: unknown,
    options: ToolExecutionOptions,
  ) => unknown | PromiseLike<unknown>;
}

// ── implementation helpers ──────────────────────────────────────────────────

/** Bridges our untyped config into ai-sdk's `tool()` without per-call lint suppressions. */
// biome-ignore lint/suspicious/noExplicitAny: required by ai-sdk type bridging
const createAiTool = (config: ToolAny): Tool => aiTool(config as any);

// ── overloads ───────────────────────────────────────────────────────────────

/** Tool with execute and explicit outputSchema — OUTPUT inferred from schema. */
export function tool<INPUT, OUTPUT>(
  config: ToolConfigWithExecuteAndOutput<INPUT, OUTPUT>,
): ToolDefinition<INPUT, OUTPUT>;

/** Client-only tool — no execute, no session injection. */
export function tool<INPUT, OUTPUT>(
  config: ToolConfigClientOnly<INPUT, OUTPUT>,
): ToolDefinition<INPUT, OUTPUT>;

// ── implementation ──────────────────────────────────────────────────────────

export function tool(config: ToolAny): ToolDefinition {
  const {
    name,
    tags,
    canUse: canUseFn,
    execute: sessionExecute,
    processClientResult: sessionProcessClientResult,
    processToolResult: sessionProcessToolResult,
    ...toolConfig
  } = config as {
    name: string;
    tags: ToolTag[];
    canUse?: (session: ToolUseSession) => boolean;
    description?: string;
    inputSchema: FlexibleSchema<ToolAny>;
    outputSchema?: FlexibleSchema<ToolAny>;
    execute?: (session: ToolUseSession, input: ToolAny, options: ToolExecutionOptions) => ToolAny;
    processClientResult?: (
      session: ProcessClientResultSession,
      clientResult: unknown,
      options: ToolExecutionOptions,
    ) => ToolAny;
    processToolResult?: (
      session: ToolUseSession,
      storedResult: unknown,
      options: ToolExecutionOptions,
    ) => ToolAny;
  };

  if (registry.has(name)) {
    throw new Error(`Duplicate tool registration: "${name}"`);
  }

  const definition: ToolDefinition = {
    name,
    tags,
    inputSchema: toolConfig.inputSchema,
    ...(toolConfig.outputSchema !== undefined && { outputSchema: toolConfig.outputSchema }),
    canUse: canUseFn ?? (() => true),
    hydrate(session: ToolUseSession) {
      if (!sessionExecute) {
        // Client-only tool — no execute, pass through to ai-sdk as-is
        return createAiTool(toolConfig);
      }
      return createAiTool({
        ...toolConfig,
        execute: (input: ToolAny, options: ToolExecutionOptions) =>
          sessionExecute(session, input, options),
      });
    },
    ...(sessionProcessClientResult && {
      processClientResult: (
        session: ProcessClientResultSession,
        clientResult: unknown,
        options: ToolExecutionOptions,
      ) => sessionProcessClientResult(session, clientResult, options),
    }),
    ...(sessionProcessToolResult && {
      processToolResult: (
        session: ToolUseSession,
        storedResult: unknown,
        options: ToolExecutionOptions,
      ) => sessionProcessToolResult(session, storedResult, options),
    }),
  };

  registry.set(name, definition);
  return definition;
}

// Re-export for convenience so tool files don't need to import from 'ai'
export type { Tool, ToolExecutionOptions };

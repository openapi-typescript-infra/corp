import { AuthPrincipal } from '@justtellme/auth-token';
import type {
  AsyncTaskInfo,
  AsyncTaskRequest,
  QueuedAsyncTask,
  ToolUseSession,
} from '@justtellme/tools';
import { isReturnToClient, processStoredToolResult } from '@justtellme/tools';
import { ToolLoopAgent, type ToolSet } from 'ai';
import type { JsonObject } from '#src/generated/database.js';
import {
  addMessages,
  getConversationForTurn,
  getConversationMessages,
  getTurn,
  getTurnMessages,
  getTurnStartTools,
  updateTurnStatus,
} from '#src/lib/db.js';
import {
  publishTurnStreamDone,
  publishTurnStreamError,
  publishTurnStreamEvent,
} from '#src/lib/redis.js';
import type { AgentInternal } from '#src/types/index.js';
import { injectedToolCallsToStoredMessages } from '../context.js';
import { findConversationDefinition } from '../conversation-definitions.js';
import { summarizeErrorForLogs } from '../errors.js';
import { getConversationId, getTurnId } from '../ids.js';
import { createAgentToolUseSession } from '../tool-session.js';
import { extractToolCallsFromMessages } from '../tools/requests.js';
import { diffToolNames } from '../tools/state.js';
import { hasReturnToClient, resolveReturnToClientStatus } from '../tools/stop.js';
import { toSessionModelMessages, toStoredAgentMessages } from './messages.js';
import { createSkillTools, extractInvokedSkillNames, type SkillSpec } from './skills.js';
import {
  createInteractiveTools,
  createToolRegistryFromSession,
  getAvailableToolNames,
  type ToolRegistry,
  type ToolSession,
} from './tools.js';
import type {
  RunAgentLoopInput,
  RunAgentLoopResult,
  RunTurnInput,
  SessionAgent,
  SessionResponseMessage,
  StoredConversationMessage,
  TurnResult,
} from './types.js';

class TurnExecutionError extends Error {
  constructor(
    message: string,
    readonly diagnostics: JsonObject,
  ) {
    super(message);
    this.name = 'TurnExecutionError';
  }
}

export function resolveDefaultModelName(app: AgentInternal['App']) {
  const configuredDefault = app.locals.config.defaultModel;
  if (configuredDefault) {
    return configuredDefault;
  }

  const modelNames = Object.keys(app.locals.config.models ?? {});
  if (modelNames.length === 0) {
    throw new Error('No AI models are configured');
  }

  return modelNames[0];
}

export function createSessionAgent(
  app: AgentInternal['App'],
  registry: ToolRegistry,
  options?: {
    enabledTools?: readonly string[];
    skills?: SkillSpec[];
    alreadyInvokedSkills?: ReadonlySet<string>;
    instructions?: string;
    modelName?: string;
    telemetry?: {
      functionId: string;
      metadata: Record<string, string>;
    };
  },
) {
  const modelName = options?.modelName ?? resolveDefaultModelName(app);
  const modelSpec = app.locals.config.models?.[modelName];
  const skills = options?.skills ?? [];

  const activatedSkillTools = new Set<string>();

  const skillTools = skills.length
    ? createSkillTools(skills, options?.alreadyInvokedSkills, (skillName) => {
        const spec = skills.find((s) => s.name === skillName);
        for (const toolName of spec?.tools ?? []) {
          activatedSkillTools.add(toolName);
        }
      })
    : undefined;

  const allSkillEnabledToolNames = skills.flatMap((s) => s.tools ?? []);
  const expandedEnabledTools = options?.enabledTools
    ? [...new Set([...options.enabledTools, ...allSkillEnabledToolNames])]
    : undefined;

  const tools = createInteractiveTools(registry, expandedEnabledTools, skillTools);

  const toolSet = tools as ToolSet;

  const initialActiveTools = options?.enabledTools
    ? Object.keys(toolSet).filter(
        (name) =>
          (options.enabledTools as readonly string[]).includes(name) || name in (skillTools ?? {}),
      )
    : undefined;

  return {
    agent: new ToolLoopAgent({
      id: `agent-turn:${modelName}`,
      model: app.locals.aiModels.resolve(modelName),
      ...(options?.instructions ? { instructions: options.instructions } : {}),
      temperature: modelSpec?.temperature,
      tools: toolSet,
      ...(initialActiveTools ? { activeTools: initialActiveTools } : {}),
      stopWhen: [hasReturnToClient],
      prepareStep: () => {
        if (activatedSkillTools.size === 0) {
          return undefined;
        }
        const expanded = [
          ...(options?.enabledTools ?? Object.keys(toolSet)),
          ...Object.keys(skillTools ?? {}),
          ...activatedSkillTools,
        ];
        return { activeTools: [...new Set(expanded)] };
      },
      ...(options?.telemetry
        ? {
            experimental_telemetry: {
              isEnabled: true,
              recordInputs: true,
              recordOutputs: true,
              functionId: options.telemetry.functionId,
              metadata: options.telemetry.metadata,
            },
          }
        : {}),
    }) as SessionAgent,
    modelName,
  };
}

export async function runAgentLoop({
  agent,
  messages,
  onTextDelta,
  onToolCall,
  onToolResult,
}: RunAgentLoopInput): Promise<RunAgentLoopResult> {
  const startedAt = Date.now();
  const result = await agent.stream({ messages });

  let text = '';
  const streamErrors: unknown[] = [];
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
      await onTextDelta?.(part.text);
    } else if (part.type === 'tool-call') {
      await onToolCall?.({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input as Record<string, unknown>,
      });
    } else if (part.type === 'tool-result') {
      await onToolResult?.({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: part.output,
      });
    } else if (part.type === 'error') {
      streamErrors.push(part.error);
    }
  }

  let response: Awaited<typeof result.response>;
  let steps: Awaited<typeof result.steps>;
  try {
    [response, steps] = await Promise.all([result.response, result.steps]);
  } catch (error) {
    if (streamErrors.length > 0) {
      const cause = streamErrors[0];
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      const wrapper = new Error(`Stream failed: ${causeMessage}`, {
        cause: cause instanceof Error ? cause : undefined,
      });
      wrapper.name = 'StreamError';
      throw wrapper;
    }
    throw error;
  }
  const lastStep = steps.at(-1);

  return {
    text,
    responseMessages: response.messages,
    finishReason: lastStep?.finishReason ?? 'stop',
    rawFinishReason: lastStep?.rawFinishReason,
    toolResults: lastStep?.toolResults ?? [],
    totalLatencyMs: Date.now() - startedAt,
    inputTokens: lastStep?.usage.inputTokens,
    outputTokens: lastStep?.usage.outputTokens,
    warnings: lastStep?.warnings,
    response: lastStep?.response,
    providerMetadata: lastStep?.providerMetadata,
  };
}

interface ToolResultHalt {
  toolCalls: { id: string; name: string; input: Record<string, unknown>; response?: unknown }[];
}

async function processCurrentTurnToolResults(
  session: ToolUseSession,
  allMessages: StoredConversationMessage[],
  turnMessages: StoredConversationMessage[],
): Promise<ToolResultHalt | null> {
  const currentToolResults = turnMessages.filter(
    (msg) => msg.role === 'tool-result' && msg.toolCallId && msg.extraData?.toolName,
  );

  if (currentToolResults.length === 0) {
    return null;
  }

  const haltedToolCalls: ToolResultHalt['toolCalls'] = [];

  for (const turnMsg of currentToolResults) {
    const toolName = String(turnMsg.extraData?.toolName);
    const toolCallId = turnMsg.toolCallId ?? '';
    const processed = await processStoredToolResult(toolName, session, turnMsg.content, {
      toolCallId,
      messages: [],
    });

    if (isReturnToClient(processed)) {
      haltedToolCalls.push({
        id: toolCallId,
        name: toolName,
        input: {},
        response: processed,
      });
    }

    const idx = allMessages.findIndex(
      (msg) => msg.role === 'tool-result' && msg.toolCallId === turnMsg.toolCallId,
    );
    if (idx !== -1) {
      allMessages[idx] = { ...allMessages[idx], content: processed };
    }
  }

  return haltedToolCalls.length > 0 ? { toolCalls: haltedToolCalls } : null;
}

export async function runStoredTurn(
  app: AgentInternal['App'],
  input: RunTurnInput,
): Promise<TurnResult> {
  const [conversation, turn, startTools] = await Promise.all([
    getConversationForTurn(app, input.turnId),
    getTurn(app, input.turnId),
    getTurnStartTools(app, input.turnId),
  ]);

  if (!conversation || !turn || !startTools) {
    throw new Error(`Conversation not found for turn: ${input.turnId}`);
  }

  const conversationType = extractConversationType(conversation.extraData);
  const conversationDefinition = findConversationDefinition(conversationType);
  const shouldStream = input.response === 'stream';
  await updateTurnStatus(app, input.turnId, shouldStream ? 'streaming' : 'pending');

  if (shouldStream) {
    await publishTurnStreamEvent(app, input.turnId, {
      type: 'start',
      turnId: getTurnId(input.turnId),
    });
  }

  const promptMetadata = extractPromptMetadata(conversation.extraData);
  let modelName: string | undefined;

  try {
    const storedMessages = await getConversationMessages(app, conversation.conversationId);
    const toolSession: ToolSession = conversationDefinition?.toolSession ?? { role: 'user' };

    const queuedTasks: AsyncTaskRequest[] = [];
    const asyncTaskProvider = {
      async queue(request: AsyncTaskRequest): Promise<QueuedAsyncTask> {
        queuedTasks.push(request);
        return { jobId: request.jobId, type: request.type };
      },
      async get(jobId: string): Promise<AsyncTaskInfo> {
        const preFetched = input.asyncTaskStatuses?.[jobId];
        return preFetched ?? { jobId, type: 'unknown', status: 'running' };
      },
    };

    const principal = input.identityToken ? new AuthPrincipal(input.identityToken) : undefined;

    const toolUseSession = createAgentToolUseSession(app, asyncTaskProvider, principal, {
      role: toolSession.role,
    });

    // Process tool-result messages through processToolResult callbacks
    const turnMessages = await getTurnMessages(app, input.turnId);
    const haltResult = await processCurrentTurnToolResults(
      toolUseSession,
      storedMessages,
      turnMessages,
    );
    if (haltResult) {
      const diagnostics: JsonObject = {
        prompt: promptMetadata,
        haltedByProcessToolResult: true,
      };

      await updateTurnStatus(app, input.turnId, 'input-required', {
        model: conversation.model ?? undefined,
        finishReason: 'tool-calls',
        extraData: { diagnostics },
      });

      if (shouldStream) {
        await publishTurnStreamEvent(app, input.turnId, {
          type: 'finish',
          finishReason: 'tool-calls',
          text: '',
          toolCalls: haltResult.toolCalls,
        });
        await publishTurnStreamDone(app, input.turnId);
      }

      return {
        turnId: input.turnId,
        status: 'input-required' as const,
        messageIds: [],
        queuedTasks: queuedTasks.length > 0 ? [...queuedTasks] : undefined,
        text: '',
        finishReason: 'tool-calls' as const,
        totalLatencyMs: 0,
        diagnostics,
      };
    }

    // --- Directed turn short-circuit (canned responses) ---
    const directedTurn = await conversationDefinition?.resolveDirectedTurn?.({
      allMessages: storedMessages,
      turnMessages,
      conversationExtraData: conversation.extraData ?? {},
      session: toolUseSession,
    });

    if (directedTurn && (directedTurn.text || directedTurn.toolCalls?.length)) {
      const messagesToStore: Parameters<typeof addMessages>[2] = [];

      if (directedTurn.text) {
        messagesToStore.push({ role: 'assistant', content: directedTurn.text });
      }
      if (directedTurn.toolCalls?.length) {
        messagesToStore.push(...injectedToolCallsToStoredMessages(directedTurn.toolCalls));
      }

      const persistedMessages = await addMessages(app, input.turnId, messagesToStore);
      const hasToolCalls = Boolean(directedTurn.toolCalls?.length);
      const directedStatus = hasToolCalls ? ('input-required' as const) : ('complete' as const);
      const directedFinishReason = hasToolCalls ? ('tool-calls' as const) : ('stop' as const);
      const diagnostics: JsonObject = { prompt: promptMetadata, directedTurn: true };

      await updateTurnStatus(app, input.turnId, directedStatus, {
        model: conversation.model ?? undefined,
        finishReason: directedFinishReason,
        extraData: { diagnostics },
      });

      if (shouldStream) {
        if (directedTurn.text) {
          await publishTurnStreamEvent(app, input.turnId, {
            type: 'text-delta',
            delta: directedTurn.text,
          });
        }
        if (directedTurn.toolCalls?.length) {
          for (const tc of directedTurn.toolCalls) {
            await publishTurnStreamEvent(app, input.turnId, {
              type: 'tool-call',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.args,
            });
          }
        }
        await publishTurnStreamEvent(app, input.turnId, {
          type: 'finish',
          finishReason: directedFinishReason,
          text: directedTurn.text ?? '',
        });
        await publishTurnStreamDone(app, input.turnId);
      }

      if (hasToolCalls) {
        return {
          turnId: input.turnId,
          status: 'input-required' as const,
          messageIds: persistedMessages.map((m) => m.messageId),
          queuedTasks: queuedTasks.length > 0 ? [...queuedTasks] : undefined,
          text: directedTurn.text ?? '',
          finishReason: 'tool-calls' as const,
          totalLatencyMs: 0,
          diagnostics,
        };
      }

      return {
        turnId: input.turnId,
        status: 'complete' as const,
        messageIds: persistedMessages.map((m) => m.messageId),
        text: directedTurn.text ?? '',
        finishReason: 'stop' as const,
        totalLatencyMs: 0,
        diagnostics,
      };
    }

    // --- Normal model-driven turn ---
    const requestMessages = toSessionModelMessages(storedMessages, {
      systemPrompt: conversation.systemPrompt,
    });

    const registry = createToolRegistryFromSession(toolUseSession);
    const skills = resolveSkillsFromToolNames(app, registry, startTools);
    const skillNameSet = new Set(skills.map((s) => s.name));
    const alreadyInvokedSkills = extractInvokedSkillNames(storedMessages, skillNameSet);

    const conversationExternalId = getConversationId(conversation.conversationId);
    const turnExternalId = getTurnId(input.turnId);

    const sessionAgent = createSessionAgent(app, registry, {
      enabledTools: startTools,
      skills,
      alreadyInvokedSkills,
      modelName: conversation.model ?? undefined,
      telemetry: {
        functionId: conversationType,
        metadata: {
          conversationId: conversationExternalId,
          turnId: turnExternalId,
          conversationType,
          responseMode: input.response ?? 'complete',
        },
      },
    });
    modelName = sessionAgent.modelName;

    app.locals.logger.info(
      {
        conversationId: conversation.conversationId,
        turnId: input.turnId,
        model: modelName,
        responseMode: input.response ?? 'complete',
      },
      'Starting stored turn',
    );

    const result = await runAgentLoop({
      agent: sessionAgent.agent,
      messages: requestMessages,
      onTextDelta: shouldStream
        ? async (delta) => {
            await publishTurnStreamEvent(app, input.turnId, { type: 'text-delta', delta });
          }
        : undefined,
      onToolCall: shouldStream
        ? async (event) => {
            await publishTurnStreamEvent(app, input.turnId, {
              type: 'tool-call',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
            });
          }
        : undefined,
      onToolResult: shouldStream
        ? async (event) => {
            await publishTurnStreamEvent(app, input.turnId, {
              type: 'tool-result',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              output: event.output,
            });
          }
        : undefined,
    });

    const persistedMessages = await addMessages(
      app,
      input.turnId,
      toStoredAgentMessages({ responseMessages: result.responseMessages }),
    );

    const diagnostics = buildTurnDiagnostics({ prompt: promptMetadata, result });

    const endingTools = addSkillEnabledTools(
      conversationDefinition?.resolveTurnEndTools({
        startTools,
        finishReason: result.finishReason,
        responseMessages: result.responseMessages,
      }) ?? [...startTools],
      skills,
      result.responseMessages,
    );
    const toolDelta = diffToolNames(startTools, endingTools);

    if (result.finishReason === 'error') {
      const errorMessage = buildFinishReasonErrorMessage(result);
      await updateTurnStatus(app, input.turnId, 'failed', {
        addedTools: toolDelta.addedTools,
        error: errorMessage,
        model: modelName,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        removedTools: toolDelta.removedTools,
        finishReason: result.finishReason,
        rawFinishReason: result.rawFinishReason,
        totalLatencyMs: result.totalLatencyMs,
        extraData: { diagnostics },
      });

      if (shouldStream) {
        await publishTurnStreamError(app, input.turnId, errorMessage);
        await publishTurnStreamDone(app, input.turnId);
      }

      throw new TurnExecutionError(errorMessage, diagnostics);
    }

    if (result.finishReason === 'tool-calls') {
      const toolRequests = getToolRequestsFromStoredMessages(persistedMessages);
      const returnStatus = resolveReturnToClientStatus(result.toolResults);
      const inputRequired =
        returnStatus === 'input-required' ||
        (returnStatus !== 'complete' && toolRequests.length > 0);

      if (!inputRequired) {
        await updateTurnStatus(app, input.turnId, 'complete', {
          addedTools: toolDelta.addedTools,
          model: modelName,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          removedTools: toolDelta.removedTools,
          finishReason: result.finishReason,
          rawFinishReason: result.rawFinishReason,
          totalLatencyMs: result.totalLatencyMs,
          extraData: { diagnostics },
        });

        if (shouldStream) {
          await publishTurnStreamEvent(app, input.turnId, {
            type: 'finish',
            finishReason: result.finishReason,
            text: result.text,
          });
          await publishTurnStreamDone(app, input.turnId);
        }

        return {
          turnId: input.turnId,
          status: 'complete' as const,
          messageIds: persistedMessages.map((m) => m.messageId),
          text: result.text,
          finishReason: result.finishReason,
          totalLatencyMs: result.totalLatencyMs,
          diagnostics,
        };
      }

      await updateTurnStatus(app, input.turnId, 'input-required', {
        addedTools: toolDelta.addedTools,
        model: modelName,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        removedTools: toolDelta.removedTools,
        finishReason: result.finishReason,
        rawFinishReason: result.rawFinishReason,
        totalLatencyMs: result.totalLatencyMs,
        extraData: { diagnostics },
      });

      if (shouldStream) {
        await publishTurnStreamEvent(app, input.turnId, {
          type: 'finish',
          finishReason: result.finishReason,
          text: result.text,
          toolCalls: toolRequests,
        });
        await publishTurnStreamDone(app, input.turnId);
      }

      return {
        turnId: input.turnId,
        status: 'input-required' as const,
        messageIds: persistedMessages.map((m) => m.messageId),
        queuedTasks: queuedTasks.length > 0 ? [...queuedTasks] : undefined,
        text: result.text,
        finishReason: 'tool-calls' as const,
        totalLatencyMs: result.totalLatencyMs,
        diagnostics,
      };
    }

    // Normal completion
    await updateTurnStatus(app, input.turnId, 'complete', {
      addedTools: toolDelta.addedTools,
      model: modelName,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      removedTools: toolDelta.removedTools,
      finishReason: result.finishReason,
      rawFinishReason: result.rawFinishReason,
      totalLatencyMs: result.totalLatencyMs,
      extraData: { diagnostics },
    });

    if (shouldStream) {
      await publishTurnStreamEvent(app, input.turnId, {
        type: 'finish',
        finishReason: result.finishReason,
        text: result.text,
      });
      await publishTurnStreamDone(app, input.turnId);
    }

    return {
      turnId: input.turnId,
      status: 'complete' as const,
      messageIds: persistedMessages.map((m) => m.messageId),
      text: result.text,
      finishReason: result.finishReason,
      totalLatencyMs: result.totalLatencyMs,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize session';
    const errorDiagnostics =
      error instanceof TurnExecutionError
        ? error.diagnostics
        : buildErrorDiagnostics({ prompt: promptMetadata, error });

    if (!(error instanceof TurnExecutionError)) {
      await updateTurnStatus(app, input.turnId, 'failed', {
        error: message,
        model: modelName,
        extraData: { diagnostics: errorDiagnostics },
      });
    }

    app.locals.logger.error(
      {
        conversationId: conversation.conversationId,
        turnId: input.turnId,
        model: modelName,
        diagnostics: errorDiagnostics,
        ...summarizeErrorForLogs(error),
      },
      'Stored turn failed',
    );

    if (shouldStream && !(error instanceof TurnExecutionError)) {
      await publishTurnStreamError(app, input.turnId, error);
      await publishTurnStreamDone(app, input.turnId);
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPromptMetadata(extraData: Record<string, unknown> | undefined) {
  const prompt = extraData?.prompt;
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
    return {};
  }
  const p = prompt as Record<string, unknown>;
  return {
    ...(typeof p.name === 'string' ? { name: p.name } : {}),
    ...(typeof p.version === 'number' ? { version: p.version } : {}),
    ...(typeof p.template === 'string' ? { template: p.template } : {}),
  };
}

function extractConversationType(extraData: Record<string, unknown> | undefined) {
  return typeof extraData?.type === 'string' ? extraData.type : 'conversation-turn';
}

function buildTurnDiagnostics(input: {
  prompt: JsonObject;
  result: RunAgentLoopResult;
}): JsonObject {
  return {
    prompt: input.prompt,
    response: {
      ...(input.result.response?.id ? { id: input.result.response.id } : {}),
      ...(input.result.response?.modelId ? { modelId: input.result.response.modelId } : {}),
    },
    ...(input.result.warnings ? { warnings: sanitizeWarnings(input.result.warnings) } : {}),
  };
}

function getToolRequestsFromStoredMessages(messages: Awaited<ReturnType<typeof addMessages>>) {
  return (extractToolCallsFromMessages(messages) ?? []) as {
    id: string;
    name: string;
    input: JsonObject;
  }[];
}

function buildErrorDiagnostics(input: { prompt: JsonObject; error: unknown }): JsonObject {
  return {
    prompt: input.prompt,
    error: sanitizeError(input.error),
  };
}

function sanitizeWarnings(warnings: unknown[]) {
  return warnings.map((warning) => {
    if (typeof warning === 'string') return warning;
    if (typeof warning !== 'object' || warning === null || Array.isArray(warning))
      return String(warning);
    const record = warning as Record<string, unknown>;
    return {
      ...(typeof record.type === 'string' ? { type: record.type } : {}),
      ...(typeof record.message === 'string' ? { message: record.message } : {}),
      ...(typeof record.setting === 'string' ? { setting: record.setting } : {}),
      ...(typeof record.details === 'string' ? { details: record.details } : {}),
    };
  });
}

function sanitizeError(error: unknown): JsonObject {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.cause !== undefined ? { cause: sanitizeError(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}

/**
 * Any enabled tool name that isn't in the tool registry must be a skill.
 * Look those names up in the template manager and return the resolved specs.
 */
function resolveSkillsFromToolNames(
  app: AgentInternal['App'],
  registry: ToolRegistry,
  toolNames: readonly string[],
): SkillSpec[] {
  const registryNames = new Set(getAvailableToolNames(registry));
  const skillNames = toolNames.filter((name) => !registryNames.has(name));
  if (skillNames.length === 0) {
    return [];
  }
  return app.locals.templates.getSkills(skillNames);
}

function addSkillEnabledTools(
  endingTools: string[],
  skills: SkillSpec[],
  responseMessages: SessionResponseMessage[],
): string[] {
  if (skills.length === 0) {
    return endingTools;
  }

  const skillToolMap = new Map(
    skills.filter((s) => s.tools?.length).map((s) => [s.name, s.tools || []]),
  );
  if (skillToolMap.size === 0) {
    return endingTools;
  }

  const calledSkillTools = extractCalledToolNames(responseMessages).flatMap(
    (name) => skillToolMap.get(name) ?? [],
  );

  if (calledSkillTools.length === 0) {
    return endingTools;
  }

  const result = [...endingTools];
  for (const toolName of calledSkillTools) {
    if (!result.includes(toolName)) {
      result.push(toolName);
    }
  }
  return result;
}

function extractCalledToolNames(responseMessages: SessionResponseMessage[]): string[] {
  const names = new Set<string>();
  for (const message of responseMessages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call' && typeof part.toolName === 'string') {
        names.add(part.toolName);
      }
    }
  }
  return [...names];
}

function buildFinishReasonErrorMessage(result: RunAgentLoopResult) {
  return result.rawFinishReason
    ? `Model turn finished with error (${result.rawFinishReason})`
    : 'Model turn finished with error';
}

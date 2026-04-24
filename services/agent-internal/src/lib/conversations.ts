import { AuthPrincipal } from '@justtellme/auth-token';
import type { ToolUseSession } from '@justtellme/tools';
import { getRegistry, processToolClientResult } from '@justtellme/tools';
import { ServiceError } from '@openapi-typescript-infra/service';
import type { ModelMessage } from 'ai';
import type { JsonValue } from '#src/generated/database.js';
import type { components } from '#src/generated/service/index.js';
import type { AgentInternal } from '#src/types/index.js';
import { contentToText, toJsonValue } from './agent/messages.js';
import { resolveDefaultModelName } from './agent/runtime.js';
import { queryAsyncTaskWorkflow } from './async-tasks.js';
import { findConversationDefinition } from './conversation-definitions.js';
import {
  addMessages,
  createConversation,
  createTurn,
  getConversation,
  getConversationTurns,
  getTurnMessages,
  updateConversationSystemPrompt,
  updateTurnStatus,
} from './db.js';
import { getConversationUuid } from './ids.js';
import { createAgentToolUseSession } from './tool-session.js';
import { checkToolResponseDeferrals, type DeferralResult } from './tools/deferral.js';
import { extractToolCallsFromMessages } from './tools/requests.js';
import { normalizeToolResponseValue } from './tools/responses.js';

type CreateConversationRequest = components['schemas']['CreateConversationRequest'];
type ClientInfo = components['schemas']['ClientInfo'];

function splitInitialSystemPrompt(messages: ModelMessage[]) {
  const promptParts: string[] = [];
  let firstNonSystemIndex = 0;

  for (const message of messages) {
    if (message.role !== 'system') break;
    const text = contentToText(message.content).trim();
    if (text) promptParts.push(text);
    firstNonSystemIndex += 1;
  }

  return {
    systemPrompt: promptParts.length > 0 ? promptParts.join('\n\n') : undefined,
    messages: messages.slice(firstNonSystemIndex),
  };
}

function extractLatestTurnSystemPrompt(turn: components['schemas']['TurnInput']) {
  let nextSystemPrompt: string | null | undefined;

  for (const message of turn.messages ?? []) {
    if (message.role !== 'system') continue;
    const text = contentToText(message.content).trim();
    nextSystemPrompt = text.length > 0 ? text : null;
  }

  return nextSystemPrompt;
}

async function getPendingToolRequests(app: AgentInternal['App'], conversationId: string) {
  const turns = await getConversationTurns(app, getConversationUuid(conversationId));
  const pendingTurn = [...turns].reverse().find((turn) => turn.status === 'input-required');
  if (!pendingTurn) {
    return { turnId: undefined, requests: [] };
  }

  const messages = await getTurnMessages(app, pendingTurn.turnId);
  return {
    turnId: pendingTurn.turnId,
    requests: extractToolCallsFromMessages(messages) ?? [],
  };
}

function getPassthroughToolResponseMessages(
  toolResponses: components['schemas']['AgentToolResponse'][],
) {
  return toolResponses.map((response) => ({
    role: 'tool-result' as const,
    content: toJsonValue(response.complex_result ?? response.text_result ?? ''),
    toolCallId: response.id,
    extraData: { toolName: response.name },
  }));
}

function createToolResponseValidationError(
  app: AgentInternal['App'],
  message: string,
  cause?: unknown,
) {
  const detail =
    cause instanceof Error && cause.message !== message ? `${message}: ${cause.message}` : message;
  return new ServiceError(app, detail, { status: 400 });
}

async function createToolSessionForConversation(
  app: AgentInternal['App'],
  conversationId: string,
  options?: { identityToken?: string },
): Promise<ToolUseSession> {
  const conversationUuid = getConversationUuid(conversationId);
  const conversation = await getConversation(app, conversationUuid);
  const conversationType =
    typeof conversation?.extraData?.type === 'string' ? conversation.extraData.type : undefined;
  const definition = conversationType ? findConversationDefinition(conversationType) : undefined;
  const asyncTaskProvider = {
    async queue() {
      throw new Error('Cannot queue async tasks during tool response resolution');
    },
    async get(jobId: string) {
      return queryAsyncTaskWorkflow(app, conversationId, jobId);
    },
  };
  const toolSession = definition?.toolSession ?? { role: 'user' as const };
  const principal = options?.identityToken ? new AuthPrincipal(options.identityToken) : undefined;
  return createAgentToolUseSession(app, asyncTaskProvider, principal, {
    role: toolSession.role,
  });
}

async function turnToStoredMessages(
  app: AgentInternal['App'],
  conversationId: string,
  turn: components['schemas']['TurnInput'],
  options?: { identityToken?: string },
) {
  const { turnId: pendingTurnId, requests: pendingToolRequests } = await getPendingToolRequests(
    app,
    conversationId,
  );
  const submittedToolResponses = turn.tool_responses ?? [];
  const systemPrompt = extractLatestTurnSystemPrompt(turn);

  if (pendingToolRequests.length === 0) {
    return {
      resolvedTurnId: undefined,
      systemPrompt,
      messages: [
        ...(turn.messages ?? []).map((message) => ({
          role: message.role,
          content: toJsonValue(message.content),
        })),
        ...getPassthroughToolResponseMessages(submittedToolResponses),
      ],
    };
  }

  const requestIds = new Set(pendingToolRequests.map((request) => request.id));
  const submittedIds = submittedToolResponses.map((response) => response.id);

  const duplicateIds = submittedIds.filter((id, index) => submittedIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw createToolResponseValidationError(
      app,
      `Duplicate tool responses submitted: ${[...new Set(duplicateIds)].join(', ')}`,
    );
  }

  const unknownIds = submittedIds.filter((id) => !requestIds.has(id));
  if (unknownIds.length > 0) {
    throw createToolResponseValidationError(
      app,
      `Unknown tool responses submitted: ${[...new Set(unknownIds)].join(', ')}`,
    );
  }

  const submittedIdSet = new Set(submittedIds);
  const missingRequests = pendingToolRequests.filter((request) => !submittedIdSet.has(request.id));

  if (missingRequests.length > 0) {
    const registry = getRegistry();
    const unresolvable = missingRequests.filter(
      (request) => !registry.get(request.name)?.processClientResult,
    );

    if (unresolvable.length > 0) {
      throw createToolResponseValidationError(
        app,
        `Missing tool responses for: ${unresolvable.map((r) => r.id).join(', ')}`,
      );
    }
  }

  const requestMap = new Map(pendingToolRequests.map((request) => [request.id, request]));
  const normalizedToolResponses = submittedToolResponses.map((response) => {
    const request = requestMap.get(response.id);
    if (!request) {
      throw createToolResponseValidationError(app, `Unknown tool request: ${response.id}`);
    }

    if (response.name !== request.name) {
      throw createToolResponseValidationError(
        app,
        `Tool response ${response.id} has name ${response.name}, expected ${request.name}`,
      );
    }

    let normalizedValue: unknown;
    try {
      normalizedValue = normalizeToolResponseValue(request, response);
    } catch (error) {
      throw createToolResponseValidationError(
        app,
        `Invalid response for tool ${response.id} (${request.name})`,
        error,
      );
    }

    return {
      role: 'tool-result' as const,
      content: toJsonValue(normalizedValue),
      toolCallId: response.id,
      extraData: { toolName: request.name },
    };
  });

  const autoFilledToolResponses: typeof normalizedToolResponses = [];
  if (missingRequests.length > 0) {
    const session = await createToolSessionForConversation(app, conversationId, options);
    for (const request of missingRequests) {
      const result = await processToolClientResult(request.name, session, undefined, {
        toolCallId: request.id,
        messages: [],
      });
      autoFilledToolResponses.push({
        role: 'tool-result' as const,
        content: toJsonValue(result),
        toolCallId: request.id,
        extraData: { toolName: request.name },
      });
    }
  }

  return {
    resolvedTurnId: pendingTurnId,
    systemPrompt,
    messages: [
      ...normalizedToolResponses,
      ...autoFilledToolResponses,
      ...(turn.messages ?? []).map((message) => ({
        role: message.role,
        content: toJsonValue(message.content),
      })),
    ],
  };
}

export async function ensureConversation(
  app: AgentInternal['App'],
  conversationId: string,
  requestBody: CreateConversationRequest,
) {
  const conversationUuid = getConversationUuid(conversationId);
  const existing = await getConversation(app, conversationUuid);
  if (existing) {
    return existing;
  }

  const definition = findConversationDefinition(requestBody.type);
  if (!definition) {
    throw new ServiceError(app, `Unknown conversation type: ${requestBody.type}`, { status: 400 });
  }

  const initialConversation = await definition.renderInitialTurn(
    app,
    conversationUuid,
    requestBody,
  );
  const initialPrompt = splitInitialSystemPrompt(initialConversation.messages);

  return createConversation(app, {
    conversationId: conversationUuid,
    agentId: conversationUuid,
    client: requestBody.client,
    model: resolveDefaultModelName(app),
    systemPrompt: initialPrompt.systemPrompt,
    startingTools: initialConversation.startingTools,
    initialMessages: initialPrompt.messages,
    injectedToolCalls: initialConversation.injectedToolCalls,
    extraData: {
      type: requestBody.type,
      options: requestBody.options as JsonValue | undefined,
      ...(requestBody.context ? { context: requestBody.context } : {}),
      ...(initialConversation.promptMetadata ? { prompt: initialConversation.promptMetadata } : {}),
    },
  });
}

export async function persistConversationTurn(
  app: AgentInternal['App'],
  conversationId: string,
  turn: components['schemas']['TurnInput'],
  client: ClientInfo,
  options?: { identityToken?: string },
) {
  const {
    resolvedTurnId,
    systemPrompt,
    messages: storedMessages,
  } = await turnToStoredMessages(app, conversationId, turn, options);
  const persistedTurn = await createTurn(app, getConversationUuid(conversationId), client);

  await addMessages(app, persistedTurn.turnId, storedMessages);
  if (systemPrompt !== undefined) {
    await updateConversationSystemPrompt(app, getConversationUuid(conversationId), systemPrompt);
  }

  if (resolvedTurnId) {
    await updateTurnStatus(app, resolvedTurnId, 'complete');
  }

  return persistedTurn;
}

export async function processDeferredToolResponses(
  app: AgentInternal['App'],
  conversationId: string,
  toolResponses: components['schemas']['AgentToolResponse'][],
  options?: { identityToken?: string },
): Promise<DeferralResult | null> {
  if (toolResponses.length === 0) {
    return null;
  }

  const conversationUuid = getConversationUuid(conversationId);
  const turns = await getConversationTurns(app, conversationUuid);
  const pendingTurn = [...turns].reverse().find((turn) => turn.status === 'input-required');
  if (!pendingTurn) return null;

  const messages = await getTurnMessages(app, pendingTurn.turnId);
  const allToolCalls = extractToolCallsFromMessages(messages, { includeAnswered: true });
  if (!allToolCalls || allToolCalls.length === 0) return null;

  const pendingIds = new Set(allToolCalls.map((tc) => tc.id));
  const relevant = toolResponses.filter((r) => pendingIds.has(r.id));
  if (relevant.length === 0) return null;

  const session = await createToolSessionForConversation(app, conversationId, options);
  return checkToolResponseDeferrals(session, relevant, allToolCalls);
}

export async function getRequiredConversation(app: AgentInternal['App'], conversationId: string) {
  const conversation = await getConversation(app, getConversationUuid(conversationId));
  if (!conversation) {
    throw new ServiceError(app, `Conversation not found: ${conversationId}`, { status: 404 });
  }
  return conversation;
}

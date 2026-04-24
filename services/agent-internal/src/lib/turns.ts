import type { components } from '#src/generated/service/index.js';
import { getConversation, getConversationTurns, getTurn, getTurnMessages } from '#src/lib/db.js';
import type { AgentInternal } from '#src/types/index.js';
import { contentToText } from './agent/messages.js';
import { getConversationId, getConversationUuid, getTurnId, getTurnUuid } from './ids.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiTurnMessageRole(role: string): role is 'user' | 'assistant' | 'system' {
  return role === 'user' || role === 'assistant' || role === 'system';
}

type ApiTurnMessageContent = NonNullable<
  components['schemas']['Turn']['messages']
>[number]['content'];
type ApiTurnMessagePart = Exclude<ApiTurnMessageContent, string>[number];

function isTextApiPart(
  value: unknown,
): value is ApiTurnMessagePart & { type: 'text'; text: string } {
  return isRecord(value) && value.type === 'text' && typeof value.text === 'string';
}

function isImageApiPart(
  value: unknown,
): value is ApiTurnMessagePart & { type: 'image'; url: string; media_type?: string } {
  return isRecord(value) && value.type === 'image' && typeof value.url === 'string';
}

function isFileApiPart(value: unknown): value is ApiTurnMessagePart & {
  type: 'file';
  url: string;
  media_type: string;
  filename?: string;
} {
  return (
    isRecord(value) &&
    value.type === 'file' &&
    typeof value.url === 'string' &&
    typeof value.media_type === 'string'
  );
}

function toApiMessageContent(content: unknown): ApiTurnMessageContent {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: ApiTurnMessagePart[] = [];

    for (const part of content) {
      if (isTextApiPart(part)) {
        parts.push({ type: 'text', text: part.text });
        continue;
      }
      if (isImageApiPart(part)) {
        parts.push({
          type: 'image',
          image: part.url,
          ...(typeof part.media_type === 'string' ? { mimeType: part.media_type } : {}),
        });
        continue;
      }
      if (isFileApiPart(part)) {
        parts.push({
          type: 'file',
          data: part.url,
          mimeType: part.media_type,
          ...(typeof part.filename === 'string' ? { filename: part.filename } : {}),
        });
        continue;
      }
      const text = contentToText(part);
      if (text) {
        parts.push({ type: 'text', text });
      }
    }

    if (parts.length > 0) {
      return parts;
    }
  }

  return contentToText(content);
}

type ApiTurnMessage = NonNullable<components['schemas']['Turn']['messages']>[number];
type ApiToolCall = NonNullable<components['schemas']['Turn']['tool_calls']>[number];

function buildSequencedTurnContent(messages: Awaited<ReturnType<typeof getTurnMessages>>): {
  messages: ApiTurnMessage[];
  toolCalls: ApiToolCall[] | undefined;
} {
  const outputsByCallId = new Map<
    string,
    NonNullable<components['schemas']['AgentToolCall']['output']>
  >();
  for (const message of messages) {
    if (message.role === 'tool-result' && message.toolCallId) {
      const content = message.content;
      outputsByCallId.set(
        message.toolCallId,
        (isRecord(content) ? content : { text_result: contentToText(content) }) as NonNullable<
          components['schemas']['AgentToolCall']['output']
        >,
      );
    }
  }

  const apiMessages: ApiTurnMessage[] = [];
  const apiToolCalls: ApiToolCall[] = [];
  let sequence = 0;

  for (const message of messages) {
    if (!isApiTurnMessageRole(message.role)) {
      continue;
    }

    const content = message.content;

    if (message.role === 'assistant' && Array.isArray(content)) {
      let pendingTextParts: typeof content = [];

      const flushText = () => {
        if (pendingTextParts.length === 0) return;
        apiMessages.push({
          role: 'assistant',
          content: toApiMessageContent(pendingTextParts),
          sequence,
        });
        sequence++;
        pendingTextParts = [];
      };

      for (const part of content) {
        if (isRecord(part) && part.type === 'tool-call') {
          flushText();
          const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : '';
          const toolName = typeof part.toolName === 'string' ? part.toolName : '';
          const output = outputsByCallId.get(toolCallId);
          apiToolCalls.push({
            id: toolCallId,
            name: toolName,
            input: toToolCallInput(part.input),
            sequence,
            ...(output ? { output } : {}),
          } as ApiToolCall);
          sequence++;
        } else {
          pendingTextParts.push(part);
        }
      }

      flushText();
      continue;
    }

    apiMessages.push({
      role: message.role as ApiTurnMessage['role'],
      content: toApiMessageContent(content),
      sequence,
    });
    sequence++;
  }

  return {
    messages: apiMessages,
    toolCalls: apiToolCalls.length > 0 ? apiToolCalls : undefined,
  };
}

function toToolCallInput(input: unknown): ApiToolCall['input'] {
  if (isRecord(input)) {
    return input as ApiToolCall['input'];
  }
  return { value: input ?? null } as unknown as ApiToolCall['input'];
}

export async function getApiTurn(
  app: AgentInternal['App'],
  turnId: string,
  options?: { metadata?: boolean },
): Promise<components['schemas']['Turn'] | null> {
  const turnUuid = getTurnUuid(turnId);
  const turn = await getTurn(app, turnUuid);
  if (!turn) return null;

  const messages = await getTurnMessages(app, turnUuid);
  const apiTurn = toApiTurn(turn, messages);
  if (!apiTurn) return null;

  if (options?.metadata) {
    apiTurn.metadata = toApiTurnMetadata(turn, messages);
  }

  return apiTurn;
}

export async function getApiConversation(
  app: AgentInternal['App'],
  conversationId: string,
  options?: { metadata?: boolean; turnId?: string },
): Promise<components['schemas']['ConversationDetails'] | null> {
  const conversationUuid = getConversationUuid(conversationId);
  const conversation = await getConversation(app, conversationUuid);
  if (!conversation) return null;

  let turns = await getConversationTurns(app, conversationUuid);

  if (options?.turnId) {
    const turnUuid = getTurnUuid(options.turnId);
    turns = turns.filter((t) => t.turnId === turnUuid);
  }

  const fullTurns = await Promise.all(
    turns.map(async (turn) => {
      const turnMessages = await getTurnMessages(app, turn.turnId);
      const apiTurn = toApiTurn(turn, turnMessages);
      if (!apiTurn) return null;

      if (options?.metadata) {
        apiTurn.metadata = toApiTurnMetadata(turn, turnMessages);
      }
      return apiTurn;
    }),
  );

  return {
    conversation_id: getConversationId(conversation.conversationId),
    status: toApiConversationStatus(conversation.status),
    error:
      typeof conversation.extraData?.error === 'string' ? conversation.extraData.error : undefined,
    system_prompt: conversation.systemPrompt,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    extra_data: conversation.extraData,
    turns: fullTurns.filter((turn): turn is NonNullable<typeof turn> => turn !== null),
  };
}

function toApiConversationStatus(status: string) {
  switch (status) {
    case 'completed':
    case 'failed':
      return status;
    default:
      return 'running';
  }
}

function toApiTurnMetadata(
  turn: NonNullable<Awaited<ReturnType<typeof getTurn>>>,
  messages: Awaited<ReturnType<typeof getTurnMessages>>,
): components['schemas']['TurnMetadata'] {
  return {
    status: turn.status as components['schemas']['TurnMetadata']['status'],
    model: turn.model,
    error: turn.error,
    finish_reason: turn.finishReason,
    raw_finish_reason: turn.rawFinishReason,
    input_tokens: turn.inputTokens,
    output_tokens: turn.outputTokens,
    total_latency_ms: turn.totalLatencyMs,
    started_at: turn.startedAt,
    completed_at: turn.completedAt,
    extra_data: turn.extraData,
    stored_messages: messages.map((message) => ({
      role: message.role as components['schemas']['ConversationStoredMessage']['role'],
      content: message.content,
      tool_call_id: message.toolCallId,
      extra_data: message.extraData,
      created_at: message.createdAt,
    })),
  };
}

function toApiTurn(
  turn: Awaited<ReturnType<typeof getTurn>>,
  messages: Awaited<ReturnType<typeof getTurnMessages>>,
): components['schemas']['Turn'] | null {
  if (!turn) return null;

  const { messages: apiMessages, toolCalls } = buildSequencedTurnContent(messages);

  return {
    turn_id: getTurnId(turn.turnId),
    messages: apiMessages,
    tool_calls: toolCalls,
  };
}

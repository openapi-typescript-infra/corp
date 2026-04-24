import type { components } from '#src/generated/service/index.js';

type ToolCall = components['schemas']['AgentToolCall'];

interface StoredMessageWithToolCalls {
  role: string;
  toolCalls?: unknown;
  toolCallId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolCallRecord(
  value: unknown,
): value is { toolCallId: string; toolName: string; input?: unknown } {
  return (
    isRecord(value) &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    'input' in value
  );
}

function toToolCallInput(input: unknown): ToolCall['input'] {
  if (isRecord(input)) {
    return input as ToolCall['input'];
  }

  return { value: input ?? null } as unknown as ToolCall['input'];
}

export function getUnansweredToolCalls(
  toolCalls: readonly ToolCall[] | null | undefined,
): ToolCall[] {
  if (!toolCalls || toolCalls.length === 0) {
    return [];
  }

  return toolCalls.filter((toolCall) => toolCall.output === undefined);
}

export function extractToolCallsFromMessages(
  messages: StoredMessageWithToolCalls[],
  options?: { includeAnswered?: boolean },
): ToolCall[] | undefined {
  const answeredToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === 'tool-result' && message.toolCallId) {
      answeredToolCallIds.add(message.toolCallId);
    }
  }

  const calls: ToolCall[] = [];
  const seenToolCalls = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.toolCalls)) {
      continue;
    }

    for (const toolCall of message.toolCalls) {
      if (!isToolCallRecord(toolCall) || seenToolCalls.has(toolCall.toolCallId)) {
        continue;
      }

      seenToolCalls.add(toolCall.toolCallId);

      if (!options?.includeAnswered && answeredToolCallIds.has(toolCall.toolCallId)) {
        continue;
      }

      calls.push({
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        input: toToolCallInput(toolCall.input),
      } as ToolCall);
    }
  }

  return calls.length > 0 ? calls : undefined;
}

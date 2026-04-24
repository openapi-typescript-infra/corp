import type { ModelMessage } from 'ai';

import type { JsonObject, JsonValue } from '#src/generated/database.js';

export interface InjectedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ResolvedContext {
  context?: Record<string, unknown>;
  messages?: ModelMessage[];
  toolCalls?: InjectedToolCall[];
}

/**
 * Convert injected tool calls to stored-message format for persistence.
 * Each entry becomes an assistant message (with a tool-call part) followed by
 * a tool-result message. Both are tagged with `extraData.injected: true` so
 * the model-message loader can recognise them and avoid sending raw
 * assistant tool-call blocks to providers that reject them.
 */
export function injectedToolCallsToStoredMessages(
  toolCalls: InjectedToolCall[],
): InjectedStoredMessage[] {
  const messages: InjectedStoredMessage[] = [];
  for (const tc of toolCalls) {
    messages.push({
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.args,
        },
      ] as JsonValue,
      extraData: { injected: true },
    });
    messages.push({
      role: 'tool-result',
      content: tc.result as JsonValue,
      toolCallId: tc.toolCallId,
      extraData: { toolName: tc.toolName, injected: true },
    });
  }
  return messages;
}

interface InjectedStoredMessage {
  role: 'assistant' | 'tool-result';
  content: JsonValue | null;
  toolCalls?: JsonValue;
  toolCallId?: string;
  extraData?: JsonObject;
}

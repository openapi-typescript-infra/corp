import { encode as encodeToon } from '@toon-format/toon';
import type {
  AssistantContent,
  ProviderMetadata,
  ToolCallPart,
  ToolResultPart,
  UserContent,
} from 'ai';
import type { JsonValue } from '#src/generated/database.js';

import type { AddMessageInput } from '#src/lib/db.js';
import type {
  SessionModelMessage,
  SessionResponseMessage,
  StoredConversationMessage,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, toJsonValue(entry)]),
    ) as JsonValue;
  }

  if (value === undefined) {
    return null;
  }

  return String(value);
}

export function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!isRecord(part)) {
          return String(part);
        }

        if (typeof part.text === 'string') {
          return part.text;
        }

        if ('output' in part) {
          return contentToText(part.output);
        }

        if (typeof part.url === 'string') {
          return part.url;
        }

        return '';
      })
      .filter(Boolean)
      .join('');
  }

  if (content === null || content === undefined) {
    return '';
  }

  if (isRecord(content)) {
    return JSON.stringify(content);
  }

  return String(content);
}

function isTextContentPart(
  value: unknown,
): value is { type: 'text'; text: string; providerMetadata?: unknown } {
  return isRecord(value) && value.type === 'text' && typeof value.text === 'string';
}

function toProviderMetadata(value: unknown): ProviderMetadata | undefined {
  return isRecord(value) ? (value as ProviderMetadata) : undefined;
}

function isImageRefPart(
  value: unknown,
): value is { type: 'image'; url: string; media_type?: string } {
  return isRecord(value) && value.type === 'image' && typeof value.url === 'string';
}

function isFileRefPart(value: unknown): value is {
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

function toUrlReference(url: string) {
  try {
    return new URL(url);
  } catch {
    return url;
  }
}

function toUserContent(content: unknown): UserContent {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: Exclude<UserContent, string> = [];

    for (const part of content) {
      if (isTextContentPart(part)) {
        parts.push({ type: 'text', text: part.text });
        continue;
      }

      if (isImageRefPart(part)) {
        parts.push({
          type: 'image',
          image: toUrlReference(part.url),
          ...(part.media_type ? { mediaType: part.media_type } : {}),
        });
        continue;
      }

      if (isFileRefPart(part)) {
        parts.push({
          type: 'file',
          data: toUrlReference(part.url),
          mediaType: part.media_type,
          ...(part.filename ? { filename: part.filename } : {}),
        });
        continue;
      }

      const text = contentToText(part);
      if (text) {
        parts.push({ type: 'text', text });
      }
    }

    if (parts.length === 1 && parts[0].type === 'text') {
      return parts[0].text;
    }

    return parts;
  }

  if (content === null || content === undefined) {
    return '';
  }

  return JSON.stringify(content);
}

function toToolResultOutput(content: unknown): ToolResultPart['output'] {
  const jsonValue = toJsonValue(content);
  if (typeof jsonValue === 'string') {
    return { type: 'text', value: jsonValue };
  }
  return { type: 'json', value: jsonValue };
}

function toolResultOutputToJsonValue(output: ToolResultPart['output']): JsonValue {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'json':
    case 'error-json':
      return toJsonValue(output.value);
    case 'content':
      return toJsonValue(output.value);
    case 'execution-denied':
      return toJsonValue({ type: output.type, reason: output.reason });
    default:
      return toJsonValue(output);
  }
}

function isToolCallPart(value: unknown): value is ToolCallPart {
  return (
    isRecord(value) &&
    value.type === 'tool-call' &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    'input' in value
  );
}

function toAssistantContent(content: unknown, toolCalls?: unknown): AssistantContent {
  const parts: Exclude<AssistantContent, string> = [];

  if (typeof content === 'string') {
    if (!toolCalls) {
      return content;
    }
    if (content.length > 0) {
      parts.push({ type: 'text', text: content });
    }
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (isRecord(part) && typeof part.type === 'string') {
        if (isTextContentPart(part)) {
          parts.push({
            type: 'text',
            text: part.text,
            ...(toProviderMetadata(part.providerMetadata)
              ? { providerMetadata: toProviderMetadata(part.providerMetadata) }
              : {}),
          });
          continue;
        }

        if (part.type === 'reasoning' && typeof part.text === 'string') {
          parts.push({
            type: 'reasoning',
            text: part.text,
            ...(toProviderMetadata(part.providerMetadata)
              ? { providerMetadata: toProviderMetadata(part.providerMetadata) }
              : {}),
          });
          continue;
        }

        if (isToolCallPart(part)) {
          parts.push(part);
          continue;
        }
      }

      parts.push({ type: 'text', text: contentToText(part) });
    }
  } else if (content !== null && content !== undefined) {
    return JSON.stringify(content);
  } else if (!toolCalls) {
    return '';
  }

  if (Array.isArray(toolCalls)) {
    for (const toolCall of toolCalls) {
      if (isToolCallPart(toolCall)) {
        const alreadyIncluded = parts.some(
          (part) => part.type === 'tool-call' && part.toolCallId === toolCall.toolCallId,
        );
        if (!alreadyIncluded) {
          parts.push(toolCall);
        }
      }
    }
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts;
}

function extractToolCalls(content: SessionResponseMessage['content']) {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const toolCalls = content.filter((part): part is ToolCallPart => part.type === 'tool-call');
  if (toolCalls.length === 0) {
    return undefined;
  }

  return toJsonValue(toolCalls);
}

export function toSessionModelMessages(
  messages: StoredConversationMessage[],
  options?: { systemPrompt?: string },
): SessionModelMessage[] {
  const latestToolResultIndex = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'tool-result' && msg.toolCallId) {
      latestToolResultIndex.set(msg.toolCallId, i);
    }
  }

  let currentSystemPrompt = options?.systemPrompt?.trim() || undefined;
  const sessionMessages = messages.flatMap((message, index): SessionModelMessage[] => {
    switch (message.role) {
      case 'system': {
        currentSystemPrompt = contentToText(message.content).trim() || undefined;
        return [];
      }
      case 'user': {
        return [{ role: 'user', content: toUserContent(message.content) }];
      }
      case 'assistant': {
        if (message.extraData?.injected) {
          return [];
        }
        return [
          { role: 'assistant', content: toAssistantContent(message.content, message.toolCalls) },
        ];
      }
      case 'tool-result': {
        const toolName = message.extraData?.toolName;
        if (typeof toolName !== 'string' || !message.toolCallId) {
          return [];
        }

        if (latestToolResultIndex.get(message.toolCallId) !== index) {
          return [];
        }

        if (message.extraData?.injected) {
          return [
            {
              role: 'user',
              content: `<${toolName}>\n${encodeToon(message.content)}\n</${toolName}>`,
            },
          ];
        }

        return [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: message.toolCallId,
                toolName,
                output: toToolResultOutput(message.content),
              },
            ],
          },
        ];
      }
      default:
        return [];
    }
  });

  return [
    ...(currentSystemPrompt
      ? ([{ role: 'system', content: currentSystemPrompt }] as SessionModelMessage[])
      : []),
    ...sessionMessages,
  ];
}

export function toStoredConversationMessages(messages: SessionModelMessage[]): AddMessageInput[] {
  const storedMessages: AddMessageInput[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      storedMessages.push({ role: 'system', content: contentToText(message.content) });
      continue;
    }
    if (message.role === 'user') {
      storedMessages.push({ role: 'user', content: toJsonValue(message.content) });
      continue;
    }
    if (message.role === 'assistant') {
      storedMessages.push({
        role: 'assistant',
        content: toJsonValue(message.content),
        toolCalls: extractToolCalls(message.content),
      });
      continue;
    }
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== 'tool-result') {
        continue;
      }
      storedMessages.push({
        role: 'tool-result',
        content: toolResultOutputToJsonValue(part.output),
        toolCallId: part.toolCallId,
        extraData: { toolName: part.toolName },
      });
    }
  }

  return storedMessages;
}

export function toStoredAgentMessages(input: {
  responseMessages: SessionResponseMessage[];
}): AddMessageInput[] {
  const storedMessages: AddMessageInput[] = [];

  for (const message of input.responseMessages) {
    if (message.role === 'assistant') {
      storedMessages.push({
        role: 'assistant',
        content: toJsonValue(message.content),
        toolCalls: extractToolCalls(message.content),
      });
      continue;
    }
    if (message.role !== 'tool') {
      continue;
    }
    storedMessages.push(...toStoredConversationMessages([message]));
  }

  return storedMessages;
}

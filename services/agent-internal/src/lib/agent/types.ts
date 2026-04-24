import type { AsyncTaskInfo, AsyncTaskRequest } from '@justtellme/tools';
import type { ToolLoopAgent, ToolSet } from 'ai';

import type { JsonObject } from '#src/generated/database.js';

type SessionToolLoopAgent = ToolLoopAgent<never, ToolSet, never>;
type SessionAgentCall = Parameters<SessionToolLoopAgent['stream']>[0];

export type SessionModelMessage = Exclude<SessionAgentCall['messages'], undefined>[number];
export type SessionAgent = Pick<SessionToolLoopAgent, 'stream'>;
export type SessionStreamResult = Awaited<ReturnType<SessionAgent['stream']>>;
export type SessionResponse = Awaited<SessionStreamResult['response']>;
export type SessionResponseMessage = SessionResponse['messages'][number];
export type SessionStep = Awaited<SessionStreamResult['steps']>[number];

export interface StoredConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool-result';
  content: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  extraData?: Record<string, unknown>;
}

export interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
}

export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface RunAgentLoopInput {
  agent: SessionAgent;
  messages: SessionModelMessage[];
  onTextDelta?: (delta: string) => PromiseLike<void> | void;
  onToolCall?: (event: ToolCallEvent) => PromiseLike<void> | void;
  onToolResult?: (event: ToolResultEvent) => PromiseLike<void> | void;
}

export interface RunAgentLoopResult {
  text: string;
  responseMessages: SessionResponse['messages'];
  finishReason: SessionStep['finishReason'];
  rawFinishReason?: SessionStep['rawFinishReason'];
  toolResults: SessionStep['toolResults'];
  totalLatencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  warnings?: SessionStep['warnings'];
  response?: SessionStep['response'];
  providerMetadata?: SessionStep['providerMetadata'];
}

export type ResponseMode = 'none' | 'stream' | 'complete';

export interface RunTurnInput {
  conversationId: string;
  turnId: string;
  response?: ResponseMode;
  /** x-auth-token for building a ToolUseSession with the caller's identity. */
  identityToken?: string;
  /** Pre-fetched status of previously queued async tasks, keyed by jobId. */
  asyncTaskStatuses?: Record<string, AsyncTaskInfo>;
}

export interface CompletedTurnResult {
  turnId: string;
  status: 'complete';
  messageIds: string[];
  text: string;
  finishReason: string;
  totalLatencyMs: number;
  diagnostics?: JsonObject;
}

export interface InputRequiredTurnResult {
  turnId: string;
  status: 'input-required';
  messageIds: string[];
  queuedTasks?: AsyncTaskRequest[];
  text: string;
  finishReason: 'tool-calls';
  totalLatencyMs: number;
  diagnostics?: JsonObject;
}

export interface FailedTurnResult {
  turnId: string;
  status: 'failed';
  error: string;
  diagnostics?: JsonObject;
}

export type TurnResult = CompletedTurnResult | InputRequiredTurnResult | FailedTurnResult;

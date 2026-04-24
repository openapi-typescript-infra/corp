import type { ToolUseSession } from '@justtellme/tools';
import type { ModelMessage } from 'ai';
import type { JsonObject } from '#src/generated/database.js';
import type { components } from '#src/generated/service/index.js';
import type { SessionResponseMessage, StoredConversationMessage } from '#src/lib/agent/types.js';
import type { AgentInternal } from '#src/types/index.js';
import type { ToolSession } from './agent/tools.js';
import type { InjectedToolCall } from './context.js';

type CreateConversationRequest = components['schemas']['CreateConversationRequest'];

export interface DirectedTurnInput {
  allMessages: StoredConversationMessage[];
  turnMessages: StoredConversationMessage[];
  conversationExtraData: Record<string, unknown>;
  session: ToolUseSession;
}

export function isFirstUserTurn(input: DirectedTurnInput): boolean {
  const priorCount = input.allMessages.length - input.turnMessages.length;
  return !input.allMessages.slice(0, Math.max(0, priorCount)).some((m) => m.role === 'user');
}

export interface DirectedTurn {
  text?: string;
  toolCalls?: InjectedToolCall[];
}

export interface RenderedInitialTurn {
  startingTools: string[];
  messages: ModelMessage[];
  injectedToolCalls?: InjectedToolCall[];
  promptMetadata?: JsonObject;
}

export abstract class ConversationDefinition<
  TRequest extends CreateConversationRequest = CreateConversationRequest,
> {
  abstract readonly type: string;
  abstract readonly toolSession: ToolSession;

  abstract getInitialToolNames(request: TRequest): string[];

  resolveDirectedTurn?(
    context: DirectedTurnInput,
  ): Promise<DirectedTurn | undefined> | DirectedTurn | undefined;

  resolveTurnEndTools(input: {
    startTools: readonly string[];
    finishReason: string;
    responseMessages: SessionResponseMessage[];
  }) {
    return [...input.startTools];
  }

  abstract renderInitialTurn(
    app: AgentInternal['App'],
    conversationId: string,
    request: TRequest,
  ): Promise<RenderedInitialTurn>;
}

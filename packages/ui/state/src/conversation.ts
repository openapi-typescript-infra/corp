import { ExternalIDType, toExternalID } from '@justtellme/external-id';
import type { components, paths } from '@justtellme/rest-api-client';
import { type Observable, ObservableHint, observable } from '@legendapp/state';
import createClient, { type ClientOptions } from 'openapi-fetch';

import { AgentStreamParser, type ParsedAgentMessage } from './stream-parser.ts';

type Turn = components['schemas']['Turn'];
type ToolCall = components['schemas']['AgentToolCall'];
type ToolResponse = components['schemas']['AgentToolResponse'];

export interface ConversationStep {
  turnId: string;
  message?: string;
  sentAt: Date;
  complete: boolean;
  toolResponses?: ToolResponse[];
  output?: Turn & { receivedAt: Date };
}

export interface ConversationState {
  conversationId: string;
  type: string;
  steps: ConversationStep[];
  currentStep?: ConversationStep;
  activeToolCalls: ToolCall[];
  isWorking: boolean;
  isLoading: boolean;
  error?: Error;
}

export type ConversationSendInput =
  | string
  | { toolResponses: ToolResponse[] }
  | { message: string; toolResponses: ToolResponse[] };

export interface ConversationStoreOptions {
  apiEndpoint: string;
  appName: string;
  appVersion: string;
  type: string;
  conversationId?: string;
  context?: string;
  model?: string;
  stream?: boolean;
  clientOptions?: Omit<ClientOptions, 'baseUrl'>;
}

export interface ConversationStore {
  state$: Observable<ConversationState>;
  send(input: ConversationSendInput): Promise<ConversationStep>;
  load(): Promise<void>;
}

/** Headless conversation state for browser or native applications. */
export function createConversationStore(options: ConversationStoreOptions): ConversationStore {
  const conversationId = options.conversationId ?? externalId(ExternalIDType.AgentConversation);
  const clientInfo = { name: options.appName, version: options.appVersion };
  const api = createClient<paths>({
    credentials: 'include',
    baseUrl: options.apiEndpoint,
    ...options.clientOptions,
  });
  const state$ = observable<ConversationState>({
    conversationId,
    type: options.type,
    steps: [],
    activeToolCalls: [],
    isWorking: false,
    isLoading: false,
  });

  async function send(input: ConversationSendInput): Promise<ConversationStep> {
    const message =
      typeof input === 'string' ? input : 'message' in input ? input.message : undefined;
    const toolResponses = typeof input === 'string' ? undefined : input.toolResponses;
    const step: ConversationStep = {
      turnId: externalId(ExternalIDType.AgentConversationTurn),
      message,
      toolResponses,
      sentAt: new Date(),
      complete: false,
    };
    const hadSteps = state$.steps.peek().length > 0;
    state$.error.set(undefined);
    state$.currentStep.set(step);
    state$.steps.push(ObservableHint.opaque(step));
    state$.isWorking.set(true);
    state$.activeToolCalls.set([]);

    try {
      const turn = {
        messages: message ? [{ role: 'user' as const, content: message }] : [],
        tool_responses: toolResponses,
      };
      const result = hadSteps
        ? await api.PUT('/agent/{conversation_id}', {
            params: { path: { conversation_id: conversationId } },
            parseAs: options.stream ? 'stream' : 'json',
            body: {
              client: clientInfo,
              response: options.stream ? 'stream' : 'complete',
              turn,
            },
          })
        : await api.POST('/agent/{conversation_id}', {
            params: { path: { conversation_id: conversationId } },
            parseAs: options.stream ? 'stream' : 'json',
            body: {
              client: clientInfo,
              type: options.type,
              context: options.context,
              model: options.model,
              response: options.stream ? 'stream' : 'complete',
              turn,
            },
          });

      if (result.response.status === 206) {
        const deferred = options.stream
          ? ((await result.response.json()) as components['schemas']['DeferredToolResponse'])
          : (result.data as components['schemas']['DeferredToolResponse']);
        return finishStep(step, {
          turn_id: step.turnId,
          messages: [],
          tool_calls: deferred.tool_calls,
        });
      }
      if (!result.response.ok) throw await responseError(result.response);

      if (options.stream) {
        const parsed = await new Promise<ParsedAgentMessage>((resolve, reject) => {
          const parser = AgentStreamParser.fromResponse(result.response, {
            onUpdate: (partial) => updateStreamingStep(step, partial),
            onComplete: resolve,
            onError: reject,
          });
          parser.readAll().catch(reject);
        });
        return finishStep(step, parsedToTurn(step.turnId, parsed));
      }

      return finishStep(step, result.data as Turn);
    } catch (error) {
      state$.steps.splice(-1, 1);
      const normalized = error instanceof Error ? error : new Error(String(error));
      state$.error.set(normalized);
      throw normalized;
    } finally {
      state$.currentStep.set(undefined);
      state$.isWorking.set(false);
    }
  }

  function updateStreamingStep(step: ConversationStep, parsed: ParsedAgentMessage) {
    const index = state$.steps.length - 1;
    state$.steps[index].set({
      ...step,
      output: ObservableHint.opaque(parsedToTurn(step.turnId, parsed)),
      complete: parsed.complete,
    });
  }

  function finishStep(step: ConversationStep, output: Turn): ConversationStep {
    const complete = {
      ...step,
      complete: true,
      output: { ...output, receivedAt: new Date() },
    };
    state$.steps[state$.steps.length - 1].set(ObservableHint.opaque(complete));
    state$.activeToolCalls.set((output.tool_calls ?? []).filter((call) => !call.output));
    return complete;
  }

  async function load() {
    state$.isLoading.set(true);
    state$.error.set(undefined);
    try {
      const result = await api.GET('/agent/{conversation_id}', {
        params: { path: { conversation_id: conversationId } },
      });
      if (!result.data) throw await responseError(result.response);
      const steps = result.data.turns.map(turnToStep);
      state$.steps.set(steps.map((step) => ObservableHint.opaque(step) as ConversationStep));
      const last = result.data.turns.at(-1);
      state$.activeToolCalls.set((last?.tool_calls ?? []).filter((call) => !call.output));
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      state$.error.set(normalized);
      throw normalized;
    } finally {
      state$.isLoading.set(false);
    }
  }

  return { state$, send, load };
}

function parsedToTurn(turnId: string, parsed: ParsedAgentMessage): Turn & { receivedAt: Date } {
  return {
    turn_id: turnId,
    messages: parsed.text ? [{ role: 'assistant', content: parsed.text }] : [],
    tool_calls: parsed.toolCalls as ToolCall[],
    receivedAt: new Date(),
  };
}

function turnToStep(turn: Turn): ConversationStep {
  const message = turn.messages?.find((candidate) => candidate.role === 'user');
  const assistant = turn.messages?.filter((candidate) => candidate.role === 'assistant');
  return {
    turnId: turn.turn_id,
    message: contentText(message?.content) || undefined,
    sentAt: new Date(),
    complete: true,
    output: { ...turn, messages: assistant, receivedAt: new Date() },
  };
}

function contentText(content: components['schemas']['TurnMessageContent'] | undefined): string {
  if (typeof content === 'string') return content;
  return content?.map((part) => (part.type === 'text' ? part.text : '')).join('') ?? '';
}

function externalId(
  type: typeof ExternalIDType.AgentConversation | typeof ExternalIDType.AgentConversationTurn,
) {
  return toExternalID(type, randomUuid());
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) =>
    (
      Number(character) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(character) / 4)))
    ).toString(16),
  );
}

async function responseError(response: Response): Promise<Error> {
  let detail = response.statusText || `HTTP ${response.status}`;
  try {
    const body = (await response.clone().json()) as { message?: string; error?: string };
    detail = body.message ?? body.error ?? detail;
  } catch {
    // Preserve the HTTP status text when the response is not JSON.
  }
  return Object.assign(new Error(detail), { status: response.status });
}

import type { ModelMessage } from 'ai';
import type { Insertable, Selectable, Updateable } from 'kysely';

import type {
  Clients,
  Conversations,
  JsonObject,
  JsonValue,
  Messages,
  Models,
  Turns,
} from '../generated/database.js';
import type { AgentInternal } from '../types/index.js';

import { toStoredConversationMessages } from './agent/messages.js';
import { type InjectedToolCall, injectedToolCallsToStoredMessages } from './context.js';
import { applyToolDelta, normalizeToolNames } from './tools/state.js';

function toDatabaseJson<T extends JsonValue | JsonObject>(value: T): T {
  return JSON.stringify(value) as unknown as T;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface CreateConversationInput {
  conversationId?: Insertable<Conversations>['conversation_uuid'];
  agentId: Insertable<Conversations>['agent_id'];
  client: {
    name: Selectable<Clients>['name'];
    version: Insertable<Conversations>['client_version'];
  };
  model?: Selectable<Models>['name'];
  systemPrompt?: Selectable<Conversations>['system_prompt'];
  startingTools?: string[];
  initialMessages?: ModelMessage[];
  injectedToolCalls?: InjectedToolCall[];
  forkedFromConversationUuid?: Selectable<Conversations>['conversation_uuid'];
  forkedAfterOrdinal?: Insertable<Conversations>['forked_after_ordinal'];
  extraData?: JsonObject;
}

export async function createConversation(
  app: AgentInternal['App'],
  input: CreateConversationInput,
) {
  const clientId = await resolveClientId(app, input.client.name);
  const values: Insertable<Conversations> = {
    conversation_uuid: input.conversationId,
    agent_id: input.agentId,
    client_id: clientId,
    client_version: input.client.version,
    system_prompt: input.systemPrompt ?? null,
    forked_after_ordinal: input.forkedAfterOrdinal ?? null,
    starting_tools: normalizeToolNames(input.startingTools),
    extra_data: toDatabaseJson((input.extraData ?? {}) as JsonObject),
  };

  if (input.model) {
    const [modelRow] = await app.locals.models.resolveIdsFromNames([input.model]);
    if (modelRow) {
      values.model_id = modelRow?.model_id;
    }
  }

  if (input.forkedFromConversationUuid) {
    const parent = await app.locals.db
      .selectFrom('conversations')
      .select('conversation_id')
      .where('conversation_uuid', '=', input.forkedFromConversationUuid)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!parent) {
      throw new Error(`Conversation not found: ${input.forkedFromConversationUuid}`);
    }
    values.forked_from_conversation_id = parent.conversation_id;
  }

  const row = await app.locals.db
    .insertInto('conversations')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();

  const storedInitialMessages = [
    ...(input.initialMessages ? toStoredConversationMessages(input.initialMessages) : []),
    ...(input.injectedToolCalls ? injectedToolCallsToStoredMessages(input.injectedToolCalls) : []),
  ];

  if (storedInitialMessages.length > 0) {
    const seedTurn = await app.locals.db
      .insertInto('turns')
      .values({
        conversation_id: row.conversation_id,
        status: 'complete',
        client_id: values.client_id,
        client_version: input.client.version,
        added_tools: [],
        removed_tools: [],
        completed_at: new Date(),
        extra_data: toDatabaseJson({
          type: 'initial-messages',
        }),
      })
      .returning('turn_uuid')
      .executeTakeFirstOrThrow();

    await addMessages(app, seedTurn.turn_uuid, storedInitialMessages);
  }

  return toConversation(app, row);
}

export interface ListConversationsInput {
  limit: number;
  offset: number;
  status?: string;
  agentId?: string;
}

export async function listConversations(app: AgentInternal['App'], input: ListConversationsInput) {
  let query = app.locals.roDb.selectFrom('conversations').where('deleted_at', 'is', null);

  if (input.status) {
    query = query.where('status', '=', input.status as Selectable<Conversations>['status']);
  }
  if (input.agentId) {
    query = query.where('agent_id', '=', input.agentId);
  }

  const countResult = await query
    .select((eb) => eb.fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow();

  const rows = await query
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(input.limit)
    .offset(input.offset)
    .execute();

  return {
    total: Number(countResult.total),
    rows: await Promise.all(rows.map((row) => toConversation(app, row))),
  };
}

export async function getConversation(app: AgentInternal['App'], conversationUuid: string) {
  const row = await app.locals.roDb
    .selectFrom('conversations')
    .selectAll()
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return toConversation(app, row);
}

export async function getConversationForTurn(app: AgentInternal['App'], turnUuid: string) {
  const row = await app.locals.roDb
    .selectFrom('conversations')
    .innerJoin('turns', 'turns.conversation_id', 'conversations.conversation_id')
    .selectAll('conversations')
    .where('turns.turn_uuid', '=', turnUuid)
    .where('conversations.deleted_at', 'is', null)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return toConversation(app, row);
}

export async function updateConversationStatus(
  app: AgentInternal['App'],
  conversationUuid: string,
  status: Updateable<Conversations>['status'],
) {
  const row = await app.locals.db
    .updateTable('conversations')
    .set({ status })
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return toConversation(app, row);
}

export async function updateConversationExtraData(
  app: AgentInternal['App'],
  conversationUuid: string,
  extraData: JsonObject,
) {
  const existing = await app.locals.db
    .selectFrom('conversations')
    .select('extra_data')
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!existing) {
    return null;
  }

  const merged = {
    ...((existing.extra_data as JsonObject | undefined) ?? {}),
    ...extraData,
  };

  const row = await app.locals.db
    .updateTable('conversations')
    .set({ extra_data: toDatabaseJson(merged) })
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return toConversation(app, row);
}

export async function updateConversationSystemPrompt(
  app: AgentInternal['App'],
  conversationUuid: string,
  systemPrompt: string | null,
) {
  const row = await app.locals.db
    .updateTable('conversations')
    .set({ system_prompt: systemPrompt })
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return toConversation(app, row);
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

export async function createTurn(
  app: AgentInternal['App'],
  conversationUuid: string,
  client: {
    name: Selectable<Clients>['name'];
    version: Insertable<Turns>['client_version'];
  },
) {
  const clientId = await resolveClientId(app, client.name);
  const conversation = await app.locals.db
    .selectFrom('conversations')
    .select('conversation_id')
    .where('conversation_uuid', '=', conversationUuid)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationUuid}`);
  }
  const row = await app.locals.db
    .insertInto('turns')
    .values({
      conversation_id: conversation.conversation_id,
      client_id: clientId,
      client_version: client.version,
      added_tools: [],
      removed_tools: [],
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return toTurn(app, row);
}

export async function getTurnStartTools(app: AgentInternal['App'], turnUuid: string) {
  const turn = await app.locals.roDb
    .selectFrom('turns')
    .innerJoin('conversations', 'conversations.conversation_id', 'turns.conversation_id')
    .select(['turns.turn_id', 'turns.conversation_id', 'conversations.starting_tools'])
    .where('turns.turn_uuid', '=', turnUuid)
    .where('conversations.deleted_at', 'is', null)
    .executeTakeFirst();

  if (!turn) {
    return null;
  }

  const priorTurnDeltas = await app.locals.roDb
    .selectFrom('turns')
    .select(['added_tools', 'removed_tools'])
    .where('conversation_id', '=', turn.conversation_id)
    .where('turn_id', '<', turn.turn_id)
    .orderBy('turn_id', 'asc')
    .execute();

  return priorTurnDeltas.reduce(
    (toolNames, priorTurn) =>
      applyToolDelta(toolNames, {
        addedTools: priorTurn.added_tools,
        removedTools: priorTurn.removed_tools,
      }),
    normalizeToolNames(turn.starting_tools),
  );
}

export async function getTurn(app: AgentInternal['App'], turnUuid: string) {
  const row = await app.locals.roDb
    .selectFrom('turns')
    .selectAll()
    .where('turn_uuid', '=', turnUuid)
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return toTurn(app, row);
}

export async function getConversationTurns(app: AgentInternal['App'], conversationUuid: string) {
  const rows = await app.locals.roDb
    .selectFrom('turns')
    .innerJoin('conversations', 'conversations.conversation_id', 'turns.conversation_id')
    .selectAll('turns')
    .where('conversations.conversation_uuid', '=', conversationUuid)
    .where('conversations.deleted_at', 'is', null)
    .orderBy('turns.started_at', 'asc')
    .orderBy('turns.turn_id', 'asc')
    .execute();

  return Promise.all(rows.map((row) => toTurn(app, row)));
}

export async function getInflightTurn(app: AgentInternal['App'], conversationUuid: string) {
  const row = await app.locals.roDb
    .selectFrom('turns')
    .innerJoin('conversations', 'conversations.conversation_id', 'turns.conversation_id')
    .selectAll('turns')
    .where('conversations.conversation_uuid', '=', conversationUuid)
    .where('conversations.deleted_at', 'is', null)
    .where('turns.status', 'in', ['pending', 'streaming'])
    .orderBy('turns.turn_id', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return toTurn(app, row);
}

export async function updateTurnStatus(
  app: AgentInternal['App'],
  turnUuid: string,
  status: Updateable<Turns>['status'],
  extra?: {
    error?: string;
    totalLatencyMs?: number;
    extraData?: JsonObject;
    model?: Selectable<Models>['name'];
    addedTools?: Insertable<Turns>['added_tools'];
    inputTokens?: Insertable<Turns>['input_tokens'];
    outputTokens?: Insertable<Turns>['output_tokens'];
    removedTools?: Insertable<Turns>['removed_tools'];
    finishReason?: Insertable<Turns>['finish_reason'];
    rawFinishReason?: Insertable<Turns>['raw_finish_reason'];
  },
) {
  const updates: Updateable<Turns> = { status };
  const existing = extra?.extraData
    ? await app.locals.db
        .selectFrom('turns')
        .select('extra_data')
        .where('turn_uuid', '=', turnUuid)
        .executeTakeFirst()
    : null;

  if (status === 'complete' || status === 'failed' || status === 'input-required') {
    updates.completed_at = new Date();
  }
  if (extra?.error !== undefined) {
    updates.error = extra.error;
  }
  if (extra?.totalLatencyMs !== undefined) {
    updates.total_latency_ms = extra.totalLatencyMs;
  }
  if (extra?.inputTokens !== undefined) {
    updates.input_tokens = extra.inputTokens;
  }
  if (extra?.addedTools !== undefined) {
    updates.added_tools = normalizeToolNames(extra.addedTools);
  }
  if (extra?.outputTokens !== undefined) {
    updates.output_tokens = extra.outputTokens;
  }
  if (extra?.removedTools !== undefined) {
    updates.removed_tools = normalizeToolNames(extra.removedTools);
  }
  if (extra?.finishReason !== undefined) {
    updates.finish_reason = extra.finishReason;
  }
  if (extra?.rawFinishReason !== undefined) {
    updates.raw_finish_reason = extra.rawFinishReason;
  }
  if (extra?.extraData !== undefined) {
    updates.extra_data = toDatabaseJson({
      ...((existing?.extra_data as JsonObject | undefined) ?? {}),
      ...extra.extraData,
    });
  }
  if (extra?.model) {
    const [modelRow] = await app.locals.models.resolveIdsFromNames([extra.model]);
    updates.model_id = modelRow?.model_id ?? null;
  }

  const row = await app.locals.db
    .updateTable('turns')
    .set(updates)
    .where('turn_uuid', '=', turnUuid)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return toTurn(app, row);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface AddMessageInput {
  role: Insertable<Messages>['role'];
  content?: Insertable<Messages>['content'];
  toolCalls?: Insertable<Messages>['tool_calls'];
  toolCallId?: Insertable<Messages>['tool_call_id'];
  extraData?: JsonObject;
}

export async function addMessages(
  app: AgentInternal['App'],
  turnUuid: string,
  messages: AddMessageInput[],
) {
  if (messages.length === 0) {
    return [];
  }

  const turn = await app.locals.db
    .selectFrom('turns')
    .select(['turn_id', 'conversation_id'])
    .where('turn_uuid', '=', turnUuid)
    .executeTakeFirst();

  if (!turn) {
    throw new Error(`Turn not found: ${turnUuid}`);
  }

  const lastMessage = await app.locals.db
    .selectFrom('messages')
    .select('ordinal')
    .where('conversation_id', '=', turn.conversation_id)
    .orderBy('ordinal', 'desc')
    .limit(1)
    .executeTakeFirst();

  let nextOrdinal = (lastMessage?.ordinal ?? 0) + 1;

  const values: Insertable<Messages>[] = messages.map((msg) => {
    const row: Insertable<Messages> = {
      conversation_id: turn.conversation_id,
      turn_id: turn.turn_id,
      ordinal: nextOrdinal++,
      role: msg.role,
      content: toDatabaseJson(msg.content ?? ''),
      tool_calls: msg.toolCalls === undefined ? null : toDatabaseJson(msg.toolCalls),
      tool_call_id: msg.toolCallId ?? null,
      extra_data: toDatabaseJson((msg.extraData ?? {}) as JsonObject),
    };
    return row;
  });

  const rows = await app.locals.db.insertInto('messages').values(values).returningAll().execute();

  return rows.map((row) => toMessage(row));
}

export async function getConversationMessages(app: AgentInternal['App'], conversationUuid: string) {
  const rows = await app.locals.roDb
    .selectFrom('messages')
    .innerJoin('conversations', 'conversations.conversation_id', 'messages.conversation_id')
    .selectAll('messages')
    .where('conversations.conversation_uuid', '=', conversationUuid)
    .where('conversations.deleted_at', 'is', null)
    .orderBy('messages.ordinal', 'asc')
    .execute();

  return rows.map((row) => toMessage(row));
}

export async function getTurnMessages(app: AgentInternal['App'], turnUuid: string) {
  const rows = await app.locals.roDb
    .selectFrom('messages')
    .innerJoin('turns', 'turns.turn_id', 'messages.turn_id')
    .selectAll('messages')
    .where('turns.turn_uuid', '=', turnUuid)
    .orderBy('messages.ordinal', 'asc')
    .execute();

  return rows.map((row) => toMessage(row));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ConversationRow = Selectable<Conversations>;
type TurnRow = Selectable<Turns>;
type MessageRow = Selectable<Messages>;
type ModelName = Selectable<Models>['name'];

async function toConversation(app: AgentInternal['App'], row: ConversationRow) {
  let model: ModelName | undefined;
  let client: string | undefined;
  if (row.model_id) {
    const [modelRow] = await app.locals.models.resolveNamesFromIds([row.model_id]);
    model = modelRow?.name;
  }
  if (row.client_id) {
    const [clientRow] = await app.locals.clients.resolveNamesFromIds([row.client_id]);
    client = clientRow?.name;
  }

  return {
    conversationId: row.conversation_uuid,
    agentId: row.agent_id,
    status: row.status,
    client,
    clientVersion: row.client_version,
    model,
    startingTools: normalizeToolNames(row.starting_tools),
    systemPrompt: row.system_prompt ?? undefined,
    forkedFromConversationId: row.forked_from_conversation_id
      ? String(row.forked_from_conversation_id)
      : undefined,
    forkedAfterOrdinal: row.forked_after_ordinal ?? undefined,
    extraData: row.extra_data as Record<string, unknown>,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function toTurn(app: AgentInternal['App'], row: TurnRow) {
  let model: ModelName | undefined;
  let client: string | undefined;
  if (row.model_id) {
    const [modelRow] = await app.locals.models.resolveNamesFromIds([row.model_id]);
    model = modelRow?.name;
  }
  if (row.client_id) {
    const [clientRow] = await app.locals.clients.resolveNamesFromIds([row.client_id]);
    client = clientRow?.name;
  }

  return {
    turnId: row.turn_uuid,
    conversationId: String(row.conversation_id),
    status: row.status,
    client,
    clientVersion: row.client_version,
    model,
    addedTools: normalizeToolNames(row.added_tools),
    removedTools: normalizeToolNames(row.removed_tools),
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? undefined,
    error: row.error ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    rawFinishReason: row.raw_finish_reason ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    totalLatencyMs: row.total_latency_ms ?? undefined,
    extraData: row.extra_data as Record<string, unknown>,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toMessage(row: MessageRow) {
  return {
    messageId: row.message_uuid,
    ordinal: row.ordinal,
    role: row.role,
    content: row.content,
    toolCalls: row.tool_calls ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    extraData: row.extra_data as Record<string, unknown>,
    createdAt: row.created_at.toISOString(),
  };
}

async function resolveClientId(app: AgentInternal['App'], clientName: Selectable<Clients>['name']) {
  await app.locals.db
    .insertInto('clients')
    .values({
      name: clientName,
    })
    .onConflict((conflict) => conflict.column('name').doNothing())
    .execute();

  const [clientRow] = await app.locals.clients.resolveIdsFromNames([clientName]);
  if (!clientRow) {
    throw new Error(`Could not resolve client: ${clientName}`);
  }

  return clientRow.client_id;
}

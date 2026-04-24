import { listConversations } from '#src/lib/db.js';
import { getConversationId } from '#src/lib/ids.js';
import type { AgentInternalApi } from '#src/types/index.js';

function toApiConversationStatus(status: string) {
  switch (status) {
    case 'completed':
    case 'failed':
      return status;
    default:
      return 'running';
  }
}

export const get: AgentInternalApi['listConversations'] = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;

  const result = await listConversations(req.app, { limit, offset, status, agentId });

  res.json({
    conversations: result.rows.map((c) => ({
      conversation_id: getConversationId(c.conversationId),
      agent_id: c.agentId,
      status: toApiConversationStatus(c.status),
      model: c.model,
      client: c.client,
      client_version: c.clientVersion,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      extra_data: c.extraData,
    })),
    total: result.total,
    limit,
    offset,
  });
};

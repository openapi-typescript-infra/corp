import type { components as AgentComponents } from '@justtellme/agent-internal-client';
import { AuthPrincipal } from '@justtellme/auth-token';
import { ServiceError } from '@openapi-typescript-infra/service';

import type { components } from '#src/generated/service/index.ts';
import { pipeAgentStream } from '#src/lib/agent-stream.ts';
import type { RestApi, RestApiApi } from '#src/types/index.ts';

async function getCaller(req: RestApi['Request'], res: object) {
  const { getForwardHeaders } = (
    res as { locals: { getForwardHeaders(): Promise<Record<string, string> | undefined> } }
  ).locals;
  const headers = await getForwardHeaders();
  const identityToken = headers?.['x-auth-token'];
  if (!identityToken) {
    throw new ServiceError(req.app, 'Login required', { status: 401, expected_error: true });
  }

  const principal = new AuthPrincipal(identityToken);
  const identifier = principal.userUuid ?? principal.clientId;
  if (!identifier || principal.role === 'service') {
    throw new ServiceError(req.app, 'Login required', { status: 401, expected_error: true });
  }

  return { identityToken, owner: `${principal.role}:${identifier}` };
}

function getConversationId(req: RestApi['Request']): string {
  const id = req.params.conversation_id;
  return Array.isArray(id) ? id[0] : id;
}

export const GET: RestApiApi['getAgentConversation'] = async (req, res) => {
  const { owner } = await getCaller(req, res);
  const rz = await req.app.locals.datasources.agentInternal.GET(
    '/conversations/{conversation_id}',
    {
      params: {
        path: { conversation_id: getConversationId(req) },
        query: { owners: [owner], metadata: false },
      },
    },
  );
  if (!rz.data) {
    throw new ServiceError(req.app, 'Conversation not found', {
      status: 404,
      expected_error: true,
    });
  }

  const sanitized: components['schemas']['AgentConversationDetails'] = {
    conversation_id: rz.data.conversation_id,
    status: rz.data.status,
    error: rz.data.error,
    created_at: rz.data.created_at,
    updated_at: rz.data.updated_at,
    turns: rz.data.turns.map((turn) => ({ ...turn, metadata: undefined })),
  };
  res.json(sanitized);
};

export const POST: RestApiApi['createAgentConversation'] = async (req, res) => {
  const { identityToken, owner } = await getCaller(req, res);
  const body = req.body;
  const upstreamBody: AgentComponents['schemas']['CreateConversationRequest'] = {
    client: body.client,
    type: body.type,
    options: body.options,
    context: body.context,
    model: body.model,
    starting_tools: body.starting_tools,
    response: body.response,
    turn: body.turn,
    owners: [owner],
    identity_token: identityToken,
  };
  const rz = await req.app.locals.datasources.agentInternal.POST(
    '/conversations/{conversation_id}',
    {
      parseAs: body.response === 'stream' ? 'stream' : 'json',
      params: { path: { conversation_id: getConversationId(req) } },
      body: upstreamBody,
    },
  );

  if (body.response === 'stream') {
    await pipeAgentStream(rz.response, res);
    return;
  }
  res.status(rz.response.status).json(rz.data as components['schemas']['Conversation']);
};

export const PUT: RestApiApi['agentConversationTurn'] = async (req, res) => {
  const { identityToken, owner } = await getCaller(req, res);
  const body = req.body;
  const rz = await req.app.locals.datasources.agentInternal.PUT(
    '/conversations/{conversation_id}',
    {
      parseAs: body.response === 'stream' ? 'stream' : 'json',
      params: {
        path: { conversation_id: getConversationId(req) },
        query: { owners: [owner] },
      },
      body: {
        client: body.client,
        turn: body.turn,
        response: body.response,
        identity_token: identityToken,
      },
    },
  );

  if (body.response === 'stream') {
    await pipeAgentStream(rz.response, res);
    return;
  }
  res
    .status(rz.response.status)
    .json(rz.data as components['schemas']['Turn'] | components['schemas']['DeferredToolResponse']);
};

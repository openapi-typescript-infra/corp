import { ServiceError } from '@openapi-typescript-infra/service';
import type { ResponseMode, TurnResult } from '#src/lib/agent/types.js';
import {
  ensureConversation,
  getRequiredConversation,
  persistConversationTurn,
  processDeferredToolResponses,
} from '#src/lib/conversations.js';
import { getInflightTurn } from '#src/lib/db.js';
import { getConversationId, getTurnId } from '#src/lib/ids.js';
import { streamTurnResponse } from '#src/lib/redis.js';
import { getApiConversation, getApiTurn } from '#src/lib/turns.js';
import {
  ensureConversationWorkflow,
  signalConversationTurn,
  waitForConversationTurnResult,
} from '#src/lib/workflow.js';
import type { AgentInternal, AgentInternalApi } from '#src/types/index.js';

function getConversationIdParam(req: AgentInternal['Request']): string {
  const id = getConversationIdParam(req);
  return Array.isArray(id) ? id[0] : id;
}

function waitForTurnResultUntilClose(
  req: AgentInternal['Request'],
  app: AgentInternal['App'],
  input: { conversationId: string; turnId: string },
): Promise<TurnResult | undefined> {
  return new Promise<TurnResult | undefined>((resolve, reject) => {
    let settled = false;
    const onClose = () => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    };
    req.on('close', onClose);
    if (req.destroyed) {
      settled = true;
      resolve(undefined);
      return;
    }

    waitForConversationTurnResult(app, input)
      .then((result) => {
        req.off('close', onClose);
        if (!settled) {
          settled = true;
          resolve(result);
        }
      })
      .catch((error) => {
        req.off('close', onClose);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
  });
}

async function respondToTurn(
  req: AgentInternal['Request'],
  res: AgentInternal['Response'],
  opts: {
    conversationId: string;
    turnId: string;
    responseMode: ResponseMode;
    alreadySignaled: boolean;
    identityToken?: string;
  },
) {
  const { conversationId, turnId, responseMode, alreadySignaled, identityToken } = opts;

  if (responseMode === 'stream' && !alreadySignaled) {
    res.status(202);
    await streamTurnResponse(
      req.app,
      {
        turnUuid: turnId,
        signal: () =>
          signalConversationTurn(req.app, {
            conversationId,
            turnId,
            response: 'stream',
            identityToken,
          }),
      },
      res as unknown as AgentInternal['Response'],
    );
    return;
  }

  if (!alreadySignaled) {
    await signalConversationTurn(req.app, {
      conversationId,
      turnId,
      response: responseMode,
      identityToken,
    });
  }

  if (responseMode === 'complete' || responseMode === 'stream') {
    const turnResult = await waitForTurnResultUntilClose(req, req.app, {
      conversationId,
      turnId,
    });
    if (!turnResult) return;
    if (turnResult.status === 'failed') {
      throw new ServiceError(req.app, turnResult.error, { status: 500 });
    }

    const turn = await getApiTurn(req.app, turnId);
    if (!turn) {
      throw new ServiceError(req.app, `Turn not found: ${turnId}`, { status: 404 });
    }

    res.json(turn);
    return;
  }

  res.json({
    conversation_id: getConversationId(conversationId),
    status: 'running',
  });
}

function sendDeferralResponse(
  res: AgentInternal['Response'],
  conversationId: string,
  deferral: NonNullable<Awaited<ReturnType<typeof processDeferredToolResponses>>>,
) {
  res.status(206).json({
    conversation_id: getConversationId(conversationId),
    status: deferral.status,
    tool_calls: deferral.toolCalls,
  });
}

export const get: AgentInternalApi['getConversation'] = async (req, res) => {
  const metadata = req.query.metadata === 'true';
  const turnId = typeof req.query.turn_id === 'string' ? req.query.turn_id : undefined;

  const apiConversation = await getApiConversation(req.app, getConversationIdParam(req), {
    metadata,
    turnId,
  });
  if (!apiConversation) {
    throw new ServiceError(req.app, `Conversation not found: ${getConversationIdParam(req)}`, {
      status: 404,
    });
  }

  res.json(apiConversation);
};

export const post: AgentInternalApi['createConversation'] = async (req, res) => {
  const body = req.body;
  if (!body) {
    throw new ServiceError(req.app, 'Request body is required', { status: 400 });
  }

  const responseMode: ResponseMode = body.response ?? 'none';
  const identityToken = body.identity_token;

  const conversation = await ensureConversation(req.app, getConversationIdParam(req), body);
  await ensureConversationWorkflow(req.app, conversation.conversationId);

  if (!body.turn) {
    res.json({
      conversation_id: getConversationId(conversation.conversationId),
      status: 'running',
    });
    return;
  }

  const inflightTurn =
    responseMode !== 'none' ? await getInflightTurn(req.app, conversation.conversationId) : null;

  if (inflightTurn) {
    await respondToTurn(req, res as AgentInternal['Response'], {
      conversationId: conversation.conversationId,
      turnId: inflightTurn.turnId,
      responseMode,
      alreadySignaled: true,
      identityToken,
    });
    return;
  }

  const persistedTurn = await persistConversationTurn(
    req.app,
    conversation.conversationId,
    body.turn,
    body.client,
    { identityToken },
  );

  await respondToTurn(req, res as AgentInternal['Response'], {
    conversationId: conversation.conversationId,
    turnId: persistedTurn.turnId,
    responseMode,
    alreadySignaled: false,
    identityToken,
  });
};

export const put: AgentInternalApi['conversationTurn'] = async (req, res) => {
  const body = req.body;
  if (!body) {
    throw new ServiceError(req.app, 'Request body is required', { status: 400 });
  }
  const responseMode: ResponseMode = body.response ?? 'complete';
  const identityToken = body.identity_token;

  const conversation = await getRequiredConversation(req.app, getConversationIdParam(req));
  await ensureConversationWorkflow(req.app, conversation.conversationId);

  const inflightTurn =
    responseMode !== 'none' ? await getInflightTurn(req.app, conversation.conversationId) : null;

  if (inflightTurn) {
    await respondToTurn(req, res as AgentInternal['Response'], {
      conversationId: conversation.conversationId,
      turnId: inflightTurn.turnId,
      responseMode,
      alreadySignaled: true,
      identityToken,
    });
    return;
  }

  const deferral = await processDeferredToolResponses(
    req.app,
    conversation.conversationId,
    body.turn.tool_responses ?? [],
    { identityToken },
  );

  if (deferral) {
    sendDeferralResponse(res as AgentInternal['Response'], conversation.conversationId, deferral);
    return;
  }

  const persistedTurn = await persistConversationTurn(
    req.app,
    conversation.conversationId,
    body.turn,
    body.client,
    { identityToken },
  );

  if (responseMode === 'none') {
    await signalConversationTurn(req.app, {
      conversationId: conversation.conversationId,
      turnId: persistedTurn.turnId,
      response: responseMode,
      identityToken,
    });
    res.json({
      turn_id: getTurnId(persistedTurn.turnId),
      messages: body.turn.messages,
    });
    return;
  }

  await respondToTurn(req, res as AgentInternal['Response'], {
    conversationId: conversation.conversationId,
    turnId: persistedTurn.turnId,
    responseMode,
    alreadySignaled: false,
    identityToken,
  });
};

export const patch: AgentInternalApi['updateConversation'] = async (req, res) => {
  const body = req.body;
  if (!body) {
    throw new ServiceError(req.app, 'Request body is required', { status: 400 });
  }

  const conversation = await getRequiredConversation(req.app, getConversationIdParam(req));

  res.json({
    conversation_id: getConversationId(conversation.conversationId),
    status:
      conversation.status === 'completed' || conversation.status === 'failed'
        ? conversation.status
        : 'running',
  });
};

import type { AgentInternal } from '#src/types/index.js';
import type { ResponseMode, TurnResult } from './agent/types.js';

const WORKFLOW_ID_PREFIX = 'conversation';

function getConversationWorkflowId(conversationId: string) {
  return `${WORKFLOW_ID_PREFIX}:${conversationId}`;
}

export async function ensureConversationWorkflow(
  app: AgentInternal['App'],
  conversationId: string,
) {
  const temporal = app.locals.defaultTemporal;
  if (!temporal) {
    app.locals.logger.warn('Temporal not configured, skipping workflow creation');
    return;
  }

  const workflowId = getConversationWorkflowId(conversationId);

  try {
    const handle = temporal.client.workflow.getHandle(workflowId);
    await handle.describe();
    // Workflow already exists
  } catch {
    // Start a new workflow
    await temporal.client.workflow.start('ConversationWorkflow', {
      workflowId,
      taskQueue: app.locals.config.defaultTemporal?.taskQueue ?? 'agent-internal',
      args: [{ conversationId }],
    });
  }
}

export async function signalConversationTurn(
  app: AgentInternal['App'],
  input: {
    conversationId: string;
    turnId: string;
    response?: ResponseMode;
    identityToken?: string;
  },
) {
  const temporal = app.locals.defaultTemporal;
  if (!temporal) {
    // If Temporal is not configured, run the turn directly
    const { runStoredTurn } = await import('./agent/runtime.js');
    await runStoredTurn(app, {
      conversationId: input.conversationId,
      turnId: input.turnId,
      response: input.response,
      identityToken: input.identityToken,
    });
    return;
  }

  const workflowId = getConversationWorkflowId(input.conversationId);
  const handle = temporal.client.workflow.getHandle(workflowId);
  await handle.signal('turn', {
    turnId: input.turnId,
    response: input.response,
    identityToken: input.identityToken,
  });
}

export async function waitForConversationTurnResult(
  app: AgentInternal['App'],
  input: { conversationId: string; turnId: string },
): Promise<TurnResult> {
  const temporal = app.locals.defaultTemporal;
  if (!temporal) {
    throw new Error('Temporal not configured');
  }

  const workflowId = getConversationWorkflowId(input.conversationId);
  const handle = temporal.client.workflow.getHandle(workflowId);
  return handle.executeUpdate('waitForTurnResult', { args: [{ turnId: input.turnId }] });
}

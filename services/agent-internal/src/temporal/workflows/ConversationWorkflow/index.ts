import {
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type { TurnResult } from '#src/lib/agent/types.js';
import type { createAgentActivities } from '#src/temporal/activities/index.js';

const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TurnSignalInput {
  turnId: string;
  response?: string;
}

interface WaitForTurnResultInput {
  turnId: string;
}

const turnSignal = defineSignal<[TurnSignalInput]>('turn');
const statusQuery = defineQuery<string>('status');
const waitForTurnResult = defineUpdate<TurnResult, [WaitForTurnResultInput]>('waitForTurnResult');

export async function ConversationWorkflow(input: { conversationId: string }): Promise<void> {
  const activities = proxyActivities<ReturnType<typeof createAgentActivities>>({
    startToCloseTimeout: '5m',
  });

  const pendingTurns: TurnSignalInput[] = [];
  const turnResults = new Map<string, TurnResult>();

  setHandler(turnSignal, (turnInput) => {
    pendingTurns.push(turnInput);
  });

  setHandler(statusQuery, () => {
    return pendingTurns.length > 0 ? 'processing' : 'idle';
  });

  setHandler(
    waitForTurnResult,
    async (waitInput) => {
      const existing = turnResults.get(waitInput.turnId);
      if (existing) return existing;

      await condition(() => turnResults.has(waitInput.turnId), '30s');
      const result = turnResults.get(waitInput.turnId);
      if (!result) {
        throw new Error(`Turn result not found: ${waitInput.turnId}`);
      }
      return result;
    },
    {
      validator: (waitInput) => {
        if (!waitInput.turnId) {
          throw new Error('turnId is required');
        }
      },
    },
  );

  while (true) {
    const hasWork = await condition(() => pendingTurns.length > 0, IDLE_TIMEOUT_MS);
    if (!hasWork) {
      break;
    }

    while (pendingTurns.length > 0) {
      const turnInput = pendingTurns.shift();
      if (!turnInput) break;
      try {
        const result = await activities.runTurn({
          conversationId: input.conversationId,
          turnId: turnInput.turnId,
          response: turnInput.response,
        });
        turnResults.set(turnInput.turnId, result);
      } catch (error) {
        turnResults.set(turnInput.turnId, {
          turnId: turnInput.turnId,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

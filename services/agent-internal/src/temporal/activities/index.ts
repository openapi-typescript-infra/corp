import { runStoredTurn } from '#src/lib/agent/runtime.js';
import type { AgentInternal } from '#src/types/index.js';

export function createAgentActivities(app: AgentInternal['App']) {
  return {
    async runTurn(input: { conversationId: string; turnId: string; response?: string }) {
      return runStoredTurn(app, {
        conversationId: input.conversationId,
        turnId: input.turnId,
        response: input.response as 'none' | 'stream' | 'complete' | undefined,
      });
    },
  };
}

import type { ReturnToClientStatus, ToolUseSession } from '@justtellme/tools';
import {
  getReturnToClientStatus,
  isReturnToClient,
  processToolClientResult,
} from '@justtellme/tools';

import type { components } from '#src/generated/service/index.js';

type ToolResponse = components['schemas']['AgentToolResponse'];
type ToolCall = components['schemas']['AgentToolCall'];

export interface DeferralResult {
  toolCalls: ToolCall[];
  status: ReturnToClientStatus;
}

export async function checkToolResponseDeferrals(
  session: ToolUseSession,
  toolResponses: ToolResponse[],
  originalToolCalls: ToolCall[],
): Promise<DeferralResult | null> {
  if (toolResponses.length === 0) {
    return null;
  }

  const toolCallMap = new Map(originalToolCalls.map((tc) => [tc.id, tc]));
  const deferred: ToolCall[] = [];
  let hasDeferred = false;

  for (const response of toolResponses) {
    const clientResult = response.complex_result ?? response.text_result ?? '';
    const result = await processToolClientResult(response.name, session, clientResult, {
      toolCallId: response.id,
      messages: [],
    });

    if (isReturnToClient(result)) {
      const original = toolCallMap.get(response.id);
      deferred.push({
        id: response.id,
        name: response.name,
        input: original?.input ?? {},
        output: result as unknown as ToolCall['output'],
      } as ToolCall);
      if (getReturnToClientStatus(result) === 'deferred') {
        hasDeferred = true;
      }
    }
  }

  if (deferred.length === 0) {
    return null;
  }

  return {
    toolCalls: deferred,
    status: hasDeferred ? 'deferred' : 'input-required',
  };
}

import type { ReturnToClientStatus } from '@justtellme/tools';
import { getReturnToClientStatus, isReturnToClient } from '@justtellme/tools';
import type { StopCondition, ToolSet } from 'ai';

export const hasReturnToClient: StopCondition<ToolSet> = ({ steps }) => {
  const lastStep = steps.at(-1);
  if (!lastStep) {
    return false;
  }

  return lastStep.toolResults.some((toolResult) => isReturnToClient(toolResult.output));
};

export function resolveReturnToClientStatus(
  toolResults: readonly { output: unknown }[],
): ReturnToClientStatus | undefined {
  let hasReturn = false;

  for (const toolResult of toolResults) {
    const status = getReturnToClientStatus(toolResult.output);
    if (status === 'input-required') {
      return 'input-required';
    }
    if (status != null) {
      hasReturn = true;
    }
  }

  return hasReturn ? 'complete' : undefined;
}

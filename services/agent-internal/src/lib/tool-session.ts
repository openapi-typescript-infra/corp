import type { JTMPrincipal } from '@justtellme/auth-token';
import type { AsyncTaskProvider, ToolUseSession } from '@justtellme/tools';
import { createToolUseSession } from '@justtellme/tools';

import type { AgentInternal } from '#src/types/index.js';

// Augment ToolUseSession with our app-specific fields.
declare module '@justtellme/tools' {
  interface ToolUseSession {
    app?: AgentInternal['App'];
    principal?: JTMPrincipal;
  }
}

export function createAgentToolUseSession(
  app: AgentInternal['App'],
  asyncTaskProvider: AsyncTaskProvider,
  principal: JTMPrincipal | undefined,
  options: { role: string },
): ToolUseSession {
  const session = createToolUseSession({
    role: options.role,
    asyncTaskProvider,
  });

  // Add our extended fields
  return Object.assign(session, {
    app,
    principal,
  });
}

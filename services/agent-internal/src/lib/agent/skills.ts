import { tool } from 'ai';
import { z } from 'zod/v3';

export interface SkillSpec {
  name: string;
  description: string;
  detail: string;
  composable?: boolean;
  tools?: string[];
}

export function createSkillTools(
  skillSpecs: SkillSpec[],
  alreadyInvoked?: ReadonlySet<string>,
  onSkillInvoked?: (skillName: string) => void,
): Record<string, unknown> {
  const invoked = new Set<string>(alreadyInvoked);
  return Object.fromEntries(
    skillSpecs.map((spec) => {
      const description = spec.composable ? `${spec.description} (composable)` : spec.description;

      return [
        spec.name,
        tool({
          description,
          inputSchema: z.object({}),
          execute: async () => {
            if (invoked.has(spec.name)) {
              return 'This skill is already active. Follow the instructions already provided.';
            }
            invoked.add(spec.name);
            onSkillInvoked?.(spec.name);
            return spec.detail;
          },
        }),
      ];
    }),
  );
}

function hasToolName(tc: unknown): tc is { toolName: string } {
  return (
    typeof tc === 'object' &&
    tc !== null &&
    'toolName' in tc &&
    typeof (tc as { toolName: unknown }).toolName === 'string'
  );
}

export function extractInvokedSkillNames(
  messages: { role: string; toolCalls?: unknown }[],
  skillNames: ReadonlySet<string>,
): Set<string> {
  const invoked = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.toolCalls)) {
      continue;
    }
    for (const tc of message.toolCalls) {
      if (hasToolName(tc) && skillNames.has(tc.toolName)) {
        invoked.add(tc.toolName);
      }
    }
  }
  return invoked;
}

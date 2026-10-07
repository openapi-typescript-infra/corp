import { describe, expect, test } from 'vitest';
import { runAgentLoop } from './runtime.js';
import type { SessionAgent } from './types.js';

describe('AI SDK v7 agent stream', () => {
  test('moves instructions out of messages and preserves all steps in history', async () => {
    const responseMessages = [
      { role: 'assistant', content: 'First step' },
      { role: 'assistant', content: 'Final step' },
    ];
    const agent = {
      async stream(options: Record<string, unknown>) {
        expect(options).toEqual({
          instructions: 'Trusted prompt',
          messages: [{ role: 'user', content: 'Hello' }],
        });
        return {
          stream: (async function* () {
            yield { type: 'start' };
            yield { type: 'text-delta', text: 'Hello' };
            yield { type: 'finish' };
          })(),
          responseMessages: Promise.resolve(responseMessages),
          steps: Promise.resolve([
            { finishReason: 'tool-calls', usage: { inputTokens: 100, outputTokens: 10 } },
            {
              finishReason: 'stop',
              toolResults: [],
              usage: { inputTokens: 20, outputTokens: 5 },
            },
          ]),
        };
      },
    } as unknown as SessionAgent;
    const result = await runAgentLoop({
      agent,
      messages: [
        { role: 'system', content: 'Trusted prompt' },
        { role: 'user', content: 'Hello' },
      ],
    });
    expect(result.responseMessages).toEqual(responseMessages);
    expect(result.text).toBe('Hello');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(5);
    expect(result.finishReason).toBe('stop');
  });
});

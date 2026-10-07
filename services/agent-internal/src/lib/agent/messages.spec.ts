import { describe, expect, test } from 'vitest';
import { toSessionModelMessages, toStoredAgentMessages } from './messages.js';

describe('AI SDK v7 message conversion', () => {
  test('converts stored image references to file parts', () => {
    expect(
      toSessionModelMessages([
        { role: 'user', content: [{ type: 'image', url: 'https://example.com/image.png' }] },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'file', data: new URL('https://example.com/image.png'), mediaType: 'image' },
        ],
      },
    ]);
  });

  test('preserves reasoning files through persistence and replay', () => {
    const part = { type: 'reasoning-file' as const, data: 'aGVsbG8=', mediaType: 'image/png' };
    const stored = toStoredAgentMessages({
      responseMessages: [{ role: 'assistant', content: [part] }],
    });
    expect(
      toSessionModelMessages(
        stored.map((message) => ({ role: 'assistant' as const, content: message.content })),
      ),
    ).toEqual([{ role: 'assistant', content: [part] }]);
  });
});

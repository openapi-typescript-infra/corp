import { describe, expect, it, vi } from 'vitest';

import { createConversationStore } from './conversation.ts';

describe('createConversationStore', () => {
  it('creates a conversation through rest-api and records streamed output', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"type":"text-delta","delta":"Draft ready"}\n\n'),
              );
              controller.enqueue(
                encoder.encode('data: {"type":"finish","finishReason":"stop"}\n\n'),
              );
              controller.close();
            },
          }),
          { status: 202, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const store = createConversationStore({
      apiEndpoint: 'https://api.example.test',
      appName: 'example-web',
      appVersion: '1.0.0',
      type: 'example-assistant',
      stream: true,
      clientOptions: { fetch: fetchMock },
    });

    const step = await store.send('Help me with this.');

    expect(step.output?.messages).toEqual([{ role: 'assistant', content: 'Draft ready' }]);
    expect(store.state$.isWorking.get()).toBe(false);
    expect(store.state$.steps.get()).toHaveLength(1);

    const request = fetchMock.mock.calls[0]?.[0] as unknown as Request;
    expect(request.url).toMatch(/\/agent\/ai_/);
    expect(await request.clone().json()).toMatchObject({
      type: 'example-assistant',
      client: { name: 'example-web', version: '1.0.0' },
      response: 'stream',
    });
  });
});

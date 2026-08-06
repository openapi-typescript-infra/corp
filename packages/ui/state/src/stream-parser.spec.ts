import { describe, expect, it, vi } from 'vitest';

import { AgentStreamParser } from './stream-parser.ts';

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('AgentStreamParser', () => {
  it('accumulates text across chunks and completes on DONE', async () => {
    const onComplete = vi.fn();
    const parser = AgentStreamParser.fromResponse(
      streamResponse(['data: {"type":"text-delta","delta":"A res', 'ponse"}\n\ndata: [DONE]\n\n']),
      { onComplete },
    );

    expect(await parser.readAll()).toMatchObject({ text: 'A response', complete: true });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('assembles tool input and attaches its result', async () => {
    const parser = AgentStreamParser.fromResponse(
      streamResponse([
        'data: {"type":"tool-input-start","toolCallId":"call-1","toolName":"yes_no_question"}\n',
        'data: {"type":"tool-input-delta","toolCallId":"call-1","inputTextDelta":"{\\"question\\":\\"Continue?\\"}"}\n',
        'data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"yes_no_question"}\n',
        'data: {"type":"tool-output-available","toolCallId":"call-1","output":{"answer":true}}\n',
        'data: {"type":"finish","finishReason":"stop"}\n',
      ]),
    );

    expect((await parser.readAll()).toolCalls).toEqual([
      {
        id: 'call-1',
        name: 'yes_no_question',
        input: { question: 'Continue?' },
        output: { answer: true },
      },
    ]);
  });
});

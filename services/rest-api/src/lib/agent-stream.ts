interface StreamResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
  write(chunk: Uint8Array): boolean;
  end(): void;
  on(event: 'close', listener: () => void): unknown;
  off(event: 'close', listener: () => void): unknown;
}

export async function pipeAgentStream(upstream: Response, res: StreamResponse): Promise<void> {
  res.status(upstream.status);
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'text/event-stream');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders();

  const reader = upstream.body?.getReader();
  if (!reader) {
    res.end();
    return;
  }

  const cancel = () => void reader.cancel().catch(() => {});
  res.on('close', cancel);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } finally {
    res.off('close', cancel);
  }
}

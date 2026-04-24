import type { AgentInternal } from '#src/types/service.js';

export interface TurnStreamEvent {
  type: 'start' | 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  [key: string]: unknown;
}

export interface StreamTurnResponseInput {
  turnUuid: string;
  signal: () => Promise<void>;
}

const DONE_MESSAGE = 'data: [DONE]\n\n';

function createDeferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  let settled = false;

  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    };
    reject = (reason) => {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    };
  });

  return { promise, resolve, reject, isSettled: () => settled };
}

export async function subscribeToTurn(
  app: AgentInternal['App'],
  turnUuid: string,
  res: AgentInternal['Response'],
  options: { onMessage?: (message: string) => void } = {},
): Promise<() => Promise<void>> {
  const subscriber = app.locals.redis.duplicate();
  const channel = turnUuid;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    res.off('close', onClose);
    res.off('error', onError);
    try {
      if (subscriber.isOpen) {
        await subscriber.unsubscribe(channel, onMessage);
        await subscriber.close();
      }
    } catch {
      subscriber.destroy();
    }
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  };

  const onClose = () => void cleanup();
  const onError = () => void cleanup();
  const onMessage = (message: string) => {
    if (cleanedUp || res.writableEnded || res.destroyed) return;
    try {
      res.write(message);
      options.onMessage?.(message);
    } catch {
      void cleanup();
    }
  };

  await subscriber.connect();

  if (!res.headersSent) {
    if (!res.getHeader('Content-Type'))
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache, no-transform');
    if (!res.getHeader('Connection')) res.setHeader('Connection', 'keep-alive');
    if (!res.getHeader('X-Accel-Buffering')) res.setHeader('X-Accel-Buffering', 'no');
  }

  res.flushHeaders?.();
  res.on('close', onClose);
  res.on('error', onError);

  try {
    await subscriber.subscribe(channel, onMessage);
  } catch (error) {
    await cleanup();
    throw error;
  }

  return cleanup;
}

export async function publishTurnStreamEvent(
  app: AgentInternal['App'],
  turnUuid: string,
  event: TurnStreamEvent,
) {
  await app.locals.redis.publish(turnUuid, `data: ${JSON.stringify(event)}\n\n`);
}

export async function publishTurnStreamDone(app: AgentInternal['App'], turnUuid: string) {
  await app.locals.redis.publish(turnUuid, DONE_MESSAGE);
}

export async function publishTurnStreamError(
  app: AgentInternal['App'],
  turnUuid: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await publishTurnStreamEvent(app, turnUuid, { type: 'error', error: message });
}

export async function streamTurnResponse(
  app: AgentInternal['App'],
  input: StreamTurnResponseInput,
  res: AgentInternal['Response'],
) {
  let doneBuffer = '';
  const done = createDeferred();

  const onClose = () => {
    done.reject(new Error(`Turn stream closed before done message: ${input.turnUuid}`));
  };

  const onMessage = (message: string) => {
    if (done.isSettled()) return;
    doneBuffer = `${doneBuffer}${message}`;
    if (!doneBuffer.includes(DONE_MESSAGE)) {
      doneBuffer = doneBuffer.slice(-(DONE_MESSAGE.length - 1));
      return;
    }
    done.resolve();
  };

  const cleanup = await subscribeToTurn(app, input.turnUuid, res, { onMessage });

  if (res.writableEnded || res.destroyed) {
    await cleanup();
    throw new Error(`Turn stream closed before workflow signal was sent: ${input.turnUuid}`);
  }

  res.once('close', onClose);
  if (res.writableEnded || res.destroyed) {
    onClose();
    throw new Error(`Turn stream closed before workflow signal was sent: ${input.turnUuid}`);
  }

  try {
    await input.signal();
    await done.promise;
  } finally {
    res.off('close', onClose);
    await cleanup();
  }
}

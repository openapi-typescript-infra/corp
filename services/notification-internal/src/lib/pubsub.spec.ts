import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import type { NotificationInternalLocals } from '../types/service.ts';

const mocks = vi.hoisted(() => ({ close: vi.fn(), subscription: vi.fn() }));
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    subscription = mocks.subscription;
    close = mocks.close;
  },
}));

import { startNotificationPubSubSubscriber } from './pubsub.ts';

const subscription = Object.assign(new EventEmitter(), { close: vi.fn() });
function app(enabled = true) {
  return {
    locals: {
      config: { notifications: { pubsub: { enabled, subscription: 'notifications' } } },
      logger: { info: vi.fn(), error: vi.fn() },
      notifications: { send: vi.fn().mockResolvedValue({ status: 'sent' }) },
    } as unknown as NotificationInternalLocals,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  subscription.removeAllListeners();
  mocks.subscription.mockReturnValue(subscription);
});
it('does not create a subscription when disabled', () => {
  expect(startNotificationPubSubSubscriber(app(false))).toBeUndefined();
  expect(mocks.subscription).not.toHaveBeenCalled();
});
it('acknowledges successful dispatch and nacks failed dispatch or malformed JSON', async () => {
  const serviceApp = app();
  startNotificationPubSubSubscriber(serviceApp);
  const handler = subscription.listeners('message')[0] as (message: unknown) => Promise<void>;
  const message = {
    data: Buffer.from('{"channel":"sms","sms":{"to":"+12025550123","body":"Hello"}}'),
    ack: vi.fn(),
    nack: vi.fn(),
    id: 'message',
  };
  await handler(message);
  expect(message.ack).toHaveBeenCalledOnce();
  vi.mocked(serviceApp.locals.notifications.send).mockRejectedValueOnce(
    new Error('provider failure'),
  );
  await handler(message);
  expect(message.nack).toHaveBeenCalledOnce();
  await handler({ ...message, data: Buffer.from('invalid json') });
  expect(message.nack).toHaveBeenCalledTimes(2);
});
it('removes listeners and closes both clients', async () => {
  const subscriber = startNotificationPubSubSubscriber(app());
  await subscriber?.close();
  expect(subscription.listenerCount('message')).toBe(0);
  expect(subscription.listenerCount('error')).toBe(0);
  expect(subscription.close).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});

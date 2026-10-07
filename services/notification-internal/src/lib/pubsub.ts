import { type Message, PubSub, type Subscription } from '@google-cloud/pubsub';

import type { components } from '../generated/service/index.ts';
import type { NotificationInternalLocals } from '../types/service.ts';

type NotificationRequest = components['schemas']['NotificationRequest'];

export interface NotificationPubSubSubscriber {
  close(): Promise<void>;
}

export function startNotificationPubSubSubscriber(app: {
  locals: NotificationInternalLocals;
}): NotificationPubSubSubscriber | undefined {
  const { pubsub } = app.locals.config.notifications;
  if (!pubsub?.enabled) {
    app.locals.logger.info('Notification Pub/Sub subscriber disabled');
    return undefined;
  }

  if (!pubsub.subscription) {
    throw new Error('notifications.pubsub.subscription is required when Pub/Sub is enabled');
  }

  const client = new PubSub({ projectId: app.locals.gcpProjectId });
  const subscription = client.subscription(pubsub.subscription);

  const onMessage = async (message: Message) => {
    try {
      const body = JSON.parse(message.data.toString()) as NotificationRequest;
      await app.locals.notifications.send({ app }, body);
      message.ack();
    } catch (error) {
      app.locals.logger.error(
        { error, messageId: message.id },
        'Failed to process notification message',
      );
      message.nack();
    }
  };

  const onError = (error: Error) => {
    app.locals.logger.error(error, 'Notification Pub/Sub subscriber error');
  };

  subscription.on('message', onMessage);
  subscription.on('error', onError);

  app.locals.logger.info(
    {
      subscription: pubsub.subscription,
      topic: pubsub.topic,
    },
    'Notification Pub/Sub subscriber started',
  );

  return {
    async close() {
      subscription.removeListener('message', onMessage);
      subscription.removeListener('error', onError);
      try {
        await closeSubscription(subscription);
      } finally {
        await client.close();
      }
    },
  };
}

async function closeSubscription(subscription: Subscription) {
  if (typeof subscription.close === 'function') {
    await subscription.close();
    return;
  }
  throw new Error('Pub/Sub subscription cannot be closed by this client version');
}

import ApiSpec from '@justtellme/notification-internal-client/spec' with { type: 'json' };
import { useJTMService } from '@justtellme/service';
import { createNotificationDispatcher } from './lib/notifications.ts';
import {
  type NotificationPubSubSubscriber,
  startNotificationPubSubSubscriber,
} from './lib/pubsub.ts';
import type { NotificationInternal, NotificationInternalLocals } from './types/index.ts';

export function service(): NotificationInternal['Service'] {
  const base = useJTMService<NotificationInternalLocals>();
  let subscriber: NotificationPubSubSubscriber | undefined;
  return {
    ...base,
    configure(startOptions, options) {
      if (!base.configure) throw new Error('base.configure is required');
      const config = base.configure(startOptions, options);
      Object.assign(config, { openApiOptions: { ...config.openApiOptions, apiSpec: ApiSpec } });
      return config;
    },
    async start(app) {
      await base.start(app);
      app.locals.notifications = createNotificationDispatcher(app.locals.config);
      subscriber = startNotificationPubSubSubscriber(app);
    },
    async stop(app) {
      try {
        await subscriber?.close();
      } finally {
        await base.stop?.(app);
      }
    },
  };
}

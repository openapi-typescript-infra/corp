import type { JTMServiceLocals } from '@justtellme/service';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import { RedisStore } from 'connect-redis';
import type session from 'express-session';
import type { RedisClientOptions } from 'redis';
import { createClient } from 'redis';

import { CONSUMER_APP_SESSION_TIMEOUT_MS } from './constants.ts';

export async function getSessionStorage(
  app: ServiceExpress<JTMServiceLocals>,
  options: RedisClientOptions,
): Promise<{
  redis: ReturnType<typeof createClient>;
  store: session.Store;
  shutdown?: () => Promise<void> | void;
}> {
  const redisClient = createClient({
    ...options,
    username: options.username || undefined,
    password: options.password || undefined,
  });

  redisClient.on('error', (error) => {
    app.locals.logger.warn(error, 'Received redis error');
  });

  await redisClient.connect().catch((error) => {
    app.locals.logger.error(error, 'Failed to connect to redis');
  });

  class EmittingRedisStore extends RedisStore {
    async set(
      sid: string,
      sess: session.SessionData,
      cb?: Parameters<session.Store['set']>[2],
    ): Promise<void> {
      const ret = super.set(sid, sess, cb);
      this.emit('set', sid, sess);
      return ret;
    }
  }

  const store = new EmittingRedisStore({
    client: redisClient,
  });

  store.on('set', async (sid: string, sess) => {
    const userUuid = sess?.passport?.user?._profile?.uuid;
    if (userUuid) {
      const now = Date.now();
      const unixTimeNowMinusSessionTime = new Date(now - CONSUMER_APP_SESSION_TIMEOUT_MS);

      // This is how one expires individual items in a set within Redis.
      // It uses a scored sorted-set to remove elements where the score
      // is a point in time.
      const sessionsKey = `${userUuid}-sessions`;
      await redisClient.zremrangebyscore(sessionsKey, 0, unixTimeNowMinusSessionTime.getTime());
      await redisClient.zadd(sessionsKey, now, sid);
    }
  });
  return {
    redis: redisClient,
    store,
    async shutdown() {
      await redisClient.quit();
    },
  };
}

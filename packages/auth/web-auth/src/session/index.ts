import type { JTMServiceLocals } from '@justtellme/service';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import session from 'express-session';

import type { HSSessionConfiguration } from '../types.ts';

import { getSessionStorage } from './storage.ts';

export const createSessionMiddleware = async (
  app: ServiceExpress<JTMServiceLocals>,
  options: HSSessionConfiguration['session'],
) => {
  const {
    secret,
    maxAge,
    proxy,
    resave,
    rolling,
    saveUninitialized,
    cookieDomain,
    secureCookie,
    cookieName,
  } = options;
  const { redis, store, shutdown } = await getSessionStorage(app, options.store);

  const cookieOptions: session.SessionOptions['cookie'] = {
    maxAge,
    httpOnly: true,
    secure: 'auto',
  };

  if (cookieDomain) {
    cookieOptions.domain = cookieDomain;
  }
  if (secureCookie !== undefined) {
    cookieOptions.secure = secureCookie;
  }

  const middleware = session({
    proxy,
    secret,
    store,
    resave,
    rolling,
    saveUninitialized,
    name: cookieName,
    cookie: cookieOptions,
    unset: 'destroy',
  });

  return { middleware, redis, shutdown };
};

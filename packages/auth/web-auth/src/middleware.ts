import { AuthPrincipal } from '@justtellme/auth-token';
import type {
  JTMConfigurationSchema,
  JTMServiceLocals,
  JTMServiceRequest,
} from '@justtellme/service';
import {
  isDev,
  isTest,
  ServiceError,
  type ServiceExpress,
} from '@openapi-typescript-infra/service';
import type { NextFunction, Request, Response } from 'express';
import type { AuthApp } from './authentication/stytch.ts';
import { getStytchTokenDetail } from './authentication/stytch.ts';
import { getRequestDocument } from './authorization/requestDocument.ts';
import { getVerificationCache } from './authorization/verificationCache.ts';
import { createSessionMiddleware } from './session/index.ts';
import type {
  AuthDatasources,
  JTMAuthConfiguration,
  JTMServiceWithSessionLocals,
  JTMSessionConfiguration,
} from './types.ts';

export type TraditionalMiddleware = (req: Request, res: Response, next: NextFunction) => void;

const EXECUTED_MIDDLEWARE = Symbol('@justtellme/session/executed');

type ReqWithExecutedDetail = Request & { [EXECUTED_MIDDLEWARE]?: string[] };

interface SessionMiddlewareOptions<RequestDocumentFactory extends typeof getRequestDocument> {
  requestDocumentFactory?: RequestDocumentFactory;
  functions?: Record<string, () => unknown>;
}

interface RequestLike {
  app: Request['app'];
  user?: Request['user'] | AuthPrincipal;
  headers: Request['headers'];
  cookies?: Request['cookies'];
}

function isDone(req: RequestLike, middleware: 'session' | 'auth') {
  const reqWithExecuted = req as ReqWithExecutedDetail;
  return reqWithExecuted[EXECUTED_MIDDLEWARE]?.includes(middleware);
}

function setDone(req: RequestLike, middleware: 'session' | 'auth') {
  const reqWithExecuted = req as ReqWithExecutedDetail;
  reqWithExecuted[EXECUTED_MIDDLEWARE] = reqWithExecuted[EXECUTED_MIDDLEWARE] || [];
  reqWithExecuted[EXECUTED_MIDDLEWARE].push(middleware);
}

export async function getPrincipal(req: RequestLike) {
  if (req.user instanceof AuthPrincipal || (isDone(req, 'auth') && !req.user)) {
    return req.user;
  }
  const config = req.app.locals.config as JTMConfigurationSchema &
    JTMSessionConfiguration &
    JTMAuthConfiguration;
  if (config.auth?.authToken === 'decode' && req.headers['x-auth-token']) {
    return new AuthPrincipal(req.headers['x-auth-token'].toString());
  }
  if (isDev() || isTest()) {
    if (req.headers.authorization) {
      const [type, token] = req.headers.authorization.split(' ');
      if (type === 'Bearer') {
        const detail = await getStytchTokenDetail(req.app as AuthApp, token);
        return detail?.principal;
      }
    } else if (config.auth?.cookie && req.cookies?.[config.auth.cookie]) {
      const detail = await getStytchTokenDetail(
        req.app as AuthApp,
        req.cookies[config.auth.cookie] as string,
      );
      return detail?.principal;
    }
  }
}

export async function getMiddleware<RequestDocumentFactory extends typeof getRequestDocument>(
  app: ServiceExpress<JTMServiceLocals & AuthDatasources>,
  config: JTMSessionConfiguration & JTMAuthConfiguration,
  options: SessionMiddlewareOptions<RequestDocumentFactory> = {},
) {
  const { requestDocumentFactory = getRequestDocument } = options;
  let session: Awaited<ReturnType<typeof createSessionMiddleware>> | undefined;
  let justtellmeMiddleware: TraditionalMiddleware | undefined;

  if (config.session.enabled) {
    session = await createSessionMiddleware(app, config.session);
  }

  if (config.auth?.enabled) {
    justtellmeMiddleware = async (req, res, next) => {
      try {
        const user = await getPrincipal(req);
        if (user) {
          req.user = user;
        }
        next();
      } catch (error) {
        app.locals.logger.warn(error, 'Invalid x-auth-token');
        next(error);
      }
    };
  }

  async function ensureExecuted(req: Request, res: Response, middleware: 'session' | 'auth') {
    if (isDone(req, middleware)) {
      return;
    }
    const selectedMiddleware =
      middleware === 'session' ? session?.middleware : justtellmeMiddleware;
    if (selectedMiddleware) {
      await new Promise((resolve, reject) => {
        selectedMiddleware(req, res, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        });
      }).finally(() => setDone(req, middleware));
    }
  }

  const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureExecuted(req, res, 'auth');
      next();
    } catch (error) {
      next(error);
    }
  };

  const sessionOnly = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureExecuted(req, res, 'session');
      next();
    } catch (error) {
      next(error);
    }
  };

  const cache = getVerificationCache(options?.functions);

  return {
    redis: session?.redis,
    authenticationMiddleware: auth as TraditionalMiddleware,
    sessionMiddleware: sessionOnly as TraditionalMiddleware,
    withAuthorization(rule: string, additionalParameters?: Record<string, unknown>) {
      // Don't cache this one because it's in the closure
      const verifier = cache.compile(rule);
      return (
        req: JTMServiceRequest<JTMServiceWithSessionLocals>,
        res: Response,
        next: NextFunction,
      ) => {
        ensureExecuted(req, res, 'auth')
          .then(() => {
            const doc = requestDocumentFactory(req, additionalParameters);
            return verifier(doc);
          })
          .then((result) => {
            if (result) {
              next();
            } else {
              // This is debatable, but if there is no user and the authz check failed,
              // that is considered a 401. If there is a user, it's a 403.
              if (req.user) {
                next(new ServiceError(req.app, 'Forbidden', { status: 403 }));
              } else {
                next(new ServiceError(req.app, 'Authentication Required', { status: 401 }));
              }
            }
          })
          .catch(next);
      };
    },
    validateSecurity(req: Request, scopes: string[]) {
      if (!scopes?.length) {
        return true;
      }
      const sReq = req as JTMServiceRequest<JTMServiceWithSessionLocals>;
      return ensureExecuted(req, req.res as Response, 'auth')
        .then(() => requestDocumentFactory(sReq))
        .then((doc) => {
          return scopes.reduce(
            (result, scope) =>
              result.then(async (ok) => {
                if (!ok) {
                  const scopeResult = await cache.getFunction(scope)(doc);
                  return !!scopeResult;
                }
                return ok;
              }),
            Promise.resolve(false),
          );
        })
        .then((ok) => {
          if (!ok) {
            if (req.user) {
              throw new ServiceError(sReq.app, 'Forbidden', { status: 403, expected_error: true });
            }
            throw new ServiceError(sReq.app, 'Authentication Required', {
              status: 401,
              expected_error: true,
            });
          }
          return true;
        });
    },
    async shutdown() {
      await session?.shutdown?.();
    },
  };
}

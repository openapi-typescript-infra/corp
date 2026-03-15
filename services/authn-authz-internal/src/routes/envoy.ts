import type { HSServiceRouter } from '@justtellme/service';

import { authenticate } from '#src/lib/authenticator.ts';
import type {
  AuthnAuthzInternal,
  AuthnAuthzInternalLocals,
  AuthnAuthzInternalRequestLocals,
} from '#src/types/service.ts';

export function route(
  router: HSServiceRouter<AuthnAuthzInternalLocals, AuthnAuthzInternalRequestLocals>,
  app: AuthnAuthzInternal['App'],
) {
  router.use(async (req, res, next) => {
    try {
      const result = await authenticate(req, res as AuthnAuthzInternal['Response']);
      if (result?.handled) {
        return;
      }
      if (result?.xAuthToken) {
        res.setHeader('x-auth-token', result.xAuthToken);
      }
      res.sendStatus(200);
    } catch (error) {
      app.locals.logger.error(error, 'Failed to authenticate');
      next(error);
    }
  });
}

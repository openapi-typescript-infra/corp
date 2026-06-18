import { getStytchTokenDetail } from '@justtellme/web-auth';
import { ServiceError } from '@openapi-typescript-infra/service';
import { trace } from '@opentelemetry/api';
import { StytchError } from 'stytch';

import type { AuthnAuthzInternal } from '#src/types/service.ts';

const disallowedExternalHeaders = ['x-auth-token'];

export async function authenticate(
  req: AuthnAuthzInternal['Request'],
  res: AuthnAuthzInternal['Response'],
  options: {
    internal?: boolean;
  } = {},
): Promise<{
  handled?: boolean;
  xAuthToken?: string;
}> {
  const { app } = req;
  const timer = app.locals.metrics.startTimer();
  const labels: {
    host: string;
    method: string;
    auth?: 'cookie' | 'header' | 'none';
  } = {
    host: req.headers.host || 'none',
    method: req.method,
    auth: 'none',
  };
  let status: number | undefined;

  try {
    // x-auth-token is an internal-only identity header that this service mints
    // and Envoy injects downstream. An external client supplying it is either a
    // misconfiguration or a forgery attempt, so reject the whole request at the
    // edge. This is the primary edge enforcement for non-proxied environments
    // (e.g. dev, where the Cloudflare WAF rule does not apply); Cloudflare
    // blocks it independently for proxied production traffic. The gateway
    // SecurityPolicy must forward x-auth-token to ext_authz (headersToExtAuth)
    // so this check can see and reject it.
    const presentDisallowed = !options.internal
      ? disallowedExternalHeaders.filter((header) => req.headers[header] != null)
      : [];
    if (presentDisallowed.length > 0) {
      app.locals.logger.error(
        {
          headers: JSON.stringify(presentDisallowed),
          host: req.headers.host || 'none',
          ua: req.headers['user-agent'],
          url: req.url,
        },
        'Rejected request carrying internal-only header from external surface',
      );
      status = 400;
      res.status(400).json({ code: 'DISALLOWED_HEADER', message: 'Disallowed request header' });
      return {
        handled: true,
      };
    }

    let token: string | undefined = req.cookies[app.locals.config.auth.cookie];
    if (token) {
      labels.auth = 'cookie';
    } else if (req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
      if (token) {
        labels.auth = 'header';
      }
    }

    app.locals.metrics.requests.add(1, labels);

    if (!token) {
      status = 200;
      return {};
    }

    const detail = await getStytchTokenDetail(app, token).catch((error: Error) => error);

    if (detail instanceof Error) {
      status = 401;
      if (
        detail instanceof StytchError &&
        ['jwt_too_old', 'jwt_invalid', 'session_not_found'].includes(detail.error_type)
      ) {
        throw new ServiceError(app, 'Authentication required', {
          status: 401,
          code: detail.error_type,
          expected_error: true,
        });
      }
      throw detail;
    }

    if (detail?.principal) {
      const jwt = detail.principal.encodeJwt();
      if (!options.internal) {
        trace
          .getActiveSpan()
          ?.setAttribute(
            'enduser.id',
            detail.principal?.userUuid ?? detail.principal?.clientId ?? '',
          );
        trace.getActiveSpan()?.setAttribute('enduser.role', detail.principal.role);
        res.setHeader('x-auth-token', jwt);
      }
      status = 200;

      if (detail.updated_session_jwt) {
        res.cookie(req.app.locals.config.auth.cookie, detail.updated_session_jwt, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          domain: req.app.locals.config.session.cookieDomain,
          secure: true,
        });
      }

      return {
        xAuthToken: jwt,
      };
    }

    return {};
  } catch (error) {
    if (!(error instanceof ServiceError)) {
      app.locals.logger.error(error, 'Failed to authenticate');
    }
    status = 500;
    throw error;
  } finally {
    app.locals.metrics.localTime.record(timer(), {
      ...labels,
      status: status ?? 500,
    });
  }
}

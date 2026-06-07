import { AuthPrincipal } from '@justtellme/auth-token';
import { fromExternalID } from '@justtellme/external-id';
import type { JTMConfigurationSchema, JTMServiceLocals } from '@justtellme/service';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import { decode } from 'jsonwebtoken';
import type { Session, User } from 'stytch';

import type { AuthDatasources, JTMAuthConfiguration } from '../types.ts';

export type AuthApp = ServiceExpress<
  JTMServiceLocals<JTMConfigurationSchema & JTMAuthConfiguration> & AuthDatasources
>;

export function toIat(date: Date | string | number | undefined): number | undefined {
  if (!date) {
    return undefined;
  }
  if (typeof date === 'number') {
    return date;
  }
  const asDate = typeof date === 'string' ? Date.parse(date) : date;
  return asDate ? Math.floor(asDate.valueOf() / 1000) : undefined;
}

export interface StytchSessionDetail {
  // The JWT if it has been automatically refreshed from Stytch
  updated_session_jwt: string;
  // The AuthPrincipal this token represents, if any
  principal?: AuthPrincipal;
  session?: Session;
  user?: User;
}

/**
 * Create a AuthPrincipal from a Stytch session JWT. This is primarily
 * intended for development use cases where you want to validate a token
 * directly from mobile app/browser without ambassador in between to do it for
 * you.
 *
 * However, this is ALSO used by authn-authz itself to centralize the logic
 * of validating a Stytch token and transforming it into a AuthPrincipal
 * and then x-auth-token header. So do not mess with it without understanding
 * the downstream implications.
 */
export async function getStytchTokenDetail(
  app: AuthApp,
  jwt: string,
): Promise<StytchSessionDetail | undefined> {
  const payload = decode(jwt, { json: true });
  if (!payload || typeof payload === 'string' || !payload.aud?.[0]) {
    return undefined;
  }
  if (!payload['https://stytch.com/session']) {
    // New style M2M partner token, process differently
    const detail = await app.locals.stytch.m2m.authenticateToken({ access_token: jwt });
    if (!detail.custom_claims.partner) {
      return undefined;
    }
    const partnerDetail: StytchSessionDetail = {
      updated_session_jwt: jwt,
      principal: new AuthPrincipal({
        iat: payload.iat,
        aud: ['partner'],
        sub: detail.custom_claims.partner,
        fact: [{ t: 'oauth' }],
        scope: detail.scopes?.join(' '),
        g: detail.custom_claims.g,
        ids: detail.custom_claims.ids,
      }),
    };
    return partnerDetail;
  }

  const config = app.locals.config.auth.stytch;
  const client = app.locals.stytch;

  const { session, session_jwt } = await client.sessions
    .authenticateJwtLocal({
      max_token_age_seconds: config.maxTokenAgeSeconds,
      session_jwt: jwt,
    })
    .then((session) => ({
      session,
      session_jwt: jwt,
    }))
    .catch(async (error) => {
      const code = (error as { code?: string }).code;
      if (code === 'jwt_too_old' || code === 'jwt_invalid') {
        if (config.secret) {
          return client.sessions.authenticate({
            session_jwt: jwt,
          });
        }
      }
      throw error;
    });

  const sessionDetail: StytchSessionDetail = {
    updated_session_jwt: session_jwt,
    session,
  };

  // Ok, if we made it here, we have a valid token, now we just need
  // to transform it to a AuthPrincipal
  let externalId: string | undefined = session.custom_claims?.id;
  if (!externalId) {
    // We didn't run this yet, the token was valid locally. But to make use of it
    // upstream will need the user object.
    const { user } = await client.sessions.authenticate({ session_jwt: jwt }).catch((error) => {
      app.locals.logger.error(error, 'Token had no custom id and user lookup failed');
      throw error;
    });
    sessionDetail.user = user;
    externalId = user.external_id as string;
    app.locals.logger.warn(
      { sessionId: session.session_id },
      'Stytch session missing custom_claims',
    );
    return undefined;
  }
  const uuid = fromExternalID(externalId);
  sessionDetail.principal = new AuthPrincipal({
    sub: uuid,
    aud: ['user'],
    iat: toIat(session.started_at),
    fact: session.authentication_factors?.map((f) => ({
      t: f.type,
      iat: toIat(f.last_authenticated_at),
    })),
    g: session.custom_claims?.g,
    ids: session.custom_claims?.ids,
    scope: session.custom_claims?.scope,
    u: session.custom_claims?.u,
  });
  return sessionDetail;
}

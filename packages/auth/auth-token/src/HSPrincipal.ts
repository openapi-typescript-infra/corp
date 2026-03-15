import type { JwtPayload } from 'jsonwebtoken';
import jsonwebtoken from 'jsonwebtoken';
import { parseUnknownExternalID } from '@justtellme/external-id';

const { decode, sign } = jsonwebtoken;

export interface AuthenticationFactor {
  t:
    | 'session'
    | 'oauth'
    | 'google'
    | 'magic_link'
    | 'otp'
    | 'oauth'
    | 'webauthn'
    | 'totp'
    | 'crypto'
    | 'password'
    | 'signature_challenge'
    | 'sso'
    | 'imported'
    | 'recovery_codes'
    | string;
  iat?: number;
}

export type HSPrincipalRole = 'user' | 'partner' | 'service';

const JWT_VERSION = 1;

// These field names and types are based on the names inside the JWT which are meant to be compact.
// Property names and types of HSPrincipal are meant to be more developer friendly.
export interface HSPrincipalInit {
  sub: string;
  aud: HSPrincipalRole[];
  iat?: number;
  scope?: string;
  g?: string[];
  ids?: string;
  fact?: AuthenticationFactor[];
  setup?: string;
  u?: string;
}

function getIdArray(ids?: unknown) {
  if (Array.isArray(ids)) {
    return ids;
  }
  if (typeof ids === 'string') {
    return ids.split(/[ ,]+/);
  }
  return undefined;
}

// Based on the x-auth-token header, this authenticated "principal" (usually an individual but not always)
// this object is used for authentication and common authorization use cases (sometimes other API calls
// are required to truly verify authorization).
export class HSPrincipal {
  private readonly sub: string;
  private readonly iat: number | undefined;

  /**
   * The authentication mechanisms used to prove identity
   */
  readonly factors: AuthenticationFactor[] | undefined;
  /**
   * The type of user this principal represents
   */
  readonly role: HSPrincipalRole;
  /**
   * The capabilities of this user, cached in the token for performance. For
   * high value operations, it may make sense to check the data store otherwise
   * you are "exposed" to a time range of inability to revoke permission.
   *
   * In the old parlance, this was called "permissions"
   */
  readonly scopes: string[] | undefined;
  /**
   * The groups to which this user belongs (if any) that are frequently used
   * such that caching in the JWT improves performance. The same caveat in scopes applies
   * to groups in terms of the time it takes to revoke membership.
   */
  readonly groups: string[] | undefined;
  /**
   * A set of alternate identifiers for the user, if any.
   */
  readonly ids: ReturnType<typeof parseUnknownExternalID>[] | undefined;
  /**
   * A setup step the user must complete before proceeding (e.g. 'totp').
   */
  readonly setupRequired: string | undefined;
  /**
   * The Google workspace username of the admin user (e.g. 'max.metral').
   */
  readonly username: string | undefined;

  constructor(jwtOrComponents: string | HSPrincipalInit) {
    if (typeof jwtOrComponents === 'string') {
      const payload = decode(jwtOrComponents, { json: true });
      if (!payload) {
        throw new Error('JWT could not be decoded');
      }
      if (!payload.aud?.length) {
        throw new Error('JWT does not contain an audience');
      }
      if (!payload.sub) {
        throw new Error('JWT does not contain a subject');
      }
      this.sub = payload.sub;
      this.role = payload.aud[0] as HSPrincipalRole;
      this.iat = payload.iat;
      if (Array.isArray(payload.scope)) {
        this.scopes = payload.scope;
      } else {
        this.scopes = payload.scope?.split(' ');
      }
      this.groups = payload.g;
      this.ids = getIdArray(payload.ids)?.map(parseUnknownExternalID);
      this.factors = payload.fact;
      this.setupRequired = payload.setup || undefined;
      this.username = payload.u || undefined;
    } else {
      this.role = jwtOrComponents.aud[0];
      this.sub = jwtOrComponents.sub;
      this.groups = jwtOrComponents.g;
      this.iat = jwtOrComponents.iat;
      this.scopes = jwtOrComponents.scope?.split(' ');
      this.ids = getIdArray(jwtOrComponents.ids)?.map(parseUnknownExternalID);
      this.factors = jwtOrComponents.fact;
      this.setupRequired = jwtOrComponents.setup || undefined;
      this.username = jwtOrComponents.u || undefined;
    }
  }

  /**
   * The consumer-uuid of the authenticated principal. For a partner
   * or service this will be undefined.
   */
  get userUuid() {
    if (this.role === 'partner' || this.role === 'service') {
      return undefined;
    }
    return this.sub;
  }

  /**
   * The OAuth client_id when the role is partner
   */
  get clientId() {
    if (this.role === 'partner' || this.role === 'service') {
      return this.sub;
    }
    return undefined;
  }

  /**
   * True if the factors amount to strong authentication.
   * Right now this means "used totp or otp," but perhaps
   * we will modify to mean WebAuthN or similar (this
   * is primarily for providers). In the old stack, this
   * was called "privilegedSession"
   */
  get usedStrongAuthentication() {
    return (
      this.factors?.find((f) => f.t === 'totp' || f.t === 'otp' || f.t === 'webauthn') !== undefined
    );
  }

  encodeJwt() {
    const payload: JwtPayload = {
      sub: this.sub,
      aud: [this.role],
      fact: this.factors,
      v: JWT_VERSION,
    };
    if (this.iat) {
      payload.iat = this.iat;
    }
    if (this.scopes) {
      payload.scope = this.scopes.join(' ');
    }
    if (this.ids) {
      payload.ids = this.ids.map((id) => id.externalID).join(' ');
    }
    if (this.groups) {
      payload.g = this.groups;
    }
    if (this.setupRequired) {
      payload.setup = this.setupRequired;
    }
    if (this.username) {
      payload.u = this.username;
    }

    return sign(payload, null, { algorithm: 'none' });
  }

  static createServiceToken(serviceName: string) {
    const payload: JwtPayload = {
      sub: serviceName,
      aud: ['service'],
      iat: Math.floor(Date.now() / 1000),
      v: JWT_VERSION,
    };
    return sign(payload, null, { algorithm: 'none' });
  }

  static serviceToken(callingServiceName: string) {
    return new HSPrincipal({
      sub: callingServiceName,
      aud: ['service'],
      iat: Math.floor(Date.now() / 1000),
    }).encodeJwt();
  }

  static consumerToken(consumerUuid: string) {
    return new HSPrincipal({
      sub: consumerUuid,
      aud: ['user'],
      iat: Math.floor(Date.now() / 1000),
    }).encodeJwt();
  }
}

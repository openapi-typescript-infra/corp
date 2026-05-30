import type { paths as IdentityInternal } from '@justtellme/identity-internal-client';
import type { JTMServiceLocals } from '@justtellme/service';
import type createClient from 'openapi-fetch';
import type { RedisClientOptions } from 'redis';
import type { Client } from 'stytch';

export interface JTMAuthConfiguration {
  auth: {
    enabled: boolean;

    // The X-Auth-Token JWT is created by authn-authz-internal and contains the unpacked
    // identity assertions either from a bearer token or a session or whatever. BUT, your
    // service MUST be behind Envoy to use this, because otherwise, if it was directly
    // exposed, that token header could be spoofed from the outside. SO, enable this only
    // if your service is behind Envoy (which is almost always true, even for web services,
    // but perhaps won't stay that way). Default behavior is to ignore.
    authToken?: 'ignore' | 'decode';

    // The name of the cookie that contains the Stytch JWT
    cookie: string;

    // Stytch configuration is required to validate Stytch tokens directly, which is
    // primarily a job for authn-authz-internal, but is useful in local dev builds for a
    // variety of use cases (e.g. mobile app testing). SO, you don't need to generally
    // concern yourself with config because it is configured for you in @justtellme/service-with-auth
    // but if you do not use that path, you will need to configure these values if you want
    // to accept Stytch tokens. Note that you don't need the secret to validate good tokens,
    // but you do need it to extend their validity or otherwise manipulate them.
    stytch: {
      maxTokenAgeSeconds: number;
      project_id: string;
      secret?: string;
    };
  };
}

export interface JTMSessionConfiguration {
  session: {
    enabled: boolean;

    store: RedisClientOptions;

    // Secret used to encrypt session data on the server.
    secret: string;

    // Maximum Session Age in ms (optional, default is 7 days).
    maxAge?: number;

    // Forces the session to be saved back to the session store, even if
    // the session  was never modified during the request. Depending on your
    // store this may be necessary, but it can also create race conditions where
    // a client makes two parallel requests to your server and changes made to
    // the session in one request may get overwritten when the other request ends,
    // even if it made no changes (this behavior also depends on what store you're
    // using). https://www.npmjs.com/package/express-session#resave
    resave?: boolean;

    // Force a session identifier cookie to be set on every response. The expire
    // time is reset to the original maxAge, resetting the expiration time.
    // Note When this option is set to true but the saveUninitialized option
    // is set to false, the cookie will not be set on a response with an
    // uninitialized session https://www.npmjs.com/package/express-session#rolling
    //
    // this must be false for provider per HIPAA requirements on enforced short session time
    rolling?: boolean;

    // Forces a session that is "uninitialized" to be saved to the store.
    // A session is uninitialized when it is new but not modified. Choosing false
    // is useful for implementing login sessions, reducing server storage usage,
    // or complying with laws that require permission before setting a cookie.
    //
    // Choosing false will also help with race conditions where a client makes
    // multiple parallel requests without a session.
    //
    // Note that if the built-in CSRF protection is enabled (the default) then
    // sessions will ALWAYS be 'initialized' as it saves to the session.
    // https://www.npmjs.com/package/express-session#saveuninitialized
    saveUninitialized: boolean;

    cookieDomain?: string;
    cookieName?: string;
    secureCookie?: boolean | 'auto';

    // If true, express-session will trust proxies when evaluating whether to
    // allow secure cookies to be set on insecure connections (in addition to headers):
    // https://github.com/expressjs/session/blob/1010fadc2f071ddf2add94235d72224cf65159c6/index.js#L231
    proxy?: boolean;
  };
}

export interface AuthDatasources {
  datasources: {
    // Use for specific access rule evaluation. Can be empty
    // if your service doesn't need that
    identityInternal?: ReturnType<typeof createClient<IdentityInternal>>;
  };
  stytch: Client;
}

export type JTMServiceWithSessionLocals = JTMServiceLocals & AuthDatasources;

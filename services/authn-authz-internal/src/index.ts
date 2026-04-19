import ApiSpec from '@justtellme/api/specs/authn-authz-internal' with { type: 'json' };
import { useHSService } from '@justtellme/service';
import { Client } from 'stytch';
import { Metrics } from './lib/metrics.ts';
import { createAuthnAuthzInternalDatasources } from './types/datasources.ts';
import type { AuthnAuthzInternal, AuthnAuthzInternalLocals } from './types/index.ts';

export function service(): AuthnAuthzInternal['Service'] {
  const base = useHSService<AuthnAuthzInternalLocals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);

      const stytchConfig = app.locals.config.auth.stytch;

      if (!stytchConfig.secret) {
        throw new Error('stytch.secret is required');
      }

      Object.assign(app.locals, {
        datasources: createAuthnAuthzInternalDatasources(app),
        metrics: new Metrics(app),
        // Make types work, but also carry through extra options to client config
        stytch: new Client({ ...stytchConfig, secret: stytchConfig.secret }),
      });
    },
    configure(startOptions, options) {
      if (!base.configure) {
        throw new Error('Service infrastructure is misconfigured - base.configure is missing');
      }
      const config = base.configure(startOptions, options);
      Object.assign(config, { openApiOptions: { ...config.openApiOptions, apiSpec: ApiSpec } });
      return config;
    },
    async stop(app) {
      await base.stop?.(app);
    },
  };
}

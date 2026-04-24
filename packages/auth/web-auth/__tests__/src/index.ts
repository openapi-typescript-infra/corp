import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import type { JTMConfigurationSchema, JTMService, JTMServiceLocals } from '@justtellme/service';
import { getDatasourceConfiguration, useJTMService } from '@justtellme/service';
import createClient from 'openapi-fetch';
import type { createClient as createRedisClient } from 'redis';
import type { AuthDatasources, HSAuthConfiguration, HSSessionConfiguration } from '#src/types.ts';
import type { TraditionalMiddleware } from '../../src/middleware.ts';
import { getMiddleware } from '../../src/middleware.ts';

export type TestConfig = JTMConfigurationSchema & HSSessionConfiguration & HSAuthConfiguration;
export type TestServiceLocals = JTMServiceLocals<TestConfig> &
  AuthDatasources & {
    withAuthorization: (
      rule: string,
      additionalParameters?: Record<string, unknown>,
    ) => TraditionalMiddleware;
    redis: ReturnType<typeof createRedisClient>;
  };
export type TestService = JTMService<TestServiceLocals>;

export function service(): TestService {
  const base = useJTMService<TestServiceLocals>();
  let session: Awaited<ReturnType<typeof getMiddleware>> | undefined;

  return {
    ...base,
    configure(startOptions, options) {
      // Configure happens before attach, so we need to do this lazy-run
      // thing for security validation
      const baseOptions = base.configure?.(startOptions, options) || options;
      return {
        ...baseOptions,
        openApiOptions: {
          ...(baseOptions?.openApiOptions || options.openApiOptions),
          validateSecurity: {
            handlers: {
              justtellme(req, scopes) {
                return session?.validateSecurity(req, scopes) || false;
              },
            },
          },
        },
      };
    },
    async attach(app) {
      await base?.attach?.(app);
      session = await getMiddleware(app, app.locals.config);

      // Assign these before because our routes need them while registering
      Object.assign(app.locals, {
        sessionMiddleware: session.sessionMiddleware,
        authenticationMiddleware: session.authenticationMiddleware,
        withAuthorization: session.withAuthorization,
        redis: session.redis,
        datasources: {
          identityInternal: createClient<IdentityInternal>(
            getDatasourceConfiguration(app, 'identityInternal'),
          ),
        },
      });
    },
    async stop(app) {
      await base.stop?.(app);
      await session?.shutdown();
    },
  };
}

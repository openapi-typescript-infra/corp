import path from 'node:path';
import type { AuthPrincipal } from '@justtellme/auth-token';
import { useJTMService } from '@justtellme/service';
import { getMiddleware, getPrincipal } from '@justtellme/web-auth';
import type { Service } from '@openapi-typescript-infra/service';
import { insertConfigurationBefore } from '@openapi-typescript-infra/service';
import { Client } from 'stytch';
import type { JTMAuthConfigurationSchema } from './config.ts';
import { createAuthDatasources } from './datasources.ts';
import type { JTMAuthRequestLocals, JTMAuthServiceLocals } from './types.ts';

function stytchClient(config: JTMAuthConfigurationSchema['auth']['stytch']) {
  return new Client({
    project_id: config.project_id,
    secret: config.secret || 'none',
  });
}

export function useJTMServiceWithAuth<
  SLocals extends
    JTMAuthServiceLocals<JTMAuthConfigurationSchema> = JTMAuthServiceLocals<JTMAuthConfigurationSchema>,
  RLocals extends JTMAuthRequestLocals = JTMAuthRequestLocals,
>(baseService?: Service<SLocals, RLocals>): Service<SLocals, RLocals> {
  const base = useJTMService(baseService);
  let session: Awaited<ReturnType<typeof getMiddleware>> | undefined;

  return {
    ...base,
    configure(startOptions, options) {
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const baseConfig = base?.configure?.(startOptions, options);
      const baseConfigDirs = baseConfig?.configurationDirectories;
      // The expectation is that you pass in directories such that any values in the first
      // get overridden if the same value is in a subsequent entry. So that means our
      // gb-services defaults need to go "before" any existing
      const configurationDirectories = insertConfigurationBefore(
        baseConfigDirs,
        path.resolve(__dirname, '../config'),
        path.resolve(startOptions.rootDirectory, 'config'),
      );

      return {
        ...options,
        ...baseConfig,
        configurationDirectories,
        openApiOptions: {
          ...(baseConfig?.openApiOptions || options.openApiOptions),
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
      const sessionConfig = app.locals.config;
      // Not clear why this cast is necessary but it is benign/vetted
      session = await getMiddleware(
        app as unknown as Parameters<typeof getMiddleware>[0],
        sessionConfig,
      );
      Object.assign(app.locals, {
        redis: session.redis,
        withSession: session.sessionMiddleware,
        withAuthAndSession: session.authenticationMiddleware,
        withAuthorization: session.withAuthorization,
      });
    },
    async start(app) {
      await base?.start(app);
      const datasources = createAuthDatasources(app);
      app.locals.datasources = datasources;
      const { auth } = app.locals.config;
      if (auth.enabled) {
        app.locals.stytch = stytchClient(auth.stytch);
      }
    },
    async stop(app) {
      await base.stop?.(app);
      await session?.shutdown?.();
    },
    async onRequest(req, res) {
      await base?.onRequest?.(req, res);
      res.locals.getForwardHeaders = async () => {
        const user = await getPrincipal(req);
        if (!user?.userUuid) {
          return undefined;
        }
        const headers: Record<string, string> = {};
        if (req.headers['x-auth-token']) {
          headers['x-auth-token'] = req.headers['x-auth-token'].toString();
        }
        return headers;
      };
    },
    getLogFields(req, values) {
      const msg = base?.getLogFields?.(req, values);
      if (!values.u && 'user' in req) {
        // Just pluck an existing value if we have it, don't spend the time decoding tokens
        const user = req.user as AuthPrincipal | undefined;
        if (user?.userUuid) {
          values.u = user.userUuid;
        }
      }
      return msg;
    },
  };
}

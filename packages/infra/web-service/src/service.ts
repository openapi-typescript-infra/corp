import path from 'node:path';
import { useJTMServiceWithAuth } from '@justtellme/service-with-auth';
import type { Service } from '@openapi-typescript-infra/service';
import { getNodeEnv, insertConfigurationBefore, isDev } from '@openapi-typescript-infra/service';
import next from 'next';
import type { JTMWebConfigurationSchema } from './config.ts';
import { validateCsrf } from './csrf.ts';
import type { JTMWebRequestLocals, JTMWebServiceLocals } from './types.ts';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export function useJTMWebService<
  SLocals extends
    JTMWebServiceLocals<JTMWebConfigurationSchema> = JTMWebServiceLocals<JTMWebConfigurationSchema>,
  RLocals extends JTMWebRequestLocals = JTMWebRequestLocals,
>(baseService?: Service<SLocals, RLocals>): Service<SLocals, RLocals> {
  const base = useJTMServiceWithAuth(baseService);
  let rootDirectory: string;
  let csrfConfig: JTMWebConfigurationSchema['csrf'];

  return {
    ...base,
    configure(startOptions, options) {
      rootDirectory = startOptions.rootDirectory;
      const baseConfig = base?.configure?.(startOptions, options);
      const baseConfigDirs = baseConfig?.configurationDirectories;
      // The expectation is that you pass in directories such that any values in the first
      // get overridden if the same value is in a subsequent entry. So that means our
      // service defaults need to go "before" any existing
      const configurationDirectories = insertConfigurationBefore(
        baseConfigDirs,
        path.resolve(__dirname, '../config'),
        path.resolve(startOptions.rootDirectory, 'config'),
      );

      return {
        ...options,
        ...baseConfig,
        configurationDirectories,
      };
    },
    async start(app) {
      const sessionConfig = app.locals.config.session;

      // In order to make isomorphic code work, we need to take selected config values
      // and put them in the env
      process.env.COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || sessionConfig.cookieDomain || '';

      const posthogConfig = app.locals.config.posthog;
      if (posthogConfig?.key) {
        process.env.POSTHOG_KEY = process.env.POSTHOG_KEY || posthogConfig.key;
        process.env.POSTHOG_HOST = process.env.POSTHOG_HOST || posthogConfig.host || '';
      }

      app.locals.logger.info('Starting base app');
      await base?.start(app);

      csrfConfig = app.locals.config.csrf;
      if (csrfConfig && !csrfConfig?.cookie?.domain && sessionConfig.cookieDomain) {
        csrfConfig.cookie = csrfConfig.cookie || {};
        csrfConfig.cookie.domain = sessionConfig.cookieDomain;
      }

      const serverConfig = app.locals.config.server;
      const dev = isDev() || (getNodeEnv() === 'test' && !process.env.CI);
      // Somehow ESM confuses the types here
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      const nextApp = (next as unknown as typeof import('next').default)({
        dev,
        // Don't set `quiet: !dev`. Next's BaseServer.logError() does
        // `if (this.quiet) return;` before logging, which silently
        // drops every render error in production — turns 500s into
        // unresearchable mysteries. The compile-time chatter that
        // quiet was meant to suppress only fires in dev mode anyway.
        customServer: true,
        dir: rootDirectory,
        port: serverConfig.port,
        hostname: serverConfig.hostname,
      });

      const handler = nextApp.getRequestHandler();
      await nextApp.prepare();
      app.locals.next = nextApp;
      app.all(/.*/, async (req, res, nextMiddleware) => {
        try {
          await handler(req, res);
        } catch (err) {
          // Without this catch, the rejection bubbles to Express's
          // default error handler, which writes "Internal Server Error"
          // and logs nothing — so every 500 from Next.js is invisible.
          // Log with full stack + url, then hand off so the response
          // path still completes (Next may have partially written).
          req.app.locals.logger.error(
            { err, url: req.url, method: req.method },
            'Next.js request handler threw',
          );
          if (!res.headersSent) {
            nextMiddleware(err);
          }
        }
      });
    },
    async stop(app) {
      await base.stop?.(app);
      await app.locals.next?.close();
    },
    getLogFields(req, values) {
      if (isDev() && req.url?.startsWith('/_next/static')) {
        return false;
      }
      return base?.getLogFields?.(req, values);
    },
    authorize(req, res) {
      if (csrfConfig?.action === 'warn' || csrfConfig?.action === 'block') {
        validateCsrf(csrfConfig, req, res);
      }
      return baseService?.authorize?.(req, res) || true;
    },
  };
}

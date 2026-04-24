import path from 'node:path';
import type { Service } from '@openapi-typescript-infra/service';
import { insertConfigurationBefore, useService } from '@openapi-typescript-infra/service';
import type { JTMConfigurationSchema } from './config.ts';
import { addShortstopHandlers, getGcpProjectId } from './shortstops/index.ts';
import type { AnyJTMServiceLocals, HSRequestLocals, JTMServiceLocals } from './types.ts';

export function useJTMService<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  RLocals extends HSRequestLocals = HSRequestLocals,
>(baseService?: Service<SLocals, RLocals>): Service<SLocals, RLocals> {
  const base = useService(baseService);
  return {
    ...base,
    configure(startOptions, options) {
      const baseConfig = base?.configure?.(startOptions, options);
      // The expectation is that you pass in directories such that any values in the first
      // get overridden if the same value is in a subsequent entry. So that means our
      // gb-services defaults need to go "before" any existing
      const configurationDirectories = insertConfigurationBefore(
        baseConfig?.configurationDirectories,
        path.resolve(new URL('.', import.meta.url).pathname, '../config'),
        path.resolve(startOptions.rootDirectory, 'config'),
      );
      const shortstopHandlers = addShortstopHandlers(
        baseConfig?.shortstopHandlers || options.shortstopHandlers,
      );

      return {
        ...baseConfig,
        configurationDirectories,
        shortstopHandlers,
        // Node 24 TS erasure means we always use src
        codepath: 'src',
      };
    },
    async start(app) {
      app.locals.logger.info('Starting app');
      await base?.start(app);
      app.locals.gcpProjectId = getGcpProjectId();
      app.use(function addReturnHeaders(req, res, next) {
        if (req.headers['x-request-id']) {
          res.setHeader('x-request-id', req.headers['x-request-id']);
        }
        if (req.headers['updated-authorization']) {
          res.setHeader('updated-authorization', req.headers['updated-authorization']);
        }
        next();
      });
    },
    async stop(app) {
      app.locals.logger.info('Beginning app shutdown');
      return base?.stop?.(app);
    },
    async onRequest(req, res) {
      await base?.onRequest?.(req, res);
    },
    async onListening(app, args) {
      await base?.onListening?.(app, args);
      const { port, protocol } = args;
      const config = app.locals.config as JTMConfigurationSchema;
      const registry = config.registry?.registryUrl;
      if (registry && config.registry.useRegistry) {
        const response = await fetch(registry, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: app.locals.name,
            port,
            protocol,
          }),
        }).catch((error) => {
          return Object.assign(error, { ok: false });
        });
        if (!response.ok) {
          app.locals.logger.debug(
            {
              status: response.status,
              statusText: response.statusText,
              registry,
            },
            'Failed to register service with registry',
          );
        }
      }
    },
  };
}

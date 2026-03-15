import createClient, { type Middleware } from 'openapi-fetch';
import { fetchToCurl } from 'fetch-to-curl-ts';
import type { ServiceExpress } from '@openapi-typescript-infra/service';
import { HSPrincipal } from '@justtellme/web-auth';

import type { AnyHSServiceLocals, HSServiceLocals } from './types.ts';
import type { DatasourceSpec, HSConfigurationSchema } from './config.ts';

type ClientOptions = Exclude<Parameters<typeof createClient>[0], undefined>;

export type DatasourceOptionsWithFetchAndUrl = Required<Pick<ClientOptions, 'baseUrl'>> &
  Omit<ClientOptions, 'baseUrl'>;

export type DatasourceClientConfigs<Name extends string> = Record<
  Name,
  DatasourceOptionsWithFetchAndUrl | undefined
>;

type ClientPaths = object;

export type DatasourcesType<
  Names extends string,
  Datasources extends Record<Names, ClientPaths>,
> = {
  [K in keyof Datasources]: ReturnType<typeof createClient<Datasources[K]>>;
};

export function getDatasourceConfiguration<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
>(
  app: ServiceExpress<SLocals>,
  serviceName: string,
  explicitConfig?: Partial<DatasourceSpec & ClientOptions>,
): {
  fetch: typeof fetch;
  middleware: Middleware;
  baseUrl: string;
  config: ClientOptions;
  userAgent: string;
} {
  const serviceToken = HSPrincipal.serviceToken(app.locals.name);
  // To avoid "fetch failed" errors that are useless, prepend the target service name in the error message
  async function customFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    return fetch(...args).catch((error) => {
      if (error instanceof Error) {
        error.message = `${serviceName}: ${error.message}`;
      }
      throw error;
    });
  }

  const { datasources, registry } = app.locals.config || {};
  const kebabName = serviceName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const config: DatasourceSpec & ClientOptions = {
    ...explicitConfig,
    ...(datasources?.[serviceName] || datasources?.[kebabName]),
  };
  const {
    baseUrl = registry?.useRegistry
      ? `http://${kebabName}.hs`
      : `http://${kebabName}.hs.svc.cluster.local`,
    userAgent: configuredUserAgent,
    logRequests,
    logResponses,
    ...otherConfig
  } = config;

  const userAgent = `${app.locals.name}/${app.locals.version} nodejs/${process.version} (${process.platform} ${process.arch})`;
  const middleware: Middleware = {
    onRequest({ request, options }) {
      if (configuredUserAgent !== false && !request.headers.has('User-Agent')) {
        request.headers.set(
          'User-Agent',
          typeof configuredUserAgent === 'string' ? configuredUserAgent : userAgent,
        );
      }
      if (!request.headers.get('x-auth-token')) {
        request.headers.set('x-auth-token', serviceToken);
      }
      if (logRequests) {
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        app.locals.logger.info(
          {
            service: serviceName,
            curl: fetchToCurl(
              {
                body: request.clone().body,
                headers,
                url: request.url,
              },
              options as RequestInit,
            ),
          },
          'Outbound request',
        );
      }
      return request;
    },
    onResponse({ response }) {
      if (logResponses) {
        response
          .clone()
          .text()
          .then((text) => {
            app.locals.logger.info(
              {
                service: serviceName,
                status: response.status,
                headers: JSON.stringify(response.headers),
                body: text,
              },
              'Inbound response',
            );
          })
          .catch((error) => {
            app.locals.logger.warn(error, 'Failed to log response');
          });
      }
      return response;
    },
  };

  return { fetch: customFetch, middleware, baseUrl, config: otherConfig, userAgent };
}

export function createDatasourceClients<
  Names extends string,
  Datasources extends Record<Names, ClientPaths>,
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
>(
  app: ServiceExpress<SLocals>,
  datasources: readonly Names[],
  configurationPresets?: Partial<Record<Names, Partial<DatasourceSpec & ClientOptions>>>,
): { [K in keyof Datasources]: ReturnType<typeof createClient<Datasources[K]>> } {
  const clients: Partial<{
    [K in keyof Datasources]: ReturnType<typeof createClient<Datasources[K]>>;
  }> = {};
  datasources.forEach((serviceName) => {
    const explicitConfig = configurationPresets?.[serviceName];
    const {
      fetch: customFetch,
      middleware,
      config,
      baseUrl,
    } = getDatasourceConfiguration(app, serviceName, explicitConfig);
    clients[serviceName] = createClient({
      fetch: customFetch,
      ...config,
      baseUrl,
    });
    clients[serviceName]?.use(middleware);
  });

  return clients as {
    [K in keyof Datasources]: ReturnType<typeof createClient<Datasources[K]>>;
  };
}

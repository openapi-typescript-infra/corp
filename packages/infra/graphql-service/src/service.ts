import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { useHSServiceWithAuth } from '@justtellme/service-with-auth';
import type { Service } from '@openapi-typescript-infra/service';
import {
  insertConfigurationBefore,
  isProd,
  setTelemetryHooks,
} from '@openapi-typescript-infra/service';
import type { Gauge } from '@opentelemetry/api';
import cors from 'cors';
import fs from 'fs';
import type { ExecutionArgs, GraphQLSchema } from 'graphql';
import type { SubscribeMessage } from 'graphql-ws';
import { useServer } from 'graphql-ws/use/ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { HSGraphQLContext } from './Context.ts';
import { HttpHSGraphQLContext, WsHSGraphQLContext } from './Context.ts';
import type { HSGraphQLConfigurationSchema } from './config.ts';
import { loadResolvers } from './graphql-loader.ts';
import { hsApolloPlugin } from './plugin.ts';
import type {
  HSGraphQLRequestLocals,
  HSGraphQLService,
  HSGraphQLServiceLocals,
  HSGraphQLServiceRequest,
  HSGraphQLServiceResponse,
} from './types.ts';

export function useHSGraphQLService<
  SLocals extends
    HSGraphQLServiceLocals<HSGraphQLConfigurationSchema> = HSGraphQLServiceLocals<HSGraphQLConfigurationSchema>,
  RLocals extends HSGraphQLRequestLocals = HSGraphQLRequestLocals,
>(baseService?: Service<SLocals, RLocals>): HSGraphQLService<SLocals, RLocals> {
  const base = useHSServiceWithAuth(baseService);
  let rootDirectory: string;
  let codepath: string;
  let wsCleanup: ReturnType<typeof useServer> | undefined;
  let schema: GraphQLSchema;
  let costGauge: Gauge;
  let complexityGauge: Gauge;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const service: HSGraphQLService<SLocals, RLocals> = {
    ...base,
    configure(startOptions, options) {
      const baseConfig = base?.configure?.(startOptions, options);
      rootDirectory = startOptions.rootDirectory;
      codepath = startOptions.codepath || 'build';

      const baseConfigDirs = baseConfig?.configurationDirectories;
      // The expectation is that you pass in directories such that any values in the first
      // get overridden if the same value is in a subsequent entry. So that means our
      // justtellme/service defaults need to go "before" any existing
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
      app.locals.logger.info('Starting base app');
      await base?.start(app);

      setTelemetryHooks({
        ignoreIncomingRequestHook(req) {
          return (
            req.url === '/health' ||
            req.url === '/metrics' ||
            req.url === '/.well-known/apollo/server-health'
          );
        },
      });
      complexityGauge = app.locals.meter.createGauge('graphql_complexity');
      costGauge = app.locals.meter.createGauge('graphql_cost');

      const resolvers = await loadResolvers(rootDirectory, codepath);
      const typeDefs = fs.readFileSync(
        path.resolve(rootDirectory, 'src', 'generated', 'schema.graphql'),
        'utf-8',
      );

      const { graphql } = app.locals.config;
      schema = makeExecutableSchema({ typeDefs, resolvers });
      const apollo = new ApolloServer<HSGraphQLContext<SLocals>>({
        schema,
        plugins: [hsApolloPlugin(app, schema)],
        introspection: graphql.introspection,
      });
      await apollo.start();
      const devAllowedOrigins = [
        /https:\/\/.*\.justtellme\.com(:\d+)?$/,
        'https://studio.apollographql.com',
      ];
      const apolloMiddleware = expressMiddleware(apollo, {
        async context(apolloContext) {
          return (app.locals.service as typeof service).getContext(apolloContext);
        },
      });
      app.use(
        '/graphql',
        isProd()
          ? cors()
          : cors<cors.CorsRequest>({
              origin: devAllowedOrigins,
              credentials: true,
            }),
        // Give this function a useful name in OTLP
        function apolloServer(req, res, next) {
          return apolloMiddleware(req, res, next);
        },
      );
    },
    attachServer(app, server) {
      if (app.locals.config.graphql.ws) {
        const ws = new WebSocketServer({
          server,
          path: '/graphql',
        });
        wsCleanup = useServer(
          {
            schema,
            async context(c, msg: SubscribeMessage, args: ExecutionArgs) {
              return (app.locals.service as typeof service).getWsContext(app, c, msg, args);
            },
          },
          ws,
        );
      }
    },
    async getWsContext(app, context) {
      return new WsHSGraphQLContext<SLocals>(app, context);
    },
    async getContext({ req, res }) {
      return new HttpHSGraphQLContext<SLocals, RLocals>(
        req as HSGraphQLServiceRequest<SLocals>,
        res as HSGraphQLServiceResponse<unknown, RLocals>,
      );
    },
    async stop(app) {
      if (wsCleanup) {
        await wsCleanup.dispose();
      }
      await base.stop?.(app);
    },
    getLogFields(req: HSGraphQLServiceRequest<SLocals>, values) {
      base?.getLogFields?.(req, values);
      const res = req.res as HSGraphQLServiceResponse<unknown, RLocals> | undefined;
      if (!res?.locals) {
        return;
      }
      if (res.locals.complexity) {
        complexityGauge.record(res.locals.complexity, {
          query: res.locals.query,
        });
        values.c = res.locals.complexity;
      }
      if (res.locals.cost) {
        costGauge.record(res.locals.cost, {
          query: res.locals.query,
        });
        values.c$ = res.locals.cost;
      }
      // Replace the URL (which is boring /graphql) with the query name if we have it
      // TODO this is the client's definition of an operation name, not the query
      // we actually run (could be multiple). Perhaps there's a better log message.
      return res.locals.query;
    },
  };
  return service;
}

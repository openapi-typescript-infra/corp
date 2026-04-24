import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import type { AnyJTMServiceLocals, HSExpress, JTMServiceLocals } from '@justtellme/service';
import { getNodeEnv } from '@openapi-typescript-infra/service';
import pg from 'pg';

import type { HSCloudSqlConfiguration } from './types.ts';

function defaultUsername(app: HSExpress, env: ReturnType<typeof getNodeEnv>) {
  switch (env) {
    case 'production':
    case 'staging':
      return `${app.locals.name}-sa@${app.locals.gcpProjectId}.iam`;
    case 'development':
    case 'test':
    default:
      return process.env.HS_DB_USER || app.locals.name;
  }
}

interface CloudSqlInterface {
  pool: pg.Pool;
  roPool?: pg.Pool;
  connector?: Connector;
  shutdown(): Promise<void>;
}

async function getRoPool<SLocals extends AnyJTMServiceLocals = JTMServiceLocals>(
  app: HSExpress<SLocals>,
  config: HSCloudSqlConfiguration,
  pool: pg.Pool,
): Promise<CloudSqlInterface> {
  const { readOnlyReplica, host = process.env.DATABASE_ID, ...baseConfig } = config;
  if (!readOnlyReplica) {
    return { pool, shutdown: () => Promise.resolve() };
  }

  if (readOnlyReplica === true) {
    if (!host) {
      throw new Error(
        'postgres host configuration is missing, cannot create readonly CloudSQL database connection',
      );
    }
    return getPgPool(app, {
      ...baseConfig,
      host: `${host}-replica`,
    });
  }
  if (typeof readOnlyReplica === 'string') {
    return getPgPool(app, { ...baseConfig, host: readOnlyReplica });
  }
  return getPgPool(app, readOnlyReplica);
}

/**
 * Get a PG SQL pool based on the configuration, with sensible/standardized defaults.
 * If you only have a single database, you can usually get away with just passing the app.
 * We will fetch a config called "db," which is the default
 */
export async function getPgPool<SLocals extends AnyJTMServiceLocals = JTMServiceLocals>(
  app: HSExpress<SLocals>,
  config?: HSCloudSqlConfiguration,
): Promise<CloudSqlInterface> {
  const env = getNodeEnv();
  const finalConfig = (config || app.locals.config.db || {}) as HSCloudSqlConfiguration;
  const { name } = app.locals;

  let useCloudConnector = finalConfig.useCloudConnector;
  if (!('useCloudConnector' in finalConfig)) {
    // Prod and dev (staging) k8s clusters use the cloud connector by default
    useCloudConnector =
      env === 'production' || env === 'staging' || Boolean(process.env.HS_USE_CLOUD_CONNECTOR);
  }

  const { authType, maxPoolSize, useCloudConnector: __, user, database, ...pgConfig } = finalConfig;

  if (useCloudConnector) {
    const { host = process.env.DATABASE_ID, ...nonHostPgConfig } = pgConfig;
    if (!host) {
      throw new Error(
        'postgres host configuration is missing, cannot connect to CloudSQL database',
      );
    }
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName: host,
      ipType: IpAddressTypes.PRIVATE,
      authType: (authType as AuthTypes) || AuthTypes.IAM,
    });

    const pool = new pg.Pool({
      max: maxPoolSize || 5,
      database: database || name.split('-').slice(0, -1).join('-'),
      ...nonHostPgConfig,
      ...clientOpts,
      user: user || defaultUsername(app, env),
    });

    const roPool = await getRoPool(app, finalConfig, pool);

    return {
      pool,
      roPool: roPool.pool,
      connector,
      async shutdown() {
        await pool.end();
        await roPool.shutdown?.();
        connector.close();
      },
    };
  }

  // Default dev password from the service templates
  const password = 'password' in finalConfig ? finalConfig.password : `${name}-pw`;

  const pool = new pg.Pool({
    max: maxPoolSize || 5,
    database: database || name.split('-').slice(0, -1).join('-'),
    ...pgConfig,
    user: user || defaultUsername(app, env),
    password,
  });

  const roPool = await getRoPool(app, finalConfig, pool);

  return {
    pool,
    roPool: roPool.pool,
    async shutdown() {
      await pool.end();
      await roPool.shutdown?.();
    },
  };
}

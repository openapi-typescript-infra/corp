import type { ClientConfig } from 'pg';

export interface HSCloudSqlConfiguration extends ClientConfig {
  /**
   * Whether to use the CloudSQL Connector to connect or just straight PG
   */
  useCloudConnector?: boolean;
  /**
   * The name of the read-only replica, if any.
   * When you call getPgPool, you will get back
   * a second pool for the read-only replica.
   */
  readOnlyReplica?: boolean | string | Omit<HSCloudSqlConfiguration, 'readOnlyReplica'>;
  /**
   * The maximum number of connections to allow
   */
  maxPoolSize?: number;
  /**
   * The type of authentication to use to connect to the database
   * or via CloudSQL Connector
   */
  authType?: 'IAM' | 'PASSWORD';
}

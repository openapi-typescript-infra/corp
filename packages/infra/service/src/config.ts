import type { ConfigurationSchema } from '@openapi-typescript-infra/service';

export interface JTMConfigurationSchema extends ConfigurationSchema {
  apiHost: string;
  registry: {
    // A service we will POST to with our name and port to let it know where we are
    // (essentially development only)
    registryUrl?: string;
    // If true, inter-service calls will assume you are running cluster-proxy which maintains a registry
    // of local services. If false, we go directly to <service-name>.hs.svc.cluster.local
    useRegistry?: boolean;
  };
}

export interface DatasourceSpec {
  baseUrl: string;
  // If set, we will add this UA to outbound requests. If not,
  // we will add a default one that identifies the service. If you
  // do not want us to automatically touch the UA, set it to false
  // (this is sometimes useful for external APIs)
  userAgent?: string | false;
  // Logs curl-format requests
  logRequests?: boolean;
  // Logs the response body and headers
  logResponses?: boolean;
}

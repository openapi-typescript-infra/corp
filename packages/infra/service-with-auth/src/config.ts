import type { DatasourceSpec, HSConfigurationSchema } from '@justtellme/service';
import type { HSAuthConfiguration, HSSessionConfiguration } from '@justtellme/web-auth';

type CombinedConfig = HSConfigurationSchema & HSSessionConfiguration & HSAuthConfiguration;

export interface HSAuthConfigurationSchema extends CombinedConfig {
  datasources: {
    identityInternal?: DatasourceSpec;
  };
}

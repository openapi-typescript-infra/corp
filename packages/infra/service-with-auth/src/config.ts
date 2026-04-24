import type { DatasourceSpec, JTMConfigurationSchema } from '@justtellme/service';
import type { HSAuthConfiguration, HSSessionConfiguration } from '@justtellme/web-auth';

type CombinedConfig = JTMConfigurationSchema & HSSessionConfiguration & HSAuthConfiguration;

export interface HSAuthConfigurationSchema extends CombinedConfig {
  datasources: {
    identityInternal?: DatasourceSpec;
  };
}

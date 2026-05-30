import type { DatasourceSpec, JTMConfigurationSchema } from '@justtellme/service';
import type { JTMAuthConfiguration, JTMSessionConfiguration } from '@justtellme/web-auth';

type CombinedConfig = JTMConfigurationSchema & JTMSessionConfiguration & JTMAuthConfiguration;

export interface JTMAuthConfigurationSchema extends CombinedConfig {
  datasources: {
    identityInternal?: DatasourceSpec;
  };
}

import type { JTMConfigurationSchema } from '@justtellme/service';
import type { JTMAuthConfiguration, JTMSessionConfiguration } from '@justtellme/web-auth';

import type { createAuthnAuthzInternalDatasources } from './datasources.ts';

export interface AuthnAuthzInternalConfigSchema
  extends JTMConfigurationSchema,
    JTMAuthConfiguration,
    JTMSessionConfiguration {
  datasources: ReturnType<typeof createAuthnAuthzInternalDatasources>;
}

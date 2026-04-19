import type { HSConfigurationSchema } from '@justtellme/service';
import type { HSAuthConfiguration, HSSessionConfiguration } from '@justtellme/web-auth';

import type { createAuthnAuthzInternalDatasources } from './datasources.ts';

export interface AuthnAuthzInternalConfigSchema
  extends HSConfigurationSchema,
    HSAuthConfiguration,
    HSSessionConfiguration {
  datasources: ReturnType<typeof createAuthnAuthzInternalDatasources>;
}

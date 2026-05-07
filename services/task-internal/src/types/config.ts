import type { JTMConfigurationSchema } from '@justtellme/service';
import type { ClientConfig } from 'pg';

export interface TaskInternalConfigSchema extends JTMConfigurationSchema {
  db: ClientConfig;
}

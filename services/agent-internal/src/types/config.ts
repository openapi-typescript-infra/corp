import type { JTMConfigurationSchema } from '@justtellme/service';

import type { LangfuseConfig } from '#src/telemetry/langfuse.js';

export interface ModelSpec {
  model: string;
  temperature?: number;
}

export interface AgentInternalConfig extends JTMConfigurationSchema {
  models?: Record<string, ModelSpec>;
  defaultModel?: string;
  redis?: {
    url?: string;
  };
  langfuse?: LangfuseConfig;
  defaultTemporal?: {
    address: string;
    namespace?: string;
    taskQueue?: string;
  };
}

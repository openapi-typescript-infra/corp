import { LangfuseClient } from '@langfuse/client';

export interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  enabled?: boolean;
}

export function setupLangfuseTelemetry(config?: LangfuseConfig) {
  const client = new LangfuseClient({
    publicKey: config?.publicKey ?? '',
    secretKey: config?.secretKey ?? '',
    baseUrl: config?.baseUrl,
  });

  return { client };
}

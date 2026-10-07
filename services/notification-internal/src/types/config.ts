import type { JTMConfigurationSchema } from '@justtellme/service';

interface ProviderConfig {
  apiBaseUrl?: string;
  allowlist?: string[];
}
export interface NotificationInternalConfigSchema extends JTMConfigurationSchema {
  notifications: {
    email?: ProviderConfig & {
      resendApiKey?: string;
      fromEmail?: string;
      replyTo?: string;
    };
    sms?: ProviderConfig & {
      telnyxApiKey?: string;
      fromNumber?: string;
      messagingProfileId?: string;
      dryRun?: boolean;
    };
    push?: {
      webhookUrl?: string;
      authorization?: string;
      expoEnabled?: boolean;
      expoAccessToken?: string;
      expoApiBaseUrl?: string;
    };
    whatsapp?: ProviderConfig & {
      telnyxApiKey?: string;
      fromNumber?: string;
      dryRun?: boolean;
      templates?: Record<
        string,
        {
          templateName: string;
          language?: string;
          bodyParameterKeys: string[];
          urlButton?: { parameterKey: string; index?: number };
        }
      >;
    };
    pubsub?: { enabled?: boolean; subscription?: string; topic?: string };
  };
}

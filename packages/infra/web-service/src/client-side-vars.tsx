// biome-ignore-all lint/security/noDangerouslySetInnerHtml: serializes trusted server-side environment into the hydration bootstrap.
import { getNodeEnv } from '@openapi-typescript-infra/service';

export interface JTMClientSideVariables {
  APP_ENV: 'development' | 'production' | 'staging' | 'test';
  GRAPHQL_ENDPOINT: string;
  WHOAMI: string;
  COOKIE_DOMAIN: string;
  STYTCH_TOKEN: string;
  POSTHOG_KEY: string;
  POSTHOG_HOST: string;
}

export function getClientSideVariables(): JTMClientSideVariables {
  const env = getNodeEnv();
  if (!env) {
    throw new Error('APP_ENV is not defined');
  }
  return {
    APP_ENV: env,
    GRAPHQL_ENDPOINT:
      process.env.GRAPHQL_ENDPOINT ||
      (env === 'production'
        ? 'https://api.justtellme.com/graphql'
        : 'https://api.dev.justtellme.com/graphql'),
    WHOAMI: process.env.WHOAMI || '/',
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
    STYTCH_TOKEN: process.env.STYTCH_TOKEN || '',
    POSTHOG_KEY: process.env.POSTHOG_KEY || '',
    POSTHOG_HOST: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  };
}

export function ClientSideVariables<T extends object = object>({ variables }: { variables?: T }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.justtellme = ${JSON.stringify({
          ...getClientSideVariables(),
          ...variables,
        })}`,
      }}
    />
  );
}

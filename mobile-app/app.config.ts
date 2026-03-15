import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'just-tell-me',
  slug: 'just-tell-me',
  extra: {
    STYTCH_TOKEN: process.env.STYTCH_TOKEN ?? '',
    POSTHOG_KEY: process.env.POSTHOG_KEY ?? '',
    POSTHOG_HOST: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
  },
});

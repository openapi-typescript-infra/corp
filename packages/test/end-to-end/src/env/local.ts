import type { EnvConfig } from './types.ts';

export const local: EnvConfig = {
  type: 'development',
  timeBase: {
    QUICK: 5000,
    SLOW: 15000,
    GLACIAL: 60000,
  },
  api: 'https://api.local.dev.justtellme.com',
  graphqlApi: 'https://api.local.dev.justtellme.com/graphql',
  web: {
    host: 'https://consumer.local.dev.justtellme.com',
  },
  users: {
    default: {
      email: process.env.JTM_TEST_DEFAULT_EMAIL || '',
      password: process.env.JTM_TEST_DEFAULT_PASSWORD || '',
      otpSecret: process.env.JTM_TEST_DEFAULT_OTP_SECRET || '',
    },
  },
};

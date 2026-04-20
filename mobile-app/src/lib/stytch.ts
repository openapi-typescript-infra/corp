import type { StytchUIConfig } from '@stytch/react-native';
import { OAuthProviders, OTPMethods, RNUIProducts, StytchClient } from '@stytch/react-native';
import Constants from 'expo-constants';

// Shared STYTCH_TOKEN env var — same value used by consumer-web.
// Passed in via app.config.ts → extra from process.env.STYTCH_TOKEN.
const STYTCH_TOKEN = Constants.expoConfig?.extra?.STYTCH_TOKEN as string;
if (!STYTCH_TOKEN) {
  throw new Error('STYTCH_TOKEN env var is not set. Add it to mobile-app/.env');
}

export const stytchClient = new StytchClient(STYTCH_TOKEN);

export const stytchUIConfig: StytchUIConfig = {
  productConfig: {
    products: [RNUIProducts.oauth, RNUIProducts.otp],
    oAuthOptions: {
      providers: [OAuthProviders.Google, OAuthProviders.Apple],
    },
    otpOptions: {
      methods: [OTPMethods.Email, OTPMethods.SMS],
      expirationMinutes: 10,
    },
    sessionOptions: {
      sessionDurationMinutes: 60,
    },
  },
};

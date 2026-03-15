import { useStytch, useStytchUser } from '@stytch/nextjs';
import { useEffect } from 'react';

import { getEnvVar } from '../env.ts';

export const GoogleOneTap = ({
  identityWebHost,
  isUserLoading,
  isUserLoggedIn,
  redirectUrl,
  onError,
}: {
  isUserLoading: boolean;
  isUserLoggedIn: boolean;
  redirectUrl?: string;
  onError?: (error: Error) => void;
  identityWebHost?: string;
}) => {
  const stytch = useStytch();
  const { isInitialized } = useStytchUser();

  const isShowGoogleOneTap = isInitialized && !isUserLoggedIn && !isUserLoading;

  useEffect(() => {
    if (isShowGoogleOneTap) {
      const authenticateUrl = `${
        identityWebHost || getEnvVar('WHOAMI')
      }/authenticate?return_url=${encodeURIComponent(redirectUrl || window.location.href)}`;
      stytch.oauth.googleOneTap
        .start({
          login_redirect_url: authenticateUrl,
          signup_redirect_url: authenticateUrl,
        })
        .catch((e: Error) => {
          if (onError) {
            onError(e);
          }
        });
    }
  }, [isShowGoogleOneTap, stytch, redirectUrl, onError, identityWebHost]);

  return null;
};

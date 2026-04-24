import { type StytchClientOptions, StytchProvider } from '@stytch/nextjs';
import * as React from 'react';

import { getEnvVar, isProd } from '../env.ts';

const cookieSuffix = isProd() ? '' : '_dev';

export const stytchOptions = {
  cookieOptions: {
    availableToSubdomains: true,
    domain: getEnvVar('COOKIE_DOMAIN', 'justtellme.com'),
    istCookieName: `s_ist${cookieSuffix}`,
    jwtCookieName: `s_jwt${cookieSuffix}`,
    opaqueTokenCookieName: `s_id${cookieSuffix}`,
  },
};

export function JTMStytchProvider({
  children,
  createClient,
}: React.PropsWithChildren<{
  createClient(
    token: string,
    options: StytchClientOptions,
  ): Parameters<typeof StytchProvider>[0]['stytch'] | undefined;
}>) {
  const client = React.useMemo(
    () => createClient(getEnvVar('STYTCH_TOKEN'), stytchOptions),
    [createClient],
  );

  return client ? <StytchProvider stytch={client}>{children}</StytchProvider> : children;
}

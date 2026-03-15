import { withUrqlClient } from 'next-urql';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useValue } from '@legendapp/state/react';
import { HSStytchProvider, HSPostHogProvider } from '@justtellme/web-service/isomorphic';
import { FullPageLoader } from '@justtellme/ui-kit';
import { app$ } from '@justtellme/state';

import '@justtellme/ui-kit/styles.css';

import type { HSAppProps } from '#src/types/NextPage.ts';

import { getUrqlClientOptions } from '#src/lib/urql.ts';
import { getSingletonStytchHeadlessClient } from '#src/lib/stytch.ts';
import { StytchStateBridge } from '#src/components/StytchStateBridge.tsx';
import { PostHogPageviewTracker } from '#src/components/PostHogPageviewTracker.tsx';

const HSAppComponent = ({ Component, pageProps }: HSAppProps) => {
  const router = useRouter();

  // Handle error pages differently
  if (router.route === '/404') {
    return (
      <>
        <Head>
          <title>404 - Page Not Found</title>
        </Head>
        <Component {...pageProps} />
      </>
    );
  }

  return (
    <HSPostHogProvider>
      <PostHogPageviewTracker />
      <HSStytchProvider clientType="CONSUMER" createClient={getSingletonStytchHeadlessClient}>
        <StytchStateBridge />
        <Head>
          <title>Just Tell Me</title>
        </Head>
        <AppLoadingOverlay />
        <Component {...pageProps} />
      </HSStytchProvider>
    </HSPostHogProvider>
  );
};

export default withUrqlClient(getUrqlClientOptions)(HSAppComponent);

const AppLoadingOverlay = () => {
  const loaded = useValue(app$.loaded);
  if (loaded) {
    return null;
  }
  return <FullPageLoader />;
};

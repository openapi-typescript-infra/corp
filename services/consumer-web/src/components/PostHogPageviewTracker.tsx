import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { track } from '@justtellme/state';

/** Captures pageview events on Next.js route changes. Render inside HSPostHogProvider. */
export function PostHogPageviewTracker() {
  const router = useRouter();

  useEffect(() => {
    track('page_viewed', { path: router.asPath, title: document.title });

    const handleRouteChange = (url: string) => {
      track('page_viewed', { path: url, title: document.title });
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events, router.asPath]);

  return null;
}

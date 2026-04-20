import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

/**
 * Lazily loads PostHog provider and pageview tracker after hydration,
 * keeping posthog-js out of the initial shared JS bundle.
 */
export function LazyPostHog({ children }: { children: ReactNode }) {
  const [Wrapper, setWrapper] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    void Promise.all([
      import('@justtellme/web-service/isomorphic/posthog'),
      import('#src/components/PostHogPageviewTracker.js'),
      import('posthog-js/react'),
      import('@justtellme/state'),
    ]).then(([providerMod, trackerMod, posthogReactMod, stateMod]) => {
      const Provider = providerMod.HSPostHogProvider;
      const Tracker = trackerMod.PostHogPageviewTracker;
      const usePostHog = posthogReactMod.usePostHog;
      const { setAnalyticsClient } = stateMod;

      function PostHogAnalyticsBridge({ children }: { children: ReactNode }) {
        const posthog = usePostHog();
        useEffect(() => {
          setAnalyticsClient(posthog);
        }, [posthog]);
        return <>{children}</>;
      }

      function ComposedWrapper({ children }: { children: ReactNode }) {
        return (
          <Provider>
            <Tracker />
            <PostHogAnalyticsBridge>{children}</PostHogAnalyticsBridge>
          </Provider>
        );
      }

      setWrapper(() => ComposedWrapper);
    });
  }, []);

  if (!Wrapper) {
    return <>{children}</>;
  }

  return <Wrapper>{children}</Wrapper>;
}

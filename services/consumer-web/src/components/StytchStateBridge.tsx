import { useEffect } from 'react';
import { useStytchUser, useStytchSession } from '@stytch/nextjs';
import { setStytch, setAnalyticsClient, identifyUser, resetAnalytics } from '@justtellme/state';
import { usePostHog } from 'posthog-js/react';

/** Syncs Stytch auth state into app$. Render inside HSStytchProvider. */
export function StytchStateBridge() {
  const { user, isInitialized } = useStytchUser();
  const { session } = useStytchSession();
  const posthog = usePostHog();

  // Inject the PostHog client into the shared analytics layer
  useEffect(() => {
    setAnalyticsClient(posthog);
  }, [posthog]);

  useEffect(() => {
    if (isInitialized) {
      setStytch(user ?? null, session ?? null);
    }
  }, [user, session, isInitialized]);

  // Identify/reset analytics when auth state changes
  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    if (user) {
      const email = user.emails?.[0]?.email;
      identifyUser(user.user_id, {
        email,
        name: [user.name.first_name, user.name.last_name].filter(Boolean).join(' ') || undefined,
      });
    } else {
      resetAnalytics();
    }
  }, [user, isInitialized, posthog]);

  return null;
}

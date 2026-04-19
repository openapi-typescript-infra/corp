import { identifyUser, resetAnalytics, setAnalyticsClient, setStytch } from '@justtellme/state';
import { useStytchSession, useStytchUser } from '@stytch/react-native';
import { usePostHog } from 'posthog-react-native';
import { useEffect } from 'react';

/** Syncs Stytch auth state into app$. Render inside StytchProvider. */
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
  }, [user, isInitialized]);

  return null;
}

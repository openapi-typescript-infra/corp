import { identifyUser, resetAnalytics, setStytch } from '@justtellme/state';
import { useStytchSession, useStytchUser } from '@stytch/nextjs';
import { useEffect } from 'react';

/** Syncs Stytch auth state into app$. Render inside JTMStytchProvider. */
export function StytchStateBridge() {
  const { user, isInitialized } = useStytchUser();
  const { session } = useStytchSession();

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

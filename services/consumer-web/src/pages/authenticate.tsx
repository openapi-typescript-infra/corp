import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useStytch, useStytchSession } from '@stytch/nextjs';

/**
 * Stytch redirect callback page. Handles the token exchange after OAuth
 * or magic link flows, then redirects to the return_url (or /).
 */
export default function AuthenticatePage() {
  const router = useRouter();
  const stytch = useStytch();
  const { session } = useStytchSession();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const tokenType = params.get('stytch_token_type');
    const returnUrl = params.get('return_url') || '/';

    if (session) {
      router.replace(returnUrl);
      return;
    }

    if (!token || !tokenType) {
      router.replace('/');
      return;
    }

    const authenticate = async () => {
      try {
        if (tokenType === 'oauth') {
          await stytch.oauth.authenticate(token, {
            session_duration_minutes: 60,
          });
        } else if (tokenType === 'magic_links') {
          await stytch.magicLinks.authenticate(token, {
            session_duration_minutes: 60,
          });
        }
        router.replace(returnUrl);
      } catch {
        router.replace('/');
      }
    };

    authenticate().catch((error) => {
      console.error(error);
    });
  }, [stytch, session, router]);

  return null;
}

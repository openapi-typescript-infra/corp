import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useValue } from '@legendapp/state/react';
import { StytchLogin, Products, OAuthProviders, type StytchLoginConfig } from '@stytch/nextjs';
import { useStytch } from '@stytch/nextjs';
import { getEnvVar } from '@justtellme/web-service/isomorphic';
import { app$ } from '@justtellme/state';

function useLoginConfig(): StytchLoginConfig {
  const router = useRouter();
  return useMemo(() => {
    const whoami = getEnvVar('WHOAMI', '');
    const authenticateUrl = `${whoami}/authenticate?return_url=${encodeURIComponent(String(router.asPath))}`;
    return {
      products: [Products.oauth, Products.otp],
      oauthOptions: {
        providers: [{ type: OAuthProviders.Google }, { type: OAuthProviders.Apple }],
        loginRedirectURL: authenticateUrl,
        signupRedirectURL: authenticateUrl,
      },
      otpOptions: {
        methods: ['email', 'sms'],
        expirationMinutes: 10,
      },
    };
  }, [router.asPath]);
}

export default function IndexPage() {
  const init = useValue(app$.auth.initialized);
  const user = useValue(app$.auth.user);
  const hasSession = useValue(app$.auth.hasSession);
  useEffect(() => {
    if (init) {
      app$.loaded.set(true);
    }
  }, [init]);

  const loginConfig = useLoginConfig();

  if (!hasSession) {
    return (
      <div style={{ maxWidth: 400, margin: '64px auto' }}>
        <StytchLogin config={loginConfig} />
      </div>
    );
  }

  return <LoggedInView name={user?.name} emails={user?.emails} />;
}

function LoggedInView({ name, emails }: { name?: string; emails?: string[] }) {
  const stytch = useStytch();

  return (
    <div style={{ maxWidth: 400, margin: '64px auto' }}>
      <h1>Welcome{name ? `, ${name}` : ''}</h1>
      {emails && emails.length > 0 && <p>{emails.join(', ')}</p>}
      <button type="button" onClick={() => stytch.session.revoke()}>
        Log out
      </button>
    </div>
  );
}

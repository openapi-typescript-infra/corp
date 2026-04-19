import { getNodeEnv } from '@openapi-typescript-infra/service';
import Document, { Head, Html, Main, NextScript } from 'next/document';

const readEnv = (name: string, fallback = ''): string => {
  const env = process.env as Record<string, string | undefined>;
  return env[name] ?? fallback;
};

const getClientSideVariables = (includeStytchAdminToken: boolean) => {
  const appEnv = getNodeEnv();

  return {
    APP_ENV: appEnv,
    GRAPHQL_ENDPOINT:
      readEnv('GRAPHQL_ENDPOINT') ||
      (appEnv === 'production'
        ? 'https://api.justtellme.com/graphql'
        : 'https://api.dev.justtellme.com/graphql'),
    WHOAMI: readEnv('WHOAMI', '/'),
    COOKIE_DOMAIN: readEnv('COOKIE_DOMAIN'),
    STYTCH_CONSUMER: readEnv('STYTCH_CONSUMER'),
    STYTCH_ADMIN: includeStytchAdminToken ? readEnv('STYTCH_ADMIN') : '',
  };
};

class HSDocument extends Document {
  render() {
    const page = this.props.__NEXT_DATA__.page;
    const includeStytchAdminToken = page !== '/404' && page !== '/_error';

    return (
      <Html data-background="base">
        <Head>
          <link rel="stylesheet" href="/theme.css" />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.hs = ${JSON.stringify(
                getClientSideVariables(includeStytchAdminToken),
              )}`,
            }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default HSDocument;

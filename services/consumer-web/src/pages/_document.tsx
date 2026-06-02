import { getNodeEnv } from '@openapi-typescript-infra/service';
import type { DocumentProps } from 'next/document.js';
import Document, { Head, Html, Main, NextScript } from 'next/document.js';

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
    STYTCH_TOKEN: readEnv('STYTCH_TOKEN'),
  };
};

class AppDocument extends Document {
  declare props: Readonly<DocumentProps>;

  render() {
    const page = this.props.__NEXT_DATA__.page;
    const includeStytchAdminToken = page !== '/404' && page !== '/_error';

    return (
      <Html data-background="base">
        <Head>
          <link rel="stylesheet" href="/theme.css" />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.jtm = ${JSON.stringify(
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

export default AppDocument;

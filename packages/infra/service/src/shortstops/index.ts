import fs from 'node:fs';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getNodeEnv, type ServiceOptions } from '@openapi-typescript-infra/service';
import { GoogleAuth, JWT } from 'google-auth-library';

export function getGcpProjectId(): string {
  if (getNodeEnv() === 'production') {
    return 'justtellme-prod';
  }
  return 'justtellme-dev';
}

const filters = {
  // Return the variable if it exists and is non-empty
  '|u': (value?: string) => {
    return value === '' ? undefined : value;
  },
  // Return the value as a decimal
  '|d': (value?: string) => {
    return parseInt(value || '', 10);
  },
  '|b': (value?: string) => {
    return Buffer.from(value || '', 'base64');
  },
  // Return the value as a JSON object
  '|j': (value?: string) => {
    return value ? JSON.parse(value) : undefined;
  },
};

function getGsmHandler(secretmanagerClient: SecretManagerServiceClient, shouldThrow: boolean) {
  return async (value: string) => {
    let secretName = value;
    let filter: (value?: string) => unknown = (value: string | undefined) => value;

    Object.entries(filters).some(([key, fn]) => {
      if (value.endsWith(key)) {
        secretName = value.slice(0, -key.length);
        filter = fn;
        return true;
      }
      return false;
    });

    const localOverride = `GSM_${secretName
      .replace(/[- ]/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toUpperCase()}`;
    if (process.env[localOverride]) {
      return filter(process.env[localOverride]);
    }
    const secretVersionName = `projects/${getGcpProjectId()}/secrets/${secretName}/versions/latest`;
    return secretmanagerClient
      .accessSecretVersion({
        name: secretVersionName,
      })
      .then(([version]) => filter(version.payload?.data?.toString()))
      .catch((err) => {
        if (shouldThrow) {
          err.message = `Failed to access Secret Manager secret ${secretVersionName}: ${err.message}`;
          throw err;
        }
        return undefined;
      });
  };
}

function loadServiceAccount() {
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!p) {
    return null;
  }

  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!json.client_email || !json.private_key) {
    return null;
  }
  return json;
}

async function getGcpIdentity(part: string) {
  const sa = loadServiceAccount();

  let client: JWT | Awaited<ReturnType<GoogleAuth['getClient']>>;

  if (sa) {
    // NEW recommended path
    client = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  } else {
    // Running in GCP → no key file → use metadata server
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    client = await auth.getClient(); // metadata server path → NO deprecated helpers
  }

  // Try direct email
  if ('email' in client) {
    const email = client.email || null;
    return part === 'username' ? email?.split('@')[0] : email;
  }

  // Fallback: introspect the token
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    console.error('No GCP identity token found');
    return null;
  }

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const email = data.email || null;
  return part === 'username' ? email?.split('@')[0] : email;
}

export function addShortstopHandlers(handlers: ServiceOptions['shortstopHandlers']) {
  const secretmanagerClient = new SecretManagerServiceClient();
  const modified = { ...handlers };

  modified['gsm'] = getGsmHandler(secretmanagerClient, true);
  modified['gsm_optional'] = getGsmHandler(secretmanagerClient, false);
  modified['gcp'] = getGcpIdentity;

  return modified;
}

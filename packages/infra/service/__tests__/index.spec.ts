import type { paths } from '@justtellme/identity-internal-client';
import { AuthPrincipal } from '@justtellme/web-auth';
import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { createDatasourceClients, useJTMService } from '../src/index.ts';

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        email: 'github-actions-ci@example-dev.iam.gserviceaccount.com',
      };
    }
  },
  JWT: class {
    email?: string;

    constructor(options: { email?: string }) {
      this.email = options.email;
    }
  },
}));

const Datasources = ['identityInternal'] as const;
interface DatasourcePaths {
  identityInternal: paths;
}

const SERVICE_NAME = 'sample-internal';
const originalGoogleApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

describe('basic service', () => {
  beforeAll(async () => {
    process.env.GSM_SERVICE_FIXTURE_NUMBER = '6379';
    process.env.GSM_SERVICE_FIXTURE_LABEL = 'sample-service';
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  afterAll(() => {
    if (originalGoogleApplicationCredentials === undefined) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleApplicationCredentials;
    }
  });

  test('should respond to simple request', async () => {
    const app = await getReusableApp({
      service: useJTMService,
      rootDirectory: path.join(new URL('.', import.meta.url).pathname, SERVICE_NAME),
      codepath: 'src',
      name: SERVICE_NAME,
      version: '1.0.0',
    });
    expect((app.locals.config as unknown as { secret: number }).secret).toBe(6379);
    expect((app.locals.config as unknown as { secret_label: string }).secret_label).toBe(
      'sample-service',
    );
    expect((app.locals.config as unknown as { gcp_identity: string }).gcp_identity).toBe(
      'github-actions-ci@example-dev.iam.gserviceaccount.com',
    );
    await request(app).get('/hello').expect(200, { greeting: 'Hello World' });
  });

  test('should setup proper user agent and token', async () => {
    const app = await getReusableApp({
      service: useJTMService,
      rootDirectory: path.join(new URL('.', import.meta.url).pathname, SERVICE_NAME),
      codepath: 'src',
      name: SERVICE_NAME,
      version: '1.0.0',
    });

    const datasources = createDatasourceClients<keyof DatasourcePaths, DatasourcePaths>(
      app,
      Datasources,
      {
        identityInternal: {
          baseUrl: `http://localhost:${app.locals.config.server.port}`,
        },
      },
    );

    let calledOnRequest = false;
    let calledOnResponse = false;
    datasources.identityInternal.use({
      onRequest({ request }) {
        calledOnRequest = true;
        expect(request.headers.get('user-agent')).toMatch(
          /sample-internal\/1\.0\.0 nodejs\/v\d+\.\d+\.\d+ \(\w+ \w+\)/,
        );
        expect(request.keepalive).toBe(false);
        expect(request.headers.get('x-auth-token')).toBeDefined();
        const principal = request.headers.get('x-auth-token');
        expect(new AuthPrincipal(principal || '').clientId).toBe(SERVICE_NAME);
        return request;
      },
      onResponse({ response }) {
        calledOnResponse = true;
        expect(response.status).toBe(200);
        return response;
      },
    });

    const rz = await datasources.identityInternal.GET('/identity/individuals', {
      params: { query: { individual_uuids: [] } },
      keepalive: false,
    });
    expect(calledOnRequest).toBe(true);
    expect(calledOnResponse).toBe(true);
    expect(rz.data).toMatchInlineSnapshot(`
      {
        "greeting": "Hello World",
      }
    `);

    const errorSource = createDatasourceClients<keyof DatasourcePaths, DatasourcePaths>(
      app,
      Datasources,
      {
        identityInternal: {
          // https will fail
          baseUrl: `https://localhost:${app.locals.config.server.port}`,
        },
      },
    );
    let errored = false;
    await errorSource.identityInternal
      .GET('/identity/individuals', { params: { query: { individual_uuids: [] } } })
      .catch((error) => {
        errored = true;
        expect(error.message).toMatch(/identityInternal: fetch failed/);
      });
    expect(errored).toBe(true);
  });
});

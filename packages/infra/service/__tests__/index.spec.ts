import path from 'path';

import { beforeAll, describe, expect, test } from 'vitest';
import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';
import type { paths } from '@justtellme/api/identity-internal';
import { JTMPrincipal } from '@justtellme/web-auth';

import { createDatasourceClients, useJTMService } from '../src/index.ts';

const Datasources = ['identityInternal'] as const;
interface DatasourcePaths { identityInternal: paths; }

describe('basic service', () => {
  beforeAll(async () => {
    process.env.GSM_REDIS_GENERAL_PURPOSE_PORT = '6379';
  });

  test('should respond to simple request', async () => {
    const app = await getReusableApp({
      service: useJTMService,
      rootDirectory: path.join(new URL('.', import.meta.url).pathname, 'just-tell-me-internal'),
      codepath: 'src',
      name: 'just-tell-me-internal',
      version: '1.0.0',
    });
    expect((app.locals.config as unknown as { secret: number }).secret).toBe(6379);
    await request(app).get('/hello').expect(200, { greeting: 'Hello World' });
  });

  test('should setup proper user agent and token', async () => {
    const app = await getReusableApp({
      service: useJTMService,
      rootDirectory: path.join(new URL('.', import.meta.url).pathname, 'just-tell-me-internal'),
      codepath: 'src',
      name: 'just-tell-me-internal',
      version: '1.0.0',
    });

    const datasources = createDatasourceClients<keyof DatasourcePaths, DatasourcePaths>(app, Datasources, {
      identityInternal: {
        baseUrl: `http://localhost:${app.locals.config.server.port}`,
      },
    });

    let calledOnRequest = false;
    let calledOnResponse = false;
    datasources.identityInternal.use({
      onRequest({ request }) {
        calledOnRequest = true;
        expect(request.headers.get('user-agent')).toMatch(/just-tell-me-internal\/1\.0\.0 nodejs\/v\d+\.\d+\.\d+ \(\w+ \w+\)/);
        expect(request.keepalive).toBe(false);
        expect(request.headers.get('x-auth-token')).toBeDefined();
        const principal = request.headers.get('x-auth-token');
        expect(new JTMPrincipal(principal || '').clientId).toBe('just-tell-me-internal');
        return request;
      },
      onResponse({ response }) {
        calledOnResponse = true;
        expect(response.status).toBe(200);
        return response;
      },
    });

    const rz = await datasources.identityInternal.GET('/identity/individuals', { params: { query: { individual_uuids: [] } }, keepalive: false });
    expect(calledOnRequest).toBe(true);
    expect(calledOnResponse).toBe(true);
    expect(rz.data).toMatchInlineSnapshot(`
      {
        "greeting": "Hello World",
      }
    `);

    const errorSource = createDatasourceClients<keyof DatasourcePaths, DatasourcePaths>(app, Datasources, {
      identityInternal: {
        // https will fail
        baseUrl: `https://localhost:${app.locals.config.server.port}`,
      },
    });
    let errored = false;
    await errorSource.identityInternal.GET('/identity/individuals', { params: { query: { individual_uuids: [] } } }).catch((error) => {
      errored = true;
      expect(error.message).toMatch(/identityInternal: fetch failed/);
    });
    expect(errored).toBe(true);
  });
});

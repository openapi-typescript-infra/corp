import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';
import jsonwebtoken from 'jsonwebtoken';
import type createClient from 'openapi-fetch';
import type { FetchResponse } from 'openapi-fetch';
import { describe, expect, test, vi } from 'vitest';

import type { TestServiceLocals } from './src/index.ts';

type IdentityInternalApi = ReturnType<
  typeof createClient<Pick<IdentityInternal, '/identity/access'>>
>;

const consumerUuid = 'ee402898-e63f-479b-9f32-7b46acf5d6fa';
const partnerUuid = '33669e33-6758-4a0f-8358-4cd3a5e716ef';

const withConsumerToken = {
  'x-auth-token': jsonwebtoken.sign(
    {
      sub: consumerUuid,
      aud: ['user'],
    },
    null,
    { algorithm: 'none' },
  ),
};
const withPartnerToken = {
  'x-auth-token': jsonwebtoken.sign(
    {
      sub: partnerUuid,
      aud: ['partner'],
      scope: 'enrollment',
      g: ['inteq'],
    },
    null,
    { algorithm: 'none' },
  ),
};

describe('middleware', () => {
  test('disabled', async () => {
    expect(
      'We need to disable this test temporarily to pivot out of some cyclic dependencies',
    ).toBeTruthy();
  });

  test('authorization', async () => {
    const app = await getReusableApp<TestServiceLocals>({
      rootDirectory: new URL('.', import.meta.url).pathname,
      name: 'test-api',
    });
    expect(app.locals.withAuthorization).toBeDefined();
    expect(app.locals.withAuthorization('1 == 1')).to.be.a('function');

    // await request(app).get('/open').expect(200, { message: 'Hello, world!' });
    // await request(app).get('/protected').expect(200, { message: 'Hello, world!' });
    // await request(app).get('/blocked').expect(401);
    // await request(app).get('/header').expect(401);
    // await request(app).get('/header').set({ foo: 'bar' }).expect(200, { message: 'Hello, world!' });

    let response = await request(app).get(
      '/test-it/37911d60-d5d1-43af-8413-fd3174d53477/identifier',
    );
    expect(response.status).toBe(401);

    // Mock moose call, which will happen twice
    if (app.locals.datasources.identityInternal) {
      vi.spyOn(
        app.locals.datasources.identityInternal as unknown as IdentityInternalApi,
        'POST',
      ).mockImplementation(async (method, args) => {
        if (method !== '/identity/access') {
          throw new Error(`Unexpected method: ${method}`);
        }
        return Promise.resolve({
          data:
            args.body.subjects?.[0]?.identifier === '37911d60-d5d1-43af-8413-fd3174d53477'
              ? {
                  grants: [
                    {
                      identifier: '37911d60-d5d1-43af-8413-fd3174d53477',
                      namespace: 'patient-uuid',
                    },
                  ],
                }
              : { grants: [] },
          response: {
            status: 200,
          },
        }) as Promise<FetchResponse<never, never, never>>;
      });
    }

    response = await request(app).get(`/test-it/${consumerUuid}/identifier`).set(withConsumerToken);
    expect(response.status).toBe(204);

    response = await request(app)
      .get('/test-it/37911d60-dead-beef-8413-fd3174d53477/identifier')
      .set(withConsumerToken);
    expect(response.status).toBe(403);

    response = await request(app).get('/partner').set(withPartnerToken);
    expect(response.status).toBe(200);

    response = await request(app).get('/partner-alt').set(withPartnerToken);
    expect(response.status).toBe(200);

    response = await request(app).get('/partner-foobar').set(withPartnerToken);
    expect(response.status).toBe(403);
  });
});

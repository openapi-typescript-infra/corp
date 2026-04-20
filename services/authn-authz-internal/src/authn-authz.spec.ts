import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';
import { beforeAll, describe, expect } from 'vitest';

import { testWithApp } from './test.fixtures.ts';
import type { AuthnAuthzInternalLocals } from './types/service.ts';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  expect(payload).toBeDefined();
  return JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

const testUser = {
  email: 'max+authnauthztest@pyralis.com',
  externalId: 'c_gPAWHhTLLpicnmZfKP9pPG',
  uuid: '801e9258-e7ee-493c-af87-620007559a1a',
  stytchId: 'user-test-3cf138f5-d77f-44eb-8a02-acae8a734706',
};

describe('Basic test of authn-authz-internal', () => {
  let sJwt: string;
  let sId: string;

  beforeAll(async () => {
    const app = await getReusableApp<AuthnAuthzInternalLocals>();
    const link = await app.locals.stytch.consumer.magicLinks.create({ user_id: testUser.stytchId });
    const session = await app.locals.stytch.consumer.magicLinks.authenticate({
      token: link.token,
      session_duration_minutes: 5,
    });
    sJwt = session.session_jwt;
    sId = session.session_token;
    // console.error(sJwt);
    // console.error(sId);
  });

  testWithApp('authenticate a user with an expired token', async ({ client }) => {
    const sBadJwt =
      'eyJhbGciOiJSUzI1NiIsImtpZCI6Imp3ay10ZXN0LWIyMGI1Y2M5LWU4MWItNDhjMC1iYjljLWUzMDE1ZGJjMTY3YiIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsicHJvamVjdC10ZXN0LWVlNDUwZGFiLTY4NDEtNGE0OC04ZDdlLTg2NTRjYmQxMmMxYiJdLCJleHAiOjE3NzIzNzU0MTUsImh0dHBzOi8vc3R5dGNoLmNvbS9zZXNzaW9uIjp7ImlkIjoic2Vzc2lvbi10ZXN0LTE2ODJkN2Q1LWI5NTItNDRkNi05NWUwLTcxODE0NGZlZDcyMiIsInN0YXJ0ZWRfYXQiOiIyMDI2LTAzLTAxVDE0OjI1OjE1WiIsImxhc3RfYWNjZXNzZWRfYXQiOiIyMDI2LTAzLTAxVDE0OjI1OjE1WiIsImV4cGlyZXNfYXQiOiIyMDI2LTAzLTAxVDE0OjM1OjE1WiIsImF0dHJpYnV0ZXMiOnsidXNlcl9hZ2VudCI6IiIsImlwX2FkZHJlc3MiOiIifSwiYXV0aGVudGljYXRpb25fZmFjdG9ycyI6W3sidHlwZSI6Im1hZ2ljX2xpbmsiLCJkZWxpdmVyeV9tZXRob2QiOiJlbWJlZGRlZCIsImxhc3RfYXV0aGVudGljYXRlZF9hdCI6IjIwMjYtMDMtMDFUMTQ6MjU6MTVaIn1dLCJyb2xlcyI6WyJzdHl0Y2hfdXNlciJdfSwiaWF0IjoxNzcyMzc1MTE1LCJpZCI6ImNfZ1BBV0hoVExMcGljbm1aZktQOXBQRyIsImlzcyI6InN0eXRjaC5jb20vcHJvamVjdC10ZXN0LWVlNDUwZGFiLTY4NDEtNGE0OC04ZDdlLTg2NTRjYmQxMmMxYiIsIm5iZiI6MTc3MjM3NTExNSwic3ViIjoidXNlci10ZXN0LTNjZjEzOGY1LWQ3N2YtNDRlYi04YTAyLWFjYWU4YTczNDcwNiJ9.N2OTdENn3ASk2rhpAg0VjiYzluWjsbemePoApZFqzbvuZ8hmyHG3GzoSeZ-LPB9Xv5w_rxn_3Q4cCEkoFlKfI-ozu_YHTA1wm9PZCVRwCa5c7WJuvDZPXYIPh6Y0nxD6cnwf4rrMjuz4ckkpN0XK72h7dAUiuaxArespFC8efplLBvZD13uo0xCHAkbkLMrGUVH9v_2be0Qlm-DtYgp4b0E-lJi91CJHeqNmoMFgrw98a6jdu0RA3RCP7js1wI_dsXZHwb2-dAKQuae6NYBs3lLtKg2IjO1ih1h9yS2yR07RONGIl4bq0b_YxyEREJvVy__GN5tObQzOKBxOouhDag';
    const sBadId = '2c8zctzLsVFOnNpzhZub0ki_LPoTpdSq3wmOJhw51_3y';
    const Cookie = `s_jwt_dev=${sBadJwt}; s_id_dev=${sBadId};`;
    const r = await client.GET('/authentication', { params: { header: { Cookie } } });
    expect(r.response.status).toBe(401);
    expect(r.error?.code).toBe('session_not_found');
    expect(r.error?.message).toBeDefined();
  });

  testWithApp('authenticate a user with Cookie', async ({ client }) => {
    const Cookie = `s_jwt_dev=${sJwt}; s_id_dev=${sId};`;
    const response = await client.GET('/authentication', { params: { header: { Cookie } } });
    expect(response.data?.['x-auth-token']).toBeDefined();
    const payload = decodeJwtPayload(response.data?.['x-auth-token'] as string);
    expect(payload.aud).toEqual(['consumer']);
    expect(payload.sub).toBe(testUser.uuid);
  });

  testWithApp('authenticate a user with Authorization', async ({ client }) => {
    const Authorization = `Bearer ${sJwt}`;
    const response = await client.GET('/authentication', {
      params: {
        header: { Authorization },
      },
    });
    expect(response.data?.['x-auth-token']).toBeDefined();
    const payload = decodeJwtPayload(response.data?.['x-auth-token'] as string);
    expect(payload.aud).toEqual(['consumer']);
    expect(payload.sub).toBe(testUser.uuid);
  });

  testWithApp('authenticate a user with Envoy', async ({ app }) => {
    const Cookie = `s_jwt_dev=${sJwt}; s_id_dev=${sId};`;
    request(app)
      .get('/envoy/token-check')
      .set('Cookie', Cookie)
      .expect(200, (err, response) => {
        expect(response.status).toBe(200);
        expect(response.headers['x-auth-token']).toBeDefined();
      });
  });
});

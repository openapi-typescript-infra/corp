import { describe, test } from 'vitest';
import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';

describe('Basic test', () => {
  test('make an encryption key', async () => {
    const app = await getReusableApp();

    await request(app).get('/unknown-url').expect(404);
  });
});

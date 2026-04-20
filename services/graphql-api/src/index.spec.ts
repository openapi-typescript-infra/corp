import { getReusableApp, request } from '@openapi-typescript-infra/service-tester';
import { describe, test } from 'vitest';

describe('Basic test', () => {
  test('make an encryption key', async () => {
    const app = await getReusableApp();

    await request(app).get('/unknown-url').expect(404);
  });
});

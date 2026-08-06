import { readFileSync } from 'node:fs';
import { getPrincipal } from '@justtellme/web-auth';
import { expect, test } from 'vitest';

test('the default service config decodes trusted ExtAuth principals', async () => {
  const config = JSON.parse(
    readFileSync(new URL('../config/config.json', import.meta.url), 'utf8'),
  );
  const userUuid = '00000000-0000-4000-8000-000000000001';
  const token = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userUuid, aud: ['user'] })).toString('base64url'),
    '',
  ].join('.');

  const principal = await getPrincipal({
    app: { locals: { config } },
    headers: { 'x-auth-token': token },
  } as never);

  expect(principal?.userUuid).toBe(userUuid);
});

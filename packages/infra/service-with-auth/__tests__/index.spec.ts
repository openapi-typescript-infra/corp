import {
  clearReusableApp,
  getReusableApp,
  request,
} from '@openapi-typescript-infra/service-tester';
import path from 'path';
import { expect, test } from 'vitest';

import { service } from './holistic-sound-api/src/index.ts';

test('Sessions should work', async () => {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const app = await getReusableApp({
    service,
    rootDirectory: path.resolve(__dirname, 'holistic-sound-api'),
    codepath: 'src',
    name: 'holistic-sound-api',
    version: '1.0.0',
  });

  expect(app, 'app should start up').toBeTruthy();

  const agent = request.agent(app);
  const response = await agent.get('/test?value=abc123').expect(200, { saved: true });
  expect(response.headers['set-cookie'], 'expect cookie header').toBeTruthy();
  await agent.get('/fetch').expect(200, { hello: 'abc123' });

  await clearReusableApp();
});

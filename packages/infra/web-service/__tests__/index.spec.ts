import {
  clearReusableApp,
  getReusableApp,
  request,
} from '@openapi-typescript-infra/service-tester';
import path from 'path';
import * as redisMock from 'redis-mock';
import { expect, test, vi } from 'vitest';

import { JTMWeb } from './sample-web/src/index.ts';

test('Webs should serv', async () => {
  const app = await getReusableApp({
    service: JTMWeb,
    rootDirectory: path.resolve(__dirname, 'sample-web'),
    codepath: 'src',
    name: 'justtellme-web',
    version: '1.0.0',
  });

  expect(app).toBeTruthy();
  await request(app).get('/index.html').expect(200);
  await request(app).get('/non.html').expect(404);

  // No CSRF
  await request(app).post('/post').expect(400);

  const agent = request.agent(app);
  const response = await agent.get('/test?value=abc123').expect(200, { saved: true });
  expect(response.headers['set-cookie']).toBeTruthy();

  // Has CSRF
  const testcsrf = response.headers['set-cookie'].toString().match(/testcsrf=([^;]+);/)?.[1];
  expect(testcsrf).toBeTruthy();

  await agent.get('/fetch').expect(200, { hello: 'abc123' });

  await agent
    .post('/post')
    .send({
      testcsrf,
    })
    .expect(204);
  await clearReusableApp();
});

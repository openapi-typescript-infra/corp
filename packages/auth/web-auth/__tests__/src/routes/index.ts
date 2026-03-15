import type { HSServiceRouter } from '@justtellme/service';
import type { ServiceExpress, ServiceHandler } from '@openapi-typescript-infra/service';

import type { TestServiceLocals } from '../index.ts';

export function route(router: HSServiceRouter, app: ServiceExpress<TestServiceLocals>) {
  const helloJson: ServiceHandler = (req, res) => {
    res.json({ message: 'Hello, world!' });
  };

  router.get('/open', helloJson);

  router.get('/protected', app.locals.withAuthorization('1 + 2 > 2'), helloJson);
  router.get('/blocked', app.locals.withAuthorization('1 + 2 < 2'), helloJson);
  router.get('/header', app.locals.withAuthorization('headers.foo == "bar"'), helloJson);

  router.get(
    '/partner',
    app.locals.withAuthorization('user.role == "partner" and "enrollment" in scopes'),
    helloJson,
  );

  router.get('/partner-alt', app.locals.withAuthorization('hasScope("enrollment")'), helloJson);

  router.get(
    '/partner-foobar',
    app.locals.withAuthorization('user.role == "partner" and "foobar" in scopes'),
    helloJson,
  );
}

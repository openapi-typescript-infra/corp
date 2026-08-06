import type { ServiceExpress, ServiceRouter } from '@openapi-typescript-infra/service';
import type { JTMWebServiceLocals } from '../../../../src/types.ts';

declare module 'express-session' {
  interface SessionData {
    helloWorld?: string;
  }
}

export function route(router: ServiceRouter, app: ServiceExpress<JTMWebServiceLocals>) {
  const { withSession } = app.locals;

  router.get('/test', withSession, async (req, res) => {
    req.session.helloWorld = req.query.value as string;
    await new Promise((accept) => {
      req.session.save(accept);
    });
    res.json({ saved: true });
  });

  router.get('/fetch', withSession, (req, res) => {
    res.json({ hello: req.session.helloWorld });
  });

  router.post('/post', (req, res) => {
    res.sendStatus(204);
  });
}

import type { ServiceRouter } from '@openapi-typescript-infra/service';

export function route(router: ServiceRouter) {
  router.get('/identity/individuals', (req, res) => {
    res.json({
      greeting: 'Hello World',
    });
  });
}

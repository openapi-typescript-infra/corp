import type { HSExpress } from '@justtellme/service';
import type { HSPrincipalInit } from '@justtellme/web-auth';
import { HSPrincipal } from '@justtellme/web-auth';

export async function getTokenForPrincipal(
  app: HSExpress,
  {
    uuid,
    options,
    role = 'user',
  }: {
    uuid: string;
    role: HSPrincipal['role'];
    options?: Omit<HSPrincipalInit, 'sub' | 'aud'>;
  },
) {
  const user = new HSPrincipal({
    ...options,
    sub: uuid,
    aud: [role],
  });
  return user.encodeJwt();
}

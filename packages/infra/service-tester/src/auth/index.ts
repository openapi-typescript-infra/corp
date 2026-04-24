import type { HSExpress } from '@justtellme/service';
import type { JTMPrincipalInit } from '@justtellme/auth-token';
import { JTMPrincipal } from '@justtellme/auth-token';

export async function getTokenForPrincipal(
  app: HSExpress,
  {
    uuid,
    options,
    role = 'user',
  }: {
    uuid: string;
    role: JTMPrincipal['role'];
    options?: Omit<JTMPrincipalInit, 'sub' | 'aud'>;
  },
) {
  const user = new JTMPrincipal({
    ...options,
    sub: uuid,
    aud: [role],
  });
  return user.encodeJwt();
}

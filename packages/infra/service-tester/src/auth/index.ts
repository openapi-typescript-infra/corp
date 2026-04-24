import type { HSExpress } from '@justtellme/service';
import type { AuthPrincipalInit } from '@justtellme/auth-token';
import { AuthPrincipal } from '@justtellme/auth-token';

export async function getTokenForPrincipal(
  app: HSExpress,
  {
    uuid,
    options,
    role = 'user',
  }: {
    uuid: string;
    role: AuthPrincipal['role'];
    options?: Omit<AuthPrincipalInit, 'sub' | 'aud'>;
  },
) {
  const user = new AuthPrincipal({
    ...options,
    sub: uuid,
    aud: [role],
  });
  return user.encodeJwt();
}

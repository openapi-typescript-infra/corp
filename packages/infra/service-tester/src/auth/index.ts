import type { AuthPrincipalInit } from '@justtellme/auth-token';
import { AuthPrincipal } from '@justtellme/auth-token';
import type { JTMExpress } from '@justtellme/service';

export async function getTokenForPrincipal(
  _app: JTMExpress,
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

import { authenticate } from '#src/lib/authenticator.ts';
import type { AuthnAuthzInternal, AuthnAuthzInternalApi } from '#src/types/service.ts';

export const GET: AuthnAuthzInternalApi['getAuthenticationToken'] = async (req, res) => {
  const result = await authenticate(req, res as AuthnAuthzInternal['Response'], { internal: true });
  res.json({
    'x-auth-token': result?.xAuthToken,
  });
};

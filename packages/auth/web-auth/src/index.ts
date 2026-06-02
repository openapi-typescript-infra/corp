import type { AuthPrincipal } from '@justtellme/auth-token';

export { AuthPrincipal } from '@justtellme/auth-token';
export * from './authentication/index.ts';
export * from './authorization/requestDocument.ts';
export * from './middleware.ts';
export * from './types.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    type User = AuthPrincipal;

    interface Request {
      user?: User;
    }
  }
}

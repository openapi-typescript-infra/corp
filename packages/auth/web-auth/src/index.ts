import type { JTMPrincipal } from '@justtellme/auth-token';

export * from './authentication/index.ts';
export * from './authorization/requestDocument.ts';
export * from './middleware.ts';
export * from './types.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    type User = JTMPrincipal;

    interface Request {
      user?: User;
    }
  }
}

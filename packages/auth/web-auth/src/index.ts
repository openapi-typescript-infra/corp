import type { HSPrincipal } from './authentication/index.ts';

export * from './authentication/index.ts';
export * from './middleware.ts';
export * from './types.ts';
export * from './authorization/requestDocument.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    type User = HSPrincipal;

    interface Request {
      user?: User;
    }
  }
}

import type { HSAuthConfigurationSchema } from '@justtellme/service-with-auth';
import type { CookieOptions } from 'express-serve-static-core';

export interface HSWebConfigurationSchema extends HSAuthConfigurationSchema {
  csrf: {
    action?: 'block' | 'warn'; // Empty means "ignore CSRF protection"
    // List of include/exclude paths for CSRF protection
    exclude?: (string | RegExp)[];
    include?: (string | RegExp)[];
    headerAndCookieName?: string;
    autoAssignCookie?: boolean;
    cookie?: CookieOptions;
  };
  posthog: {
    key: string;
    host?: string;
  };
}

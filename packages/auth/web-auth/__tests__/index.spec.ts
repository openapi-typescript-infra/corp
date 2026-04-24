import { describe, expect, test } from 'vitest';

import { getMiddleware, AuthPrincipal } from '#src/index.ts';

describe('module export', () => {
  test('should export something', () => {
    expect(getMiddleware).toBeDefined();
    expect(typeof getMiddleware).toBe('function');
  });

  test('should generate service tokens', () => {
    const token = AuthPrincipal.serviceToken('foo-internal');
    expect(token).toBeDefined();
    const p = new AuthPrincipal(token);
    expect(p.role).toBe('service');
    expect(p.clientId).toBe('foo-internal');
    expect(p.userUuid).toBeUndefined();
  });
});

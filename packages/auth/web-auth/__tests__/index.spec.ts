import { describe, expect, test } from 'vitest';

import { getMiddleware, JTMPrincipal } from '#src/index.ts';

describe('module export', () => {
  test('should export something', () => {
    expect(getMiddleware).toBeDefined();
    expect(typeof getMiddleware).toBe('function');
  });

  test('should generate service tokens', () => {
    const token = JTMPrincipal.serviceToken('foo-internal');
    expect(token).toBeDefined();
    const p = new JTMPrincipal(token);
    expect(p.role).toBe('service');
    expect(p.clientId).toBe('foo-internal');
    expect(p.userUuid).toBeUndefined();
  });
});

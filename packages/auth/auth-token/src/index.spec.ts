import { describe, expect, test } from 'vitest';

import { AuthPrincipal } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(AuthPrincipal).toBeTypeOf('function');
  });

  test('should create service tokens', () => {
    const token = AuthPrincipal.createServiceToken('service-internal');
    expect(token).toBeTypeOf('string');
    const sp = new AuthPrincipal(token);
    expect(sp.role).toBe('service');
    expect(sp.clientId).toBe('service-internal');
    expect(sp.userUuid).toBeUndefined();
  });
});

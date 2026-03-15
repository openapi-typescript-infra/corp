import { describe, expect, test } from 'vitest';

import { HSPrincipal } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(HSPrincipal).toBeTypeOf('function');
  });

  test('should create service tokens', () => {
    const token = HSPrincipal.createServiceToken('service-internal');
    expect(token).toBeTypeOf('string');
    const sp = new HSPrincipal(token);
    expect(sp.role).toBe('service');
    expect(sp.clientId).toBe('service-internal');
    expect(sp.userUuid).toBeUndefined();
  });
});

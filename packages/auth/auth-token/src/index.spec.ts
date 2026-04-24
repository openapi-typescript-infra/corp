import { describe, expect, test } from 'vitest';

import { JTMPrincipal } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(JTMPrincipal).toBeTypeOf('function');
  });

  test('should create service tokens', () => {
    const token = JTMPrincipal.createServiceToken('service-internal');
    expect(token).toBeTypeOf('string');
    const sp = new JTMPrincipal(token);
    expect(sp.role).toBe('service');
    expect(sp.clientId).toBe('service-internal');
    expect(sp.userUuid).toBeUndefined();
  });
});

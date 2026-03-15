import { describe, expect, test } from 'vitest';

import { getTokenForPrincipal } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(getTokenForPrincipal).is.a('function');
  });
});

import { describe, expect, test } from 'vitest';

import { cn, FullPageLoader } from './index.ts';

describe('Module exports', () => {
  test('should export FullPageLoader component', () => {
    expect(FullPageLoader).toBeDefined();
    expect(typeof FullPageLoader).toBe('function');
  });

  test('should export cn utility', () => {
    expect(cn).toBeDefined();
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  test('cn should merge conflicting tailwind classes', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });
});

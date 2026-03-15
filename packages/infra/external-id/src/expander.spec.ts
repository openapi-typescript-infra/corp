import { randomUUID } from 'crypto';

import { describe, expect, test } from 'vitest';

import { toExternalID } from './codec.ts';
import { ExternalIDType } from './registry.ts';
import expandShortUUID from './expander.js';

describe('self contained expander should work', () => {
  test('should expand', () => {
    const random = randomUUID();
    const hs = toExternalID(ExternalIDType.Consumer, random);
    expect(expandShortUUID(hs)).toBe(random);
  });
});

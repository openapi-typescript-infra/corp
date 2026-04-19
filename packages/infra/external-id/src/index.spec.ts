import { randomUUID } from 'crypto';

import { describe, expect, test } from 'vitest';

import {
  ExternalIDType,
  fromExternalID,
  parseExternalID,
  stringToExternalID,
  toExternalID,
} from './index.ts';

describe('Basic test', () => {
  test('should translate a uuid back and forth', () => {
    const uuid = randomUUID();
    const externalID = toExternalID(ExternalIDType.Consumer, uuid);
    expect(externalID).toMatch(/^c_[a-zA-Z0-9_-]{22}$/);
    expect(stringToExternalID(ExternalIDType.Consumer, uuid)).toEqual(externalID);
    expect(stringToExternalID(ExternalIDType.Consumer, externalID)).toEqual(externalID);
    expect(fromExternalID(externalID)).toEqual(uuid);
    // @ts-expect-error The types do not match
    const parsed: { type: ExternalIDType.Individual; uuid: string } = parseExternalID(externalID);
    expect(parsed.type).toEqual(ExternalIDType.Consumer);
    expect(fromExternalID('123', false)).toBeUndefined();
  });
});

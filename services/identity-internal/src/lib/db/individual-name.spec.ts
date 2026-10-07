import { describe, expect, test } from 'vitest';

import {
  canonicalizeName,
  encodeName,
  getFullNameFromComponents,
  parseName,
} from './individual-name.ts';

describe('NameEncoder', () => {
  test.each(['Jr.', 'Sr.', 'III'])(
    'round-trips suffix %s separately from credentials',
    (suffix) => {
      const original = {
        firstName: 'John',
        lastName: 'Doe',
        middleName: 'W.',
        credentials: 'MD',
        suffix,
      };
      const encoded = encodeName(original);
      expect(encoded).toBe(`Doe|John|W.;c=MD;s=${suffix}`);
      expect(parseName(encoded)).toEqual(original);
      expect(canonicalizeName(parseName(encoded))).toBe(
        `doe|john|w.;c=md;s=${suffix.toLowerCase()}`,
      );
    },
  );

  test('suffix survives attribute escaping', () => {
    const original = { firstName: 'John', lastName: 'Doe', suffix: 'Jr.;100%' };
    expect(encodeName(original)).toBe('Doe|John;s=Jr.%3B100%25');
    expect(parseName(encodeName(original))).toEqual(original);
  });

  test('omits empty suffixes and preserves legacy names', () => {
    expect(encodeName({ firstName: 'John', lastName: 'Doe', suffix: '' })).toBe('Doe|John');
    expect(parseName('Doe|John').suffix).toBeUndefined();
  });

  test('includes suffix before credentials in display names', () => {
    expect(
      getFullNameFromComponents({
        firstName: 'John',
        lastName: 'Doe',
        suffix: 'Jr.',
        credentials: 'MD',
      }),
    ).toBe('John Doe Jr., MD');
    expect(getFullNameFromComponents({ first_name: 'John', last_name: 'Doe', suffix: 'III' })).toBe(
      'John Doe III',
    );
    expect(getFullNameFromComponents({ firstName: 'John', lastName: 'Doe' })).toBe('John Doe');
  });
  test('canonicalizeName without middleName', () => {
    const encoded = canonicalizeName({ firstName: 'John', lastName: 'Doe' });
    expect(encoded).toBe('doe|john');
  });

  test('canonicalizeName with middleName', () => {
    const encoded = canonicalizeName({ firstName: 'John', lastName: 'Doe', middleName: 'W.' });
    expect(encoded).toBe('doe|john|w.');
  });

  test('encodeName with middleName', () => {
    const encoded = encodeName({ firstName: 'John', lastName: 'Doe', middleName: 'W.' });
    expect(encoded).toBe('Doe|John|W.');
  });

  test('canonicalizeName with pipe in name', () => {
    const encoded = canonicalizeName({ firstName: 'John', lastName: 'Doe|Sr', middleName: 'W|.' });
    expect(encoded).toBe('doe||sr|john|w||.');
  });

  test('canonicalizeName without middleName', () => {
    const decoded = parseName('Doe|John');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  test('parseName with middleName', () => {
    const decoded = parseName('Doe|John|W.');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe', middleName: 'W.' });
  });

  test('parseName with pipe in name', () => {
    const decoded = parseName('Doe||Sr|John|W||.');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe|Sr', middleName: 'W|.' });
  });

  test('encode and decode cycle', () => {
    const original = { firstName: 'john', lastName: 'doe|sr', middleName: 'w|.' };
    const encoded = canonicalizeName(original);
    const decoded = parseName(encoded);
    expect(decoded).toEqual(original);
  });

  test('encodeName with credentials', () => {
    const encoded = encodeName({ firstName: 'John', lastName: 'Doe', credentials: 'MD' });
    expect(encoded).toBe('Doe|John;c=MD');
  });

  test('encodeName with middleName and credentials', () => {
    const encoded = encodeName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'W.',
      credentials: 'MD',
    });
    expect(encoded).toBe('Doe|John|W.;c=MD');
  });

  test('canonicalizeName with credentials', () => {
    const encoded = canonicalizeName({ firstName: 'John', lastName: 'Doe', credentials: 'MD' });
    expect(encoded).toBe('doe|john;c=md');
  });

  test('parseName with credentials', () => {
    const decoded = parseName('Doe|John;c=MD');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe', credentials: 'MD' });
  });

  test('parseName with middleName and credentials', () => {
    const decoded = parseName('Doe|John|W.;c=MD');
    expect(decoded).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'W.',
      credentials: 'MD',
    });
  });

  test('encode and decode cycle with credentials', () => {
    const original = { firstName: 'john', lastName: 'doe', credentials: 'md, phd' };
    const encoded = canonicalizeName(original);
    const decoded = parseName(encoded);
    expect(decoded).toEqual(original);
  });

  test('parseName without credentials returns no attributes', () => {
    const decoded = parseName('Doe|John');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  test('parseName ignores unknown attributes', () => {
    const decoded = parseName('Doe|John;c=MD;x=future');
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe', credentials: 'MD' });
  });

  test('semicolon in credentials is percent-encoded', () => {
    const encoded = encodeName({ firstName: 'John', lastName: 'Doe', credentials: 'MD; PhD' });
    expect(encoded).toBe('Doe|John;c=MD%3B PhD');
    const decoded = parseName(encoded);
    expect(decoded).toEqual({ firstName: 'John', lastName: 'Doe', credentials: 'MD; PhD' });
  });
});

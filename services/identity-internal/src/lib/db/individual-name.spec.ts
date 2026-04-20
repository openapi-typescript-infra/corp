import { describe, expect, test } from 'vitest';

import { canonicalizeName, encodeName, parseName } from './individual-name.ts';

describe('NameEncoder', () => {
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

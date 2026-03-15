import { shortener } from './short-uuid.ts';
import type { ExternalIDType } from './registry.ts';

export function toExternalID<IDType extends ExternalIDType>(
  type: IDType,
  id: string,
): `${IDType}_${string}` {
  return `${type}_${shortener.fromUUID(id)}`;
}

/**
 * Convert a string to a ExternalID if it's a UUID, or leave it alone it's already in the correct format.
 * @param type - The type of the ExternalID
 * @param id - The string to convert
 * @returns A ExternalID
 */
export function stringToExternalID<IDType extends ExternalIDType>(
  type: IDType,
  id: string,
): `${IDType}_${string}` {
  if (id.startsWith(type) && !id.includes('-')) {
    return id as `${IDType}_${string}`;
  }
  return toExternalID(type, id);
}

/**
 * Extract just the UUID from a ExternalID.
 */
export function fromExternalID(id: string, throwError: false): string | undefined;
export function fromExternalID(id: string, throwError?: true): string;
export function fromExternalID(id: string, throwError = true) {
  if (!id) {
    if (throwError) {
      throw new Error('ExternalID cannot be empty');
    }
    return undefined;
  }

  try {
    return shortener.toUUID(id.split('_')[1]) as string;
  } catch (error) {
    if (throwError) {
      throw error;
    }
    return undefined;
  }
}

export interface ParsedExternalID<IDType extends string> {
  type: IDType;
  shortId: string;
  uuid: string;
  externalID: `${IDType}_${string}`;
}

/**
 * Get a UUID and type from a ExternalID when you know the type you expect.
 */
export function parseExternalID<IDType extends ExternalIDType>(
  externalID: `${IDType}_${string}`,
): ParsedExternalID<IDType> {
  const [type, shortId] = externalID.split('_');
  return {
    externalID,
    type: type as IDType,
    shortId,
    uuid: shortener.toUUID(shortId),
  };
}

/**
 * Get a UUID and type from a ExternalID without knowing what type you are expecting.
 */
export function parseUnknownExternalID(externalID: string): ParsedExternalID<string> {
  const [type, shortId] = externalID.split('_');
  return {
    externalID: externalID as `${string}_${string}`,
    type: type as ExternalIDType,
    shortId,
    uuid: shortener.toUUID(shortId),
  };
}

/**
 * Extract a UUID from a string that might be a UUID or an ExternalID. If it's an ExternalID
 * and you pass an expected type, this function will throw an error if the type doesn't match.
 */
export function getUuidFromString(id: string, expected?: ExternalIDType | ExternalIDType[]) {
  if (id.includes('_')) {
    const [type, uuid] = id.split('_');
    const asArray = Array.isArray(expected) ? expected : [expected];
    if (expected && !asArray.includes(type as ExternalIDType)) {
      throw new Error(`ExternalID expected ${asArray.join(', ')} but got ${type}`);
    }
    return shortener.toUUID(uuid);
  }
  // Welp, it best be a UUID
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)
    ? id
    : undefined;
}

/**
 * Just convert a uuid to a short string without any sort of prefix
 */
export function toBareShortUuid(uuid: string) {
  return shortener.fromUUID(uuid);
}

/**
 * Convert a bare short uuid back to a full UUID
 */
export function fromBaseShortUuid(shortId: string) {
  return shortener.toUUID(shortId);
}

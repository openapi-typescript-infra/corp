import { encode } from '@toon-format/toon';
import { XMLParser } from 'fast-xml-parser';

/**
 * Recursively removes null and undefined values from an object/array.
 */
export function removeNulls<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return undefined as T;
  }
  if (Array.isArray(obj)) {
    return obj.filter((item) => item !== null && item !== undefined).map(removeNulls) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        result[key] = removeNulls(value);
      }
    }
    return result as T;
  }
  return obj;
}

/**
 * Encode data to TOON format, stripping nulls for compactness.
 */
export function toToon(data: unknown): string {
  return encode(removeNulls(data));
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

/**
 * Check if a MIME type represents a text-based format that should be
 * converted to TOON rather than passed as a file attachment.
 */
export function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/xml' ||
    mimeType === 'application/json' ||
    mimeType.endsWith('+xml') ||
    mimeType.endsWith('+json')
  );
}

/**
 * Convert a text document (XML or JSON) to TOON format for more
 * efficient token usage when passing to LLMs.
 */
export function textDocumentToToon(content: Buffer | ArrayBuffer, mimeType: string): string {
  const buffer = content instanceof ArrayBuffer ? Buffer.from(content) : content;
  const text = buffer.toString('utf-8');

  let data: unknown;
  if (mimeType === 'application/json' || mimeType.endsWith('+json')) {
    data = JSON.parse(text);
  } else if (
    mimeType === 'application/xml' ||
    mimeType === 'text/xml' ||
    mimeType.endsWith('+xml')
  ) {
    data = xmlParser.parse(text);
  } else {
    // For other text types (text/plain, text/csv, etc.), return as-is
    return text;
  }

  return toToon(data);
}

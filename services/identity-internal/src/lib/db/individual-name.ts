function unescape(str: string): string {
  return str.replace(/\|\|/g, '|');
}

function escape(str?: string) {
  return str?.replace(/\|/g, '||');
}

/**
 * Parse key-value attributes from the portion after the first `;`.
 * Format: `key=value;key=value`. Values are percent-encoded (`;` → `%3B`).
 */
function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const pair of attrStr.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      attrs[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return attrs;
}

function encodeAttrValue(value: string): string {
  return value.replace(/%/g, '%25').replace(/;/g, '%3B');
}

function appendAttributes(base: string, attrs: Record<string, string | undefined>): string {
  let result = base;
  for (const [key, value] of Object.entries(attrs)) {
    if (value) {
      result += `;${key}=${encodeAttrValue(value)}`;
    }
  }
  return result;
}

export function encodeName({
  firstName,
  lastName,
  middleName,
  credentials,
}: {
  firstName: string | undefined;
  lastName: string;
  middleName?: string;
  credentials?: string;
}) {
  const namePart = `${escape(lastName)}|${escape(firstName) || ''}${middleName ? '|' : ''}${
    escape(middleName) || ''
  }`;
  return appendAttributes(namePart, { c: credentials });
}

export function canonicalizeName({
  firstName,
  lastName,
  middleName,
  credentials,
}: {
  firstName: string;
  lastName: string;
  middleName?: string;
  credentials?: string;
}) {
  const eFirst = escape(firstName)?.toLocaleLowerCase();
  const eLast = escape(lastName)?.toLocaleLowerCase();
  const eMiddle = escape(middleName)?.toLocaleLowerCase() || '';
  const namePart = `${eLast || ''}|${eFirst || ''}${eMiddle ? '|' : ''}${eMiddle || ''}`;
  return appendAttributes(namePart, { c: credentials?.toLocaleLowerCase() });
}

/**
 * Parse a pipe-encoded individual name.
 * Format: `LastName|FirstName[|MiddleName][;key=value;...]`
 *
 * The pipe-separated portion encodes name components for fast DB lookups.
 * Everything after the first unescaped `;` is key-value attributes:
 *   c = credentials (e.g. `c=MD`)
 *
 * Pipes within name components are escaped as `||`.
 */
export function parseName(encodedName: string) {
  // Split off the key-value attributes at the first semicolon.
  // Semicolons only appear as the attribute delimiter — no escaping needed
  // because the pipe-encoded name part uses `||` for its own escaping.
  const semiIndex = encodedName.indexOf(';');
  const namePart = semiIndex >= 0 ? encodedName.slice(0, semiIndex) : encodedName;
  const attrs = semiIndex >= 0 ? parseAttributes(encodedName.slice(semiIndex + 1)) : {};

  const parts: string[] = [];
  let temp = '';
  for (let i = 0; i < namePart.length; i++) {
    if (namePart[i] === '|' && (i === namePart.length - 1 || namePart[i + 1] !== '|')) {
      parts.push(unescape(temp));
      temp = '';
    } else if (namePart[i] === '|' && namePart[i + 1] === '|') {
      temp += '||';
      i++; // skip the next pipe
    } else {
      temp += namePart[i];
    }
  }
  if (temp) {
    parts.push(unescape(temp));
  }

  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts[2] || undefined,
    credentials: attrs.c || undefined,
  };
}

interface FlexibleNameComponents {
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  credentials?: string | null;
  title?: string | null;
}

export function getFullNameFromComponents({
  firstName,
  first_name,
  lastName,
  last_name,
  credentials,
  title,
}: FlexibleNameComponents = {}): string {
  const nameParts = [title, firstName || first_name, lastName || last_name]
    .filter((part) => part)
    .join(' ');
  return credentials ? `${nameParts}, ${credentials}` : nameParts;
}

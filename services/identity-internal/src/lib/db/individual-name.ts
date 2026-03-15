function unescape(str: string): string {
  return str.replace(/\|\|/g, '|');
}

function escape(str?: string) {
  return str?.replace(/\|/g, '||');
}

export function encodeName({
  firstName,
  lastName,
  middleName,
}: {
  firstName: string | undefined;
  lastName: string;
  middleName?: string;
}) {
  return `${escape(lastName)}|${escape(firstName) || ''}${middleName ? '|' : ''}${
    escape(middleName) || ''
  }`;
}

export function canonicalizeName({
  firstName,
  lastName,
  middleName,
}: {
  firstName: string;
  lastName: string;
  middleName?: string;
}) {
  const eFirst = escape(firstName)?.toLocaleLowerCase();
  const eLast = escape(lastName)?.toLocaleLowerCase();
  const eMiddle = escape(middleName)?.toLocaleLowerCase() || '';
  return `${eLast || ''}|${eFirst || ''}${eMiddle ? '|' : ''}${eMiddle || ''}`;
}

export function parseName(encodedName: string) {
  const parts: string[] = [];
  let temp = '';
  for (let i = 0; i < encodedName.length; i++) {
    if (encodedName[i] === '|' && (i === encodedName.length - 1 || encodedName[i + 1] !== '|')) {
      parts.push(unescape(temp));
      temp = '';
    } else if (encodedName[i] === '|' && encodedName[i + 1] === '|') {
      temp += '||';
      i++; // skip the next pipe
    } else {
      temp += encodedName[i];
    }
  }
  if (temp) {
    parts.push(unescape(temp));
  }

  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts[2] || undefined,
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

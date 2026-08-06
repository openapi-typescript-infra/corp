import type { Selectable } from 'kysely';
import type { IndividualIdentifiers } from '#src/generated/database.ts';
import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import { canonicalizeName, parseName } from './individual-name.ts';

interface NamespaceDetail {
  id: number;
  name: string;
  unique: boolean;
  type: 'email' | 'phone' | 'opaque' | 'uuid' | 'individual_name';
}

const NamespaceCache: Record<string, NamespaceDetail> = {
  'individual-uuid': {
    id: 0,
    name: 'individual-uuid',
    unique: true,
    type: 'uuid',
  },
};
const NamespaceById: Record<number, NamespaceDetail> = {
  0: NamespaceCache['individual-uuid'],
};

function readNsRows(
  updates: {
    identifier_namespace_id: number;
    name: string;
    is_unique: boolean;
    identifier_namespace_type: NamespaceDetail['type'];
  }[],
) {
  for (const update of updates) {
    const ns = {
      id: update.identifier_namespace_id as number,
      name: update.name as string,
      unique: !!update.is_unique,
      type: update.identifier_namespace_type,
    };
    NamespaceCache[ns.name] = ns;
    NamespaceById[ns.id] = ns;
  }
}

// Cache the namespaces in memory for the duration of the server's lifetime.
export async function resolveNamespaces(
  app: IdentityInternal['App'],
  names: components['schemas']['IdentifierNamespaces'][],
) {
  const missingNames = new Set(names.filter((name) => !NamespaceCache[name]));
  if (missingNames.size) {
    const updates = await app.locals.db
      .selectFrom('identifier_namespaces')
      .select(['identifier_namespace_id', 'name', 'identifier_namespace_type', 'is_unique'])
      .where('name', 'in', [...missingNames])
      .execute();
    readNsRows(updates);
  }
  if (names.find((name) => !NamespaceCache[name])) {
    throw new Error(
      `Could not resolve namespaces: ${names.filter((name) => !NamespaceCache[name]).join(', ')}`,
    );
  }
  return names.map((name) => NamespaceCache[name] as NamespaceDetail);
}

export async function resolveNamespaceIds(app: IdentityInternal['App'], ids: number[]) {
  const missingIds = new Set(ids.filter((id) => !NamespaceById[id]));
  if (missingIds.size) {
    const updates = await app.locals.db
      .selectFrom('identifier_namespaces')
      .select(['identifier_namespace_id', 'name', 'identifier_namespace_type', 'is_unique'])
      .where('identifier_namespace_id', 'in', [...missingIds])
      .execute();
    readNsRows(updates);
  }
  if (ids.find((id) => !NamespaceById[id])) {
    throw new Error(
      `Could not resolve namespaces: ${ids.filter((id) => !NamespaceById[id]).join(', ')}`,
    );
  }
  return ids.map((id) => NamespaceById[id] as NamespaceDetail);
}

export async function getNamespace(
  app: IdentityInternal['App'],
  name: components['schemas']['IdentifierNamespaces'],
) {
  const [namespace] = await resolveNamespaces(app, [name]);
  return namespace;
}

export function canonicalizePhone(phone: string) {
  const stripped = phone.replace(/[^0-9]/g, '').trim();
  if (stripped.length === 10) {
    return `1${stripped}`;
  }
  if (stripped.length === 11 && stripped[0] === '1') {
    return stripped;
  }
  throw new Error(`Invalid phone number supplied ${phone}`);
}

export function canonicalize(identifier: string, namespace: Pick<NamespaceDetail, 'type'>) {
  switch (namespace.type) {
    case 'email':
    case 'uuid':
      return identifier.toLowerCase();
    case 'phone':
      return canonicalizePhone(identifier);
    case 'individual_name':
      return canonicalizeName(parseName(identifier));
    default:
      return identifier;
  }
}

export function isValidIdentifier(identifier: string, type: NamespaceDetail['type']) {
  switch (type) {
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(identifier);
    }
    case 'phone': {
      const stripped = identifier.replace(/[^0-9]/g, '').trim();
      return stripped.length === 10 || stripped.length === 11;
    }
    case 'uuid': {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(identifier);
    }
    default:
      return true;
  }
}

export interface CanonicalIdentifier {
  identifier_namespace: components['schemas']['IdentifierNamespaces'];
  identifier_namespace_id: number;
  identifier: string;
  display_identifier: string;
  is_unique: boolean;
}

export async function toDatabaseIdentifierDetail(
  app: IdentityInternal['App'],
  identifiers: components['schemas']['IdentifierInput'][],
): Promise<CanonicalIdentifier[]> {
  await resolveNamespaces(
    app,
    identifiers.map((identifier) => identifier.namespace),
  );
  return identifiers.map((identifier) => {
    const ns = NamespaceCache[identifier.namespace];
    return {
      identifier_namespace: ns.name as components['schemas']['IdentifierNamespaces'],
      identifier_namespace_id: ns.id,
      identifier: canonicalize(identifier.identifier, ns),
      display_identifier: identifier.identifier,
      is_unique: ns.unique,
    };
  });
}

type CoreIdentifierFields = { individual_uuid: string } & Pick<
  Selectable<IndividualIdentifiers>,
  | 'created_at'
  | 'display_identifier'
  | 'identifier'
  | 'identifier_namespace_id'
  | 'is_unique'
  | 'verified_at'
>;

export function toCanonicalIdentifierDetail(
  dbIdentifier: CoreIdentifierFields,
): CanonicalIdentifier;
export function toCanonicalIdentifierDetail(
  dbIdentifier: CoreIdentifierFields[],
): CanonicalIdentifier[];

export function toCanonicalIdentifierDetail(
  dbIdentifier: CoreIdentifierFields | CoreIdentifierFields[],
): CanonicalIdentifier | CanonicalIdentifier[] {
  if (Array.isArray(dbIdentifier)) {
    return dbIdentifier.map(
      toCanonicalIdentifierDetail as (ident: CoreIdentifierFields) => CanonicalIdentifier,
    );
  }
  const namespace = NamespaceById[dbIdentifier.identifier_namespace_id];
  if (!namespace) {
    throw new Error('The namespace cache must be built before calling toCanonicalIdentifierDetail');
  }
  return {
    identifier_namespace: namespace.name as components['schemas']['IdentifierNamespaces'],
    identifier_namespace_id: namespace.id,
    identifier: dbIdentifier.identifier,
    display_identifier: dbIdentifier.display_identifier || dbIdentifier.identifier,
    is_unique: !!dbIdentifier.is_unique,
  };
}

export function toApiIdentifierDetail(dbIdentifier: CanonicalIdentifier & { created_at?: Date }) {
  if (!dbIdentifier) {
    return dbIdentifier;
  }

  const { identifier, display_identifier, is_unique, identifier_namespace, created_at } =
    dbIdentifier;
  return {
    identifier,
    display_identifier: display_identifier || undefined,
    is_unique: !!is_unique,
    identifier_namespace,
    created_at: created_at?.toISOString(),
  };
}

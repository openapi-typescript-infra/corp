import { ServiceError } from '@openapi-typescript-infra/service';
import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';
import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import { canonicalize } from './namespaces.ts';
import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

export function escapeGroupName(value: string): string;
export function escapeGroupName(value: string[]): string[];

/**
 * Escape a string or string[] name so that it can be used
 * in an ltree expression in postgres.
 */
export function escapeGroupName(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.map((v) => escapeGroupName(v));
  }
  const part1 = value.replace(/\W/gu, (c) => {
    const code = Buffer.from(c, 'utf8').toString('hex');
    return `!${code}`;
  });
  return part1.replace(/_/g, '__').replace(/!/g, '_');
}

function countOnes(c: number) {
  let r = c;
  let ones = 0;

  while (r & 0x80) {
    ones += 1;

    r <<= 1;
  }
  return ones || 1;
}

export function unescapeGroupName(value: string): string;
export function unescapeGroupName(value: string[]): string[];

/**
 * Unescape a string or string[] name that was escaped
 * with escapeGroupName.
 */
export function unescapeGroupName(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.map((v) => unescapeGroupName(v));
  }
  let retVal = '';
  let inEscape = false;
  const { length } = value;
  for (let spot = 0; spot < length; spot += 1) {
    const c = value[spot];
    if (inEscape) {
      if (c === '_') {
        retVal += c;
      } else {
        // First character of UTF8
        spot += 1;
        const firstByte = parseInt(`${c}${value[spot]}`, 16);
        const utf8Length = countOnes(firstByte);
        const activeBuffer = Buffer.alloc(utf8Length);
        activeBuffer[0] = firstByte;
        for (let read = 1; read < utf8Length; read += 1) {
          activeBuffer[read] = parseInt(`${value[spot + 1]}${value[spot + 2]}`, 16);
          spot += 2;
        }
        retVal += activeBuffer.toString('utf8');
      }
      inEscape = false;
    } else if (c === '_') {
      inEscape = true;
    } else {
      retVal += c;
    }
  }
  return retVal;
}

export async function getGroupsForIndividuals(
  app: IdentityInternal['App'],
  individualIdToUuidMap: Record<IndividualId, WithIndividualUuid>,
) {
  const groups = await app.locals.db
    .selectFrom('individual_group_members as M')
    .innerJoin('groups as G', 'G.group_id', 'M.group_id')
    .select([
      'M.individual_id',
      'G.group_uuid',
      'G.fully_qualified_name',
      'G.display_name',
      'M.begins_at',
      'M.ends_at',
    ])
    .where('M.individual_id', 'in', Object.keys(individualIdToUuidMap))
    .where('M.deleted_at', 'is', null)
    .where((eb) =>
      eb.and([
        eb.or([eb('M.ends_at', 'is', null), eb('M.ends_at', '>', sql<Date>`NOW()`)]),
        eb.or([eb('M.begins_at', 'is', null), eb('M.begins_at', '<=', sql<Date>`NOW()`)]),
      ]),
    )
    .execute();

  const result: Record<
    IndividualUuid,
    {
      group_id: string;
      name: string[];
      display_name?: string;
      begins_at?: string;
      ends_at?: string;
    }[]
  > = {};
  for (const group of groups) {
    const uuid = individualIdToUuidMap[group.individual_id].individual_uuid;
    if (!result[uuid]) {
      result[uuid] = [];
    }
    if (!group.fully_qualified_name) continue;
    result[uuid].push({
      group_id: group.group_uuid,
      name: unescapeGroupName(group.fully_qualified_name.split('.')),
      display_name: group.display_name || undefined,
      begins_at: group.begins_at?.toISOString() || undefined,
      ends_at: group.ends_at?.toISOString() || undefined,
    });
  }
  return result;
}

export type ConflictResolution = 'overwrite' | 'expand' | 'new' | 'existing';

export async function createGroup(
  app: IdentityInternal['App'],
  name: string[],
  groupType: string,
  displayName?: string,
) {
  const { db } = app.locals;
  const type = await db
    .selectFrom('group_types')
    .select('group_type_id')
    .where('name', '=', groupType)
    .executeTakeFirst();
  if (!type) {
    throw new ServiceError(app, `Unknown group type: ${groupType}`, {
      status: 400,
    });
  }
  if (!name.length || name.some((segment) => !segment)) {
    throw new ServiceError(app, 'Group name is required', { status: 400 });
  }

  return db.transaction().execute(async (trx) => {
    let parentId: string | null = null;
    let leaf:
      | {
          group_id: string;
          group_uuid: string;
          fully_qualified_name: string | null;
          display_name: string | null;
        }
      | undefined;
    let inserted = false;

    for (const [index, segment] of name.entries()) {
      const existing = await trx
        .selectFrom('groups')
        .select(['group_id', 'group_uuid', 'fully_qualified_name', 'display_name'])
        .where('name', '=', segment)
        .where((eb) =>
          parentId === null
            ? eb('parent_group_id', 'is', null)
            : eb('parent_group_id', '=', parentId),
        )
        .executeTakeFirst();
      if (existing) {
        leaf = existing;
        parentId = existing.group_id;
        continue;
      }

      leaf = await trx
        .insertInto('groups')
        .values({
          group_type_id: type.group_type_id,
          parent_group_id: parentId,
          name: segment,
          display_name: index === name.length - 1 ? displayName : undefined,
        })
        .returning(['group_id', 'group_uuid', 'fully_qualified_name', 'display_name'])
        .executeTakeFirstOrThrow();
      parentId = leaf.group_id;
      inserted = index === name.length - 1;
    }

    if (!leaf) throw new ServiceError(app, 'Group name is required', { status: 400 });
    return { ...leaf, inserted };
  });
}

export async function getGroups(
  app: IdentityInternal['App'],
  components: (string | { query: string })[],
  offset = 0,
  limit = 500,
) {
  const query = components
    .map((c) => {
      if (typeof c === 'string') {
        return escapeGroupName(c);
      }
      if (c.query.includes('.')) {
        throw new ServiceError(app, 'Ltree queries cannot include "."', {
          status: 400,
        });
      }
      return c.query;
    })
    .join('.');

  return app.locals.db
    .selectFrom('groups as G')
    .select([
      'G.group_id',
      'G.group_uuid',
      'G.name',
      'G.fully_qualified_name',
      'G.display_name',
      sql<string>`(SELECT GT.name FROM group_types GT WHERE GT.group_type_id = G.group_type_id)`.as(
        'group_type',
      ),
    ])
    .where('G.fully_qualified_name', '~', query)
    .offset(offset)
    .limit(limit)
    .execute();
}

export async function updateGroupDisplayName(
  app: IdentityInternal['App'],
  name: string[],
  displayName: string,
) {
  const ltreeName = escapeGroupName(name).join('.');
  const result = await app.locals.db
    .updateTable('groups')
    .set({ display_name: displayName })
    .where('fully_qualified_name', '=', ltreeName)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

type GroupIdentifierInput = components['schemas']['GroupIdentifierInput'];
type GroupIdentifier = components['schemas']['GroupIdentifier'];

interface NamespaceDetail {
  id: number;
  name: string;
  unique: boolean;
  type: 'email' | 'phone' | 'opaque' | 'uuid' | 'individual_name';
}

async function getIdentifierNamespaces(app: IdentityInternal['App'], names: string[]) {
  const uniqueNames = [...new Set(names)];
  const rows = await app.locals.db
    .selectFrom('identifier_namespaces')
    .select(['identifier_namespace_id', 'name', 'identifier_namespace_type', 'is_unique'])
    .where('name', 'in', uniqueNames)
    .execute();
  const byName = new Map<string, NamespaceDetail>(
    rows.map((row) => [
      row.name,
      {
        id: row.identifier_namespace_id,
        name: row.name,
        unique: row.is_unique,
        type: row.identifier_namespace_type,
      },
    ]),
  );
  const missing = uniqueNames.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new ServiceError(app, `Unknown identifier namespace(s): ${missing.join(', ')}`, {
      status: 400,
    });
  }
  return byName;
}

export async function getGroupByIdentifier(
  app: IdentityInternal['App'],
  namespaceName: string,
  identifier: string,
) {
  if (namespaceName === 'group_uuid') {
    return (
      (await app.locals.db
        .selectFrom('groups as G')
        .innerJoin('group_types as GT', 'GT.group_type_id', 'G.group_type_id')
        .leftJoin('groups as P', 'P.group_id', 'G.parent_group_id')
        .select([
          'G.group_id',
          'G.group_uuid',
          'P.group_uuid as parent_group_uuid',
          'G.name',
          'G.fully_qualified_name',
          'G.display_name',
          'GT.name as group_type',
        ])
        .where('G.group_uuid', '=', identifier.toLowerCase())
        .executeTakeFirst()) ?? null
    );
  }

  const namespace = await app.locals.db
    .selectFrom('identifier_namespaces')
    .select(['identifier_namespace_id', 'identifier_namespace_type'])
    .where('name', '=', namespaceName)
    .executeTakeFirst();
  if (!namespace) return null;

  const canonical = canonicalize(identifier, { type: namespace.identifier_namespace_type });
  return (
    (await app.locals.db
      .selectFrom('group_identifiers as gi')
      .innerJoin('groups as G', 'G.group_id', 'gi.group_id')
      .innerJoin('group_types as GT', 'GT.group_type_id', 'G.group_type_id')
      .leftJoin('groups as P', 'P.group_id', 'G.parent_group_id')
      .select([
        'G.group_id',
        'G.group_uuid',
        'P.group_uuid as parent_group_uuid',
        'G.name',
        'G.fully_qualified_name',
        'G.display_name',
        'GT.name as group_type',
      ])
      .where('gi.identifier_namespace_id', '=', namespace.identifier_namespace_id)
      .where('gi.identifier', '=', canonical)
      .where('gi.released_at', 'is', null)
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export type GroupSummary = {
  group_uuid: string;
  name: string;
  fully_qualified_name: string | null;
  display_name: string | null;
  group_type: string;
};

export async function getGroupHierarchy(
  app: IdentityInternal['App'],
  groupInternalId: string,
  options: { parents?: boolean; children?: boolean },
): Promise<{ parents: GroupSummary[]; children: GroupSummary[] }> {
  if (!options.parents && !options.children) return { parents: [], children: [] };

  const target = app.locals.db
    .selectFrom('groups')
    .select('fully_qualified_name')
    .where('group_id', '=', groupInternalId);
  const fetchRelated = (direction: 'parents' | 'children') => {
    let query = app.locals.db
      .selectFrom('groups as g')
      .innerJoin('group_types as gt', 'gt.group_type_id', 'g.group_type_id')
      .select([
        'g.group_uuid',
        'g.name',
        'g.fully_qualified_name',
        'g.display_name',
        'gt.name as group_type',
      ])
      .where('g.group_id', '!=', groupInternalId)
      .where(
        direction === 'parents'
          ? sql<boolean>`g.fully_qualified_name @> (${target})`
          : sql<boolean>`g.fully_qualified_name <@ (${target})`,
      );
    query = query.orderBy(sql<number>`nlevel(g.fully_qualified_name)`, 'asc');
    return query.execute();
  };

  const [parents, children] = await Promise.all([
    options.parents ? fetchRelated('parents') : Promise.resolve([]),
    options.children ? fetchRelated('children') : Promise.resolve([]),
  ]);
  return { parents, children };
}

export async function updateGroupByInternalId(
  app: IdentityInternal['App'],
  groupInternalId: string,
  updates: {
    name?: string;
    displayName?: string;
    groupType?: string;
    parentGroupUuid?: string | null;
  },
) {
  if (updates.name === '') {
    throw new ServiceError(app, 'Group name is required', { status: 400 });
  }

  const values: {
    name?: string;
    display_name?: string;
    group_type_id?: number;
    parent_group_id?: string | null;
  } = {};
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.displayName !== undefined) values.display_name = updates.displayName;

  if (updates.groupType !== undefined) {
    const type = await app.locals.db
      .selectFrom('group_types')
      .select('group_type_id')
      .where('name', '=', updates.groupType)
      .executeTakeFirst();
    if (!type) {
      throw new ServiceError(app, `Unknown group type: ${updates.groupType}`, { status: 400 });
    }
    values.group_type_id = type.group_type_id;
  }

  if (updates.parentGroupUuid !== undefined) {
    if (updates.parentGroupUuid === null) {
      values.parent_group_id = null;
    } else {
      const parent = await app.locals.db
        .selectFrom('groups')
        .select('group_id')
        .where('group_uuid', '=', updates.parentGroupUuid)
        .executeTakeFirst();
      if (!parent) {
        throw new ServiceError(app, `Parent group ${updates.parentGroupUuid} not found`, {
          status: 404,
        });
      }
      values.parent_group_id = parent.group_id;
    }
  }

  try {
    await app.locals.db
      .updateTable('groups')
      .set(values)
      .where('group_id', '=', groupInternalId)
      .execute();
  } catch (error) {
    const databaseError = error as Error & { code?: string };
    if (databaseError.code === '23505' || databaseError.message.includes('Cannot move group')) {
      throw new ServiceError(app, databaseError.message, { status: 409 });
    }
    throw error;
  }

  return app.locals.db
    .selectFrom('groups as G')
    .innerJoin('group_types as GT', 'GT.group_type_id', 'G.group_type_id')
    .leftJoin('groups as P', 'P.group_id', 'G.parent_group_id')
    .select([
      'G.group_id',
      'G.group_uuid',
      'P.group_uuid as parent_group_uuid',
      'G.name',
      'G.fully_qualified_name',
      'G.display_name',
      'GT.name as group_type',
    ])
    .where('G.group_id', '=', groupInternalId)
    .executeTakeFirstOrThrow();
}

export async function addGroupIdentifiers(
  app: IdentityInternal['App'],
  groupInternalId: string,
  identifiers: GroupIdentifierInput[],
) {
  if (!identifiers.length) return;
  const namespaces = await getIdentifierNamespaces(
    app,
    identifiers.map((identifier) => identifier.namespace),
  );

  for (const input of identifiers) {
    const namespace = namespaces.get(input.namespace);
    if (!namespace) continue;
    const canonical = canonicalize(input.identifier, { type: namespace.type });
    const existing = await app.locals.db
      .selectFrom('group_identifiers')
      .select('group_identifier_id')
      .where('group_id', '=', groupInternalId)
      .where('identifier_namespace_id', '=', namespace.id)
      .where('identifier', '=', canonical)
      .where('released_at', 'is', null)
      .executeTakeFirst();
    if (existing) continue;

    try {
      await app.locals.db
        .insertInto('group_identifiers')
        .values({
          group_id: groupInternalId,
          identifier_namespace_id: namespace.id,
          identifier: canonical,
          display_identifier: input.display_identifier ?? input.identifier,
          is_unique: input.is_unique ?? namespace.unique,
        })
        .execute();
    } catch (error) {
      const databaseError = error as Error & { code?: string };
      if (databaseError.code === '23505') {
        throw new ServiceError(app, databaseError.message, { status: 409 });
      }
      throw error;
    }
  }
}

export async function getIdentifiersForGroups(
  app: IdentityInternal['App'],
  groupIdToUuidMap: Record<string, { group_uuid: string }>,
  namespaceNames?: string[],
): Promise<Record<string, GroupIdentifier[]>> {
  const groupIds = Object.keys(groupIdToUuidMap);
  if (!groupIds.length || !namespaceNames?.length) return {};

  let query = app.locals.db
    .selectFrom('group_identifiers as gi')
    .innerJoin(
      'identifier_namespaces as ns',
      'ns.identifier_namespace_id',
      'gi.identifier_namespace_id',
    )
    .select([
      'gi.group_id',
      'gi.identifier',
      'gi.display_identifier',
      'gi.is_unique',
      'gi.created_at',
      'ns.name as identifier_namespace',
    ])
    .where('gi.group_id', 'in', groupIds)
    .where('gi.released_at', 'is', null)
    .where('gi.deleted_at', 'is', null);
  if (!namespaceNames.includes('*')) {
    query = query.where('ns.name', 'in', namespaceNames);
  }

  const rows = await query.execute();
  const result: Record<string, GroupIdentifier[]> = {};
  for (const row of rows) {
    const groupUuid = groupIdToUuidMap[row.group_id].group_uuid;
    result[groupUuid] ??= [];
    result[groupUuid].push({
      identifier: row.identifier,
      identifier_namespace: row.identifier_namespace,
      display_identifier: row.display_identifier ?? undefined,
      is_unique: Boolean(row.is_unique),
      created_at: row.created_at.toISOString(),
    });
  }
  return result;
}

export async function addMemberToGroup(
  app: IdentityInternal['App'],
  name: string[],
  individualId: IndividualId,
  conflictResolution: ConflictResolution | undefined,
  beginsAt?: Date,
  endsAt?: Date,
) {
  const groupName = escapeGroupName(name).join('.');
  const { db } = app.locals;

  let query: RawBuilder<{
    action: 'inserted' | 'updated' | 'existing';
    individual_group_member_id: string;
    begins_at?: Date;
    ends_at?: Date;
  }>;

  switch (conflictResolution) {
    case 'existing':
      query = sql`
      WITH group_cte AS (
        SELECT group_id FROM groups WHERE fully_qualified_name = ${groupName}
      ),
      lock AS (
        SELECT pg_advisory_xact_lock(${individualId}::bigint)
        FROM group_cte
      ),
      existing_cte AS (
        SELECT 'existing' as action, individual_group_member_id, begins_at, ends_at
        FROM individual_group_members gm
        WHERE gm.individual_id = ${individualId}
        AND gm.group_id = (SELECT group_id FROM group_cte)
        AND (gm.ends_at IS NULL OR gm.ends_at > NOW())
        AND (gm.begins_at IS NULL OR gm.begins_at <= NOW())
        AND gm.deleted_at IS NULL
      ),
      to_insert AS (
        SELECT ${individualId}::bigint as individual_id, group_id
        FROM group_cte
        WHERE NOT EXISTS (SELECT 1 FROM existing_cte)
      ),
      insert_cte AS (
        INSERT INTO individual_group_members (individual_id, group_id, begins_at, ends_at)
        SELECT individual_id, group_id, ${beginsAt}, ${endsAt} FROM to_insert
        RETURNING 'inserted' as action, individual_group_member_id, begins_at, ends_at
      )

      SELECT action, individual_group_member_id, begins_at, ends_at FROM insert_cte
      UNION ALL
      SELECT action, individual_group_member_id, begins_at, ends_at FROM existing_cte;
      `;
      break;
    case 'expand':
      query = sql`
      WITH group_cte AS (
        SELECT group_id, ${beginsAt}::timestamp as _begins_at, ${endsAt}::timestamp as _ends_at
        FROM groups WHERE fully_qualified_name = ${groupName}
      ),
      lock AS (
        SELECT pg_advisory_xact_lock(${individualId}::bigint)
        FROM group_cte
      ),
      update_cte AS (
        UPDATE individual_group_members
        SET
        begins_at = CASE WHEN group_cte._begins_at IS NULL THEN NULL ELSE
          LEAST(COALESCE(begins_at, group_cte._begins_at), group_cte._begins_at) END,
        ends_at = CASE WHEN group_cte._ends_at IS NULL THEN NULL ELSE
          GREATEST(COALESCE(ends_at, group_cte._ends_at), group_cte._ends_at) END
        FROM group_cte
        WHERE individual_id = ${individualId}
        AND deleted_at IS NULL
        RETURNING 'updated' as action, individual_group_member_id, begins_at, ends_at
      ),
      to_insert AS (
        SELECT ${individualId}::bigint AS individual_id, group_cte.group_id
        FROM group_cte
        WHERE NOT EXISTS (SELECT 1 FROM update_cte)
      ),
      insert_cte AS (
        INSERT INTO individual_group_members (individual_id, group_id, begins_at, ends_at)
        SELECT individual_id, group_id, ${beginsAt}::timestamp, ${endsAt}::timestamp
        FROM to_insert
        RETURNING 'inserted' as action, individual_group_member_id, begins_at, ends_at
      )

      SELECT action, individual_group_member_id, begins_at, ends_at FROM insert_cte
      UNION ALL
      SELECT action, individual_group_member_id, begins_at, ends_at FROM update_cte;
      `;
      break;
    case 'overwrite':
    case undefined:
      query = sql`
      WITH group_cte AS (
        SELECT group_id FROM groups WHERE fully_qualified_name = ${groupName}
      ),
      lock AS (
        SELECT pg_advisory_xact_lock(${individualId}::bigint)
        FROM group_cte
      ),
      update_cte AS (
        UPDATE individual_group_members
        SET begins_at = ${beginsAt}, ends_at = ${endsAt}
        WHERE individual_id = ${individualId} AND group_id = (SELECT group_id FROM group_cte)
        AND deleted_at IS NULL
        RETURNING individual_group_member_id, begins_at, ends_at
      ),
      to_insert AS (
        SELECT ${individualId}::bigint AS individual_id, group_cte.group_id
        FROM group_cte
        WHERE NOT EXISTS (SELECT 1 FROM update_cte)
      ),
      insert_cte AS (
        INSERT INTO individual_group_members (individual_id, group_id, begins_at, ends_at)
        SELECT individual_id, group_id, ${beginsAt}, ${endsAt}
        FROM to_insert
        RETURNING individual_group_member_id, begins_at, ends_at
      )

      SELECT individual_group_member_id, begins_at, ends_at FROM insert_cte
      UNION ALL
      SELECT individual_group_member_id, begins_at, ends_at FROM update_cte;
      `;
      break;
    case 'new':
      query = sql`
        INSERT INTO individual_group_members (individual_id, group_id, begins_at, ends_at)
        SELECT ${individualId}, group_id, ${beginsAt}, ${endsAt}
        FROM groups WHERE fully_qualified_name = ${groupName}
        RETURNING individual_group_member_id, begins_at, ends_at;
        `;
      break;
  }

  const result = await db.transaction().execute(async (trx) => query.execute(trx));
  if (result.rows.length === 0) {
    throw new ServiceError(app, 'Group not found', { status: 404 });
  }
  return result.rows[0];
}

export async function removeGroupMember(
  app: IdentityInternal['App'],
  name: string[],
  individualId: IndividualId,
) {
  await app.locals.db
    .updateTable('individual_group_members')
    .from('individual_group_members as M')
    .innerJoin('groups as G', 'G.group_id', 'M.group_id')
    .set({ deleted_at: sql`NOW()` })
    .where('M.individual_id', '=', individualId)
    .where('G.fully_qualified_name', '=', escapeGroupName(name).join('.'))
    .where('M.deleted_at', 'is', null)
    .execute();
}

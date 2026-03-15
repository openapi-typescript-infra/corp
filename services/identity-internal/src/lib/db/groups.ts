import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';
import { ServiceError } from '@openapi-typescript-infra/service';

import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

import type { IdentityInternal } from '#src/types/index.ts';

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
    .select(['M.individual_id', 'G.name', 'G.display_name', 'M.begins_at', 'M.ends_at'])
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
    result[uuid].push({
      group_id: group.name,
      name: unescapeGroupName(group.name.split('.')),
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
  const ltreeName = escapeGroupName(name).join('.');
  const group = await sql`
  WITH existing as (
    SELECT group_id, name, display_name
    FROM groups G
    WHERE G.name = ${ltreeName}
  ), requested_group_type AS (
    SELECT group_type_id
    FROM group_types
    WHERE name = ${groupType}
  ), inserted as (
    INSERT INTO groups (group_type_id, name, display_name)
      SELECT requested_group_type.group_type_id, ${ltreeName}, ${displayName}
      FROM requested_group_type
      WHERE NOT EXISTS (SELECT 1 from existing)
      RETURNING group_id, name, display_name, true as inserted
  )
  SELECT group_id, name, display_name, true as inserted FROM inserted
  UNION ALL
  SELECT group_id, name, display_name, false as inserted FROM existing
  `.execute(db);

  if (!group.rows[0]) {
    throw new ServiceError(app, `Unknown group type: ${groupType}`, {
      status: 400,
    });
  }

  return group.rows[0] as {
    inserted: boolean;
    group_id: string;
    name: string;
    display_name: string;
  };
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
      'G.name',
      'G.display_name',
      sql<string>`(SELECT GT.name FROM group_types GT WHERE GT.group_type_id = G.group_type_id)`.as(
        'group_type',
      ),
    ])
    .where('G.name', '~', query)
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
    .where('name', '=', ltreeName)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
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
        SELECT group_id FROM groups WHERE name = ${groupName}
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
        FROM groups WHERE name = ${groupName}
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
        SELECT group_id FROM groups WHERE name = ${groupName}
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
        FROM groups WHERE name = ${groupName}
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
    .where('G.name', '=', escapeGroupName(name).join('.'))
    .where('M.deleted_at', 'is', null)
    .execute();
}

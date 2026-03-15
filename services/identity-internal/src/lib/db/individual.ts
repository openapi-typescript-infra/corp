import { sql } from 'kysely';
import { format, parse, parseISO } from 'date-fns';
import { ServiceError } from '@openapi-typescript-infra/service';
import type { NotNull, Selectable } from 'kysely';

import type { CanonicalIdentifier } from './namespaces.ts';
import {
  resolveNamespaceIds,
  resolveNamespaces,
  toCanonicalIdentifierDetail,
  toDatabaseIdentifierDetail,
} from './namespaces.ts';
import type { IndividualUuid, IndividualId, WithIndividualUuid } from './types.ts';

import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import type { BiologicalSexEnum, Individuals } from '#src/generated/database.ts';

function getNewIndividualQuery(db: IdentityInternal['App']['locals']['db'], uuid?: string) {
  const baseQuery = db.insertInto('individuals');
  if (uuid) {
    return baseQuery.values({ individual_uuid: uuid });
  }
  return baseQuery.expression(sql`default values`);
}

export async function getIndividualUuidForId(
  app: IdentityInternal['App'],
  individualId: IndividualId,
) {
  const individual = await app.locals.db
    .selectFrom('individuals')
    .select(['individual_uuid'])
    .where('individual_id', '=', individualId)
    .executeTakeFirst();

  return individual?.individual_uuid;
}

export async function assignIdentifiers(
  app: IdentityInternal['App'],
  uuid: string | undefined,
  identifiers: components['schemas']['IdentifierInput'][],
) {
  // Deduplicate identifiers by namespace+identifier combo
  const seen = new Map<string, components['schemas']['IdentifierInput']>();
  for (const id of identifiers) {
    const key = `${id.namespace}:${id.identifier}`;
    if (!seen.has(key)) {
      seen.set(key, id);
    }
  }
  const uniqueIdentifiers = [...seen.values()];

  const { db } = app.locals;
  const dbIdentifiers = await toDatabaseIdentifierDetail(app, uniqueIdentifiers);

  const result = await sql<{
    individual: {
      error: string;
      individual_id: string;
      individual_uuid: string;
      created_at: string;
    };
  }>`
    SELECT row_to_json(
      upsert_identifiers(
       ${uuid}::uuid, ${JSON.stringify(dbIdentifiers)}
      )
    ) as individual;
  `.execute(db);
  const { individual } = result.rows[0];

  const { error, ...rest } = individual;
  if (error) {
    throw Object.assign(new ServiceError(app, error, { status: 409 }), rest);
  }

  return {
    individual_id: String(individual.individual_id),
    individual_uuid: individual.individual_uuid,
    // Because of the proc, Kysely doesn't know it's a date
    created_at: parseISO(individual.created_at),
  };
}

export async function updateIndividualByUuid(
  app: IdentityInternal['App'],
  uuid: IndividualUuid,
  birthdate?: string | null,
  biologicalSex?: string | null,
) {
  const fields: {
    birthdate?: Date | null;
    biological_sex?: BiologicalSexEnum | null;
  } = {};
  if (birthdate !== undefined) {
    fields.birthdate = birthdate ? parse(birthdate, 'yyyy-MM-dd', new Date()) : null;
  }
  if (biologicalSex !== undefined) {
    fields.biological_sex = biologicalSex ? (biologicalSex as BiologicalSexEnum) : null;
  }
  await app.locals.db
    .updateTable('individuals')
    .set(fields)
    .where('individual_uuid', '=', uuid)
    .execute();
  return fields;
}

async function createIndividualInDb(
  app: IdentityInternal['App'],
  uuid?: string | undefined,
  identifiers?: components['schemas']['IdentifierInput'][],
) {
  const { db } = app.locals;

  if (!identifiers?.length) {
    // Just want a raw account, let's give them one
    const individual = await getNewIndividualQuery(db, uuid)
      .returning(['individual_id', 'individual_uuid', 'created_at'])
      .executeTakeFirstOrThrow();
    return individual;
  }

  return assignIdentifiers(app, uuid, identifiers);
}

export async function createIndividual(
  app: IdentityInternal['App'],
  uuid?: string | undefined,
  identifiers?: components['schemas']['IdentifierInput'][],
) {
  return createIndividualInDb(app, uuid, identifiers);
}

export async function getIndividualByUuid(app: IdentityInternal['App'], uuid: IndividualUuid) {
  const individual = await app.locals.db
    .selectFrom('individuals')
    .select(['individual_id', 'individual_uuid', 'created_at', 'biological_sex', 'birthdate'])
    .where('individual_uuid', '=', uuid)
    .executeTakeFirst();

  return individual;
}

export async function getIndividualsByIdentifier(
  app: IdentityInternal['App'],
  canonical: CanonicalIdentifier,
  throwOnDeleted?: boolean,
) {
  const identifierIsIndividualUuid =
    canonical.identifier_namespace_id === 0 || canonical.identifier_namespace === 'individual-uuid';

  let individuals: (Pick<
    Selectable<Individuals>,
    'birthdate' | 'created_at' | 'individual_id' | 'individual_uuid' | 'biological_sex'
  > & {
    deleted_at?: Date | null;
    tags: string[];
  })[];

  if (identifierIsIndividualUuid) {
    individuals = await app.locals.db
      .selectFrom('individuals as I')
      .leftJoin('individual_tags as tags', (join) =>
        join.onRef('tags.individual_id', '=', 'I.individual_id').on('tags.deleted_at', 'is', null),
      )
      .select([
        'I.individual_uuid',
        'I.individual_id',
        'I.created_at',
        'I.biological_sex',
        'I.birthdate',
        sql<string[]>`array_agg(tags.value)`.as('tags'),
      ])
      .where('I.individual_uuid', '=', canonical.identifier)
      .groupBy([
        'I.individual_uuid',
        'I.individual_id',
        'I.created_at',
        'I.biological_sex',
        'I.birthdate',
      ])
      .$narrowType<{ created_at: NotNull; individual_id: NotNull }>()
      .execute();
  } else {
    individuals = await app.locals.db
      .selectFrom('individual_identifiers as ID')
      .innerJoin('individuals as I', 'ID.individual_id', 'I.individual_id')
      .leftJoin('individual_tags as tags', (join) =>
        join.onRef('tags.individual_id', '=', 'ID.individual_id').on('tags.deleted_at', 'is', null),
      )
      .select([
        'I.individual_uuid',
        'I.individual_id',
        'ID.created_at',
        'ID.deleted_at',
        'I.biological_sex',
        'I.birthdate',
        sql<string[]>`array_agg(tags.value)`.as('tags'),
      ])
      .where('identifier_namespace_id', '=', canonical.identifier_namespace_id)
      .where('identifier', '=', canonical.identifier)
      .where('released_at', 'is', null)
      // IS TRUE and = true are not the same for index usage
      .where('is_unique', 'is', canonical.is_unique)
      .groupBy([
        'I.individual_uuid',
        'I.individual_id',
        'ID.created_at',
        'ID.deleted_at',
        'I.biological_sex',
        'I.birthdate',
      ])
      .execute();
  }

  return individuals.filter((individual): boolean => {
    if (individual.tags.includes('account-deleted') || individual.deleted_at) {
      if (throwOnDeleted) {
        throw new ServiceError(app, 'Account Deleted', {
          status: 410,
          code: 'GONE',
        });
      } else {
        return false;
      }
    }

    return true;
  });
}

export async function getIdentifiersForIndividual(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  identifierNamespaces: components['schemas']['IdentifierNamespaces'][],
) {
  const namespaces = await resolveNamespaces(app, identifierNamespaces);

  return app.locals.db
    .selectFrom('individual_identifiers as ID')
    .select([
      'ID.individual_id',
      'ID.display_identifier',
      'ID.identifier_namespace_id',
      'ID.identifier',
      'ID.created_at',
      'ID.is_unique',
      'ID.verified_at',
    ])
    .where('ID.individual_id', '=', individualId)
    .where('ID.deleted_at', 'is', null)
    .where(
      'ID.identifier_namespace_id',
      'in',
      namespaces.map((n) => n.id),
    )
    .orderBy('ID.created_at', 'desc')
    .execute();
}

export async function getIdentifiersForIndividualByUuid(
  app: IdentityInternal['App'],
  individualUuid: IndividualUuid,
  identifierNamespaces: components['schemas']['IdentifierNamespaces'][],
) {
  const namespaces = await resolveNamespaces(app, identifierNamespaces);

  return app.locals.db
    .selectFrom('individual_identifiers as ID')
    .innerJoin('individuals as I', 'ID.individual_id', 'I.individual_id')
    .select([
      'ID.individual_id',
      'ID.display_identifier',
      'ID.identifier_namespace_id',
      'ID.identifier',
      'ID.created_at',
      'ID.is_unique',
      'ID.verified_at',
    ])
    .where('I.individual_uuid', '=', individualUuid)
    .where('ID.deleted_at', 'is', null)
    .where(
      'ID.identifier_namespace_id',
      'in',
      namespaces.map((n) => n.id),
    )
    .orderBy('ID.created_at', 'desc')
    .execute();
}

/**
 * For a given set of individuals, get all the matching identifiers by namespaces (or * for all namespaces).
 * The individualUuidMap must map individual_id to individual_uuid so we can unmap them on the way back.
 */
export async function getIdentifiersForIndividuals(
  app: IdentityInternal['App'],
  individualUuidMap: Record<IndividualId, WithIndividualUuid>,
  identifierNamespaces: string[],
): Promise<Record<IndividualUuid, CanonicalIdentifier[]>> {
  const isAll = identifierNamespaces.includes('all');
  let query = app.locals.db
    .selectFrom('individual_identifiers as ID')
    .select([
      'ID.individual_id',
      'ID.display_identifier',
      'ID.identifier_namespace_id',
      'ID.identifier',
      'ID.created_at',
      'ID.is_unique',
      'ID.verified_at',
    ])
    .where('ID.individual_id', 'in', Object.keys(individualUuidMap))
    .where('ID.deleted_at', 'is', null);
  if (!isAll) {
    query = query
      .innerJoin(
        'identifier_namespaces as N',
        'ID.identifier_namespace_id',
        'N.identifier_namespace_id',
      )
      .where('N.name', 'in', identifierNamespaces);
  }

  const rows = await query.orderBy('ID.created_at', 'desc').execute();
  const byIndividualId: Record<IndividualUuid, CanonicalIdentifier[]> = {};
  await resolveNamespaceIds(
    app,
    rows.map((r) => r.identifier_namespace_id),
  );
  rows.forEach((row) => {
    const uuid = individualUuidMap[row.individual_id].individual_uuid;
    if (!uuid) {
      app.locals.logger.warn('Missing individual_uuid for individual_id in mapping');
      return;
    }
    byIndividualId[uuid] = byIndividualId[uuid] || [];
    byIndividualId[uuid].push(
      toCanonicalIdentifierDetail({
        individual_uuid: uuid,
        ...row,
      }),
    );
  });
  return byIndividualId;
}

export function mapIndividualIdToUuid<T extends { individual_id: IndividualId }>(
  idMap: Record<IndividualId, WithIndividualUuid>,
  rows: T[],
): (Omit<T, 'individual_id'> & { individual_uuid: IndividualUuid })[] {
  return rows.map((row) => {
    const { individual_id, ...rest } = row;
    return {
      individual_uuid: idMap[individual_id].individual_uuid,
      ...rest,
    };
  });
}

export function toIndividualIdMap<
  T extends { individual_id: IndividualId; individual_uuid: IndividualUuid },
>(rows: T[]): Record<IndividualId, T> {
  return rows.reduce<Record<IndividualId, T>>((acc, item) => {
    acc[item.individual_id] = item;
    return acc;
  }, {});
}

export function toBirthdate(birthdate: Date | null | undefined) {
  return birthdate ? format(birthdate, 'yyyy-MM-dd') : undefined;
}

export function toBiologicalSex(bioSex: string | null | undefined) {
  return bioSex ? (bioSex as BiologicalSexEnum) : undefined;
}

export async function resolveIdentifier(
  app: IdentityInternal['App'],
  identifier: string,
  namespace: components['schemas']['IdentifierNamespaces'],
) {
  if (namespace === 'individual-uuid') {
    const single = await getIndividualByUuid(app, identifier);
    return {
      individuals: single ? [single] : [],
      is_unique: true,
    };
  }

  const [canonical] = await toDatabaseIdentifierDetail(app, [{ identifier, namespace }]);
  const individuals = await getIndividualsByIdentifier(app, canonical);
  return {
    individuals,
    is_unique: canonical.is_unique,
  };
}

export async function resolveIdentifierToSingleIndividual(
  app: IdentityInternal['App'],
  identifier: string,
  namespace: components['schemas']['IdentifierNamespaces'],
) {
  const { individuals } = await resolveIdentifier(app, identifier, namespace);

  if (individuals.length === 0) {
    throw new ServiceError(app, 'No matching individual found', {
      status: 404,
      expected_error: true,
    });
  }

  if (individuals.length > 1) {
    throw new ServiceError(app, 'Multiple matching individuals found', {
      status: 409,
      expected_error: true,
    });
  }

  return individuals[0];
}

export async function getIndividualsByUuid(app: IdentityInternal['App'], uuids: IndividualUuid[]) {
  return app.locals.db
    .selectFrom('individuals')
    .selectAll()
    .where('individual_uuid', 'in', uuids)
    .execute();
}

export async function releaseIdentifier(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  identifierNamespaceId: number,
  identifier: string,
  deleteIdentifier: boolean,
) {
  const now = new Date();
  return app.locals.db
    .updateTable('individual_identifiers')
    .set(() =>
      deleteIdentifier
        ? {
            deleted_at: now,
            released_at: now,
          }
        : {
            released_at: now,
          },
    )
    .where('individual_id', '=', individualId)
    .where('identifier_namespace_id', '=', identifierNamespaceId)
    .where('identifier', '=', identifier)
    .execute();
}

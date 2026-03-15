import { sql } from 'kysely';

import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

import type { IdentityInternal } from '#src/types/index.ts';
import type { components } from '#src/generated/service/index.ts';

async function getMostRecentForIndividuals(
  app: IdentityInternal['App'],
  individualIds: IndividualId[],
  consents: components['schemas']['ConsentTypes'][],
  scope?: string,
) {
  return app.locals.db
    .with('RankedConsents', (db) =>
      db
        .selectFrom('individual_consents as ic')
        .innerJoin('consent_versions as cv', 'ic.consent_version_id', 'cv.consent_version_id')
        .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
        .select([
          'ic.individual_id',
          'ct.name as type',
          'cv.consent_type_id',
          'cv.name as version',
          'ic.is_granted',
          'ic.evidence',
          'ic.detail',
          'ic.created_at',
          sql`ROW_NUMBER() OVER (PARTITION BY ic.individual_id, cv.consent_type_id ORDER BY ic.created_at DESC)`.as(
            'rn',
          ),
        ])
        .where('ic.consent_scope', scope ? '=' : 'is', scope || null)
        .where('ct.name', 'in', consents)
        .where('ic.individual_id', 'in', individualIds),
    )
    .selectFrom('RankedConsents')
    .selectAll()
    .where('rn', '=', 1)
    .execute();
}

export async function getConsentsForIndividuals(
  app: IdentityInternal['App'],
  individualIdToUuidMap: Record<IndividualId, WithIndividualUuid>,
  consents: components['schemas']['ConsentTypes'][],
  scope?: string,
) {
  const mostRecent = await getMostRecentForIndividuals(
    app,
    Object.keys(individualIdToUuidMap),
    consents,
    scope,
  );
  const result: Record<
    IndividualUuid,
    {
      granted: boolean;
      type: string;
      version: string;
      created_at: string;
      detail?: Record<string, unknown>;
      evidence?: Record<string, unknown>;
      scope?: string;
    }[]
  > = {};
  mostRecent.forEach((row) => {
    const { individual_id } = row;
    const uuid = individualIdToUuidMap[individual_id].individual_uuid;
    result[uuid] = result[uuid] || [];
    result[uuid].push({
      granted: row.is_granted,
      type: row.type as components['schemas']['ConsentTypes'],
      version: row.version,
      created_at: row.created_at.toISOString(),
      detail: (row.detail as unknown as Record<string, unknown>) || undefined,
      evidence: (row.evidence as unknown as Record<string, unknown>) || undefined,
      scope,
    });
  });
  return result;
}

interface ConsentInput {
  type: string;
  version: string;
  granted: boolean;
  scope?: string | null;
  evidence?: Record<string, unknown>;
  detail?: Record<string, unknown>;
}

export async function saveConsents(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  consents: ConsentInput[],
) {
  if (consents.length === 0) {
    return;
  }

  const { db } = app.locals;

  // Determine the scope (all consents in a batch must share the same scope)
  const scope = consents[0].scope || null;

  // Resolve consent type IDs
  const typeNames = [...new Set(consents.map((c) => c.type))];
  const consentTypes = await db
    .selectFrom('consent_types')
    .select(['consent_type_id', 'name'])
    .where('name', 'in', typeNames)
    .execute();
  const typeMap: Record<string, number> = {};
  for (const ct of consentTypes) {
    typeMap[ct.name] = ct.consent_type_id;
  }

  // Resolve consent version IDs, creating missing versions lazily
  const versionKeys = consents.map((c) => ({
    type: c.type,
    version: c.version,
  }));
  const uniqueVersionKeys = versionKeys.filter(
    (v, i, arr) => arr.findIndex((a) => a.type === v.type && a.version === v.version) === i,
  );

  const existingVersions = await db
    .selectFrom('consent_versions as cv')
    .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
    .select(['cv.consent_version_id', 'ct.name as type', 'cv.name as version'])
    .where(
      'ct.name',
      'in',
      uniqueVersionKeys.map((v) => v.type),
    )
    .execute();

  const versionMap: Record<string, number> = {};
  for (const v of existingVersions) {
    versionMap[`${v.type}:${v.version}`] = v.consent_version_id;
  }

  // Create any missing versions
  for (const vk of uniqueVersionKeys) {
    const key = `${vk.type}:${vk.version}`;
    if (!versionMap[key] && typeMap[vk.type]) {
      const created = await db
        .insertInto('consent_versions')
        .values({
          consent_type_id: typeMap[vk.type],
          name: vk.version,
        })
        .returning('consent_version_id')
        .executeTakeFirstOrThrow();
      versionMap[key] = created.consent_version_id;
    }
  }

  // Get existing consents for this individual to filter out unchanged ones
  const existing = await db
    .selectFrom('individual_consents as ic')
    .innerJoin('consent_versions as cv', 'ic.consent_version_id', 'cv.consent_version_id')
    .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
    .select(['ct.name as type', 'cv.name as version', 'ic.is_granted'])
    .where('ic.individual_id', '=', individualId)
    .where('ic.consent_scope', scope ? '=' : 'is', scope)
    .execute();

  const existingSet = new Set(existing.map((e) => `${e.type}:${e.version}:${e.is_granted}`));

  const newConsents = consents.filter((c) => {
    const key = `${c.type}:${c.version}:${c.granted}`;
    return !existingSet.has(key);
  });

  if (newConsents.length === 0) {
    return;
  }

  await db
    .insertInto('individual_consents')
    .values(
      newConsents.map((c) => ({
        consent_version_id: versionMap[`${c.type}:${c.version}`],
        individual_id: individualId,
        is_granted: c.granted,
        consent_scope: scope,
        detail: c.detail ? JSON.stringify(c.detail) : null,
        evidence: c.evidence ? JSON.stringify(c.evidence) : null,
      })),
    )
    .execute();
}

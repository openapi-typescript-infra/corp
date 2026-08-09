import { ServiceError } from '@openapi-typescript-infra/service';
import { sql } from 'kysely';
import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import type { IndividualId } from './types.ts';

type ConsentInput = components['schemas']['IndividualConsent'];

export async function getConsentsForGroup(
  app: IdentityInternal['App'],
  groupId: string,
  consents: components['schemas']['ConsentTypes'][],
  scope?: string,
) {
  if (!consents.length) return [];

  const rows = await app.locals.db
    .with('RankedConsents', (db) =>
      db
        .selectFrom('group_consents as gc')
        .innerJoin('consent_versions as cv', 'gc.consent_version_id', 'cv.consent_version_id')
        .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
        .innerJoin('individuals as actor', 'gc.actor_individual_id', 'actor.individual_id')
        .select([
          'ct.name as type',
          'cv.consent_type_id',
          'cv.name as version',
          'gc.is_granted',
          'gc.evidence',
          'gc.detail',
          'gc.created_at',
          'actor.individual_uuid as actor_individual_uuid',
          sql<number>`ROW_NUMBER() OVER (
            PARTITION BY cv.consent_type_id
            ORDER BY gc.created_at DESC, gc.group_consent_id DESC
          )`.as('rn'),
        ])
        .where('gc.group_id', '=', groupId)
        .where('gc.consent_scope', scope ? '=' : 'is', scope || null)
        .where('ct.name', 'in', consents),
    )
    .selectFrom('RankedConsents')
    .selectAll()
    .where('rn', '=', 1)
    .execute();

  return rows.map((row) => ({
    type: row.type as components['schemas']['ConsentTypes'],
    version: row.version,
    granted: row.is_granted,
    scope,
    evidence: (row.evidence as Record<string, unknown> | null) || undefined,
    detail: (row.detail as Record<string, unknown> | null) || undefined,
    actor_individual_uuid: row.actor_individual_uuid,
    created_at: row.created_at.toISOString(),
  }));
}

export async function saveGroupConsents(
  app: IdentityInternal['App'],
  groupId: string,
  actorIndividualId: IndividualId,
  consents: ConsentInput[],
) {
  if (!consents.length) return;

  const { db } = app.locals;
  const scope = consents[0].scope || null;
  if (consents.some((consent) => (consent.scope || null) !== scope)) {
    throw new ServiceError(app, 'All consents in a request must use the same scope', {
      status: 400,
    });
  }
  const typeNames = [...new Set(consents.map((consent) => consent.type))];
  const consentTypes = await db
    .selectFrom('consent_types')
    .select(['consent_type_id', 'name'])
    .where('name', 'in', typeNames)
    .execute();
  const typeMap = new Map(consentTypes.map((type) => [type.name, type.consent_type_id]));
  const missingTypes = typeNames.filter((name) => !typeMap.has(name));
  if (missingTypes.length) {
    throw new ServiceError(app, `Unknown consent type(s): ${missingTypes.join(', ')}`, {
      status: 400,
    });
  }

  const uniqueVersions = consents
    .map(({ type, version }) => ({ type, version }))
    .filter(
      (candidate, index, versions) =>
        versions.findIndex(
          (version) => version.type === candidate.type && version.version === candidate.version,
        ) === index,
    );
  const existingVersions = await db
    .selectFrom('consent_versions as cv')
    .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
    .select(['cv.consent_version_id', 'ct.name as type', 'cv.name as version'])
    .where('ct.name', 'in', typeNames)
    .execute();
  const versionMap = new Map(
    existingVersions.map((version) => [
      `${version.type}:${version.version}`,
      version.consent_version_id,
    ]),
  );

  for (const consentVersion of uniqueVersions) {
    const key = `${consentVersion.type}:${consentVersion.version}`;
    if (!versionMap.has(key)) {
      const created = await db
        .insertInto('consent_versions')
        .values({
          consent_type_id: typeMap.get(consentVersion.type) as number,
          name: consentVersion.version,
        })
        .returning('consent_version_id')
        .executeTakeFirstOrThrow();
      versionMap.set(key, created.consent_version_id);
    }
  }

  const current = await db
    .with('RankedConsents', (query) =>
      query
        .selectFrom('group_consents as gc')
        .innerJoin('consent_versions as cv', 'gc.consent_version_id', 'cv.consent_version_id')
        .innerJoin('consent_types as ct', 'cv.consent_type_id', 'ct.consent_type_id')
        .select([
          'ct.name as type',
          'cv.name as version',
          'gc.is_granted',
          'gc.actor_individual_id',
          sql<number>`ROW_NUMBER() OVER (
            PARTITION BY cv.consent_type_id
            ORDER BY gc.created_at DESC, gc.group_consent_id DESC
          )`.as('rn'),
        ])
        .where('gc.group_id', '=', groupId)
        .where('gc.consent_scope', scope ? '=' : 'is', scope),
    )
    .selectFrom('RankedConsents')
    .select(['type', 'version', 'is_granted', 'actor_individual_id'])
    .where('rn', '=', 1)
    .execute();
  const currentByType = new Map(current.map((consent) => [consent.type, consent]));
  const changed = consents.filter((consent) => {
    const existing = currentByType.get(consent.type);
    return (
      !existing ||
      existing.version !== consent.version ||
      existing.is_granted !== consent.granted ||
      existing.actor_individual_id !== actorIndividualId
    );
  });
  if (!changed.length) return;

  await db
    .insertInto('group_consents')
    .values(
      changed.map((consent) => ({
        group_id: groupId,
        actor_individual_id: actorIndividualId,
        consent_version_id: versionMap.get(`${consent.type}:${consent.version}`) as number,
        consent_scope: scope,
        is_granted: consent.granted,
        evidence: consent.evidence ? JSON.stringify(consent.evidence) : null,
        detail: consent.detail ? JSON.stringify(consent.detail) : null,
      })),
    )
    .execute();
}

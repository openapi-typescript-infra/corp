import type { IdentityInternal } from '#src/types/index.ts';
import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

export async function getTagsForIndividuals(
  app: IdentityInternal['App'],
  individualUuidMap: Record<IndividualId, WithIndividualUuid>,
) {
  const result = await app.locals.db
    .selectFrom('individual_tags')
    .select(['individual_id', 'value', 'created_at'])
    .where('individual_id', 'in', Object.keys(individualUuidMap))
    .where('deleted_at', 'is', null)
    .execute();
  const map: Record<IndividualUuid, { value: string; created_at: string }[]> = {};
  result.forEach((row) => {
    const { individual_id } = row;
    const uuid = individualUuidMap[individual_id].individual_uuid;
    map[uuid] = map[uuid] || [];
    map[uuid].push({
      value: row.value as string,
      created_at: row.created_at.toISOString(),
    });
  });
  return map;
}

export async function addIndividualTag(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  value: string,
) {
  await app.locals.db
    .insertInto('individual_tags')
    .values({ individual_id: individualId, value })
    .onConflict((oc) =>
      oc.columns(['individual_id', 'value']).where('deleted_at', 'is', null).doNothing(),
    )
    .execute();
}

export async function removeIndividualTag(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  value: string,
) {
  await app.locals.db
    .updateTable('individual_tags')
    .set({ deleted_at: new Date() })
    .where('individual_id', '=', individualId)
    .where('value', '=', value)
    .where('deleted_at', 'is', null)
    .execute();
}

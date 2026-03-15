import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';
import { toApiIdentifierDetail } from './namespaces.ts';
import { getIdentifiersForIndividuals } from './individual.ts';

import type { components } from '#src/generated/service/index.ts';
import type { RelationTypeEnum } from '#src/generated/database.ts';
import type { IdentityInternal } from '#src/types/index.ts';

export async function getRelationsForIndividuals(
  app: IdentityInternal['App'],
  individualUuidMap: Record<IndividualId, WithIndividualUuid>,
  relationTypes: components['schemas']['RelationType'][] | true,
  namespaces?: components['schemas']['IdentifierNamespaces'][],
  // Fetch only relations for which the individual is the... (defaults to both)
  direction?: 'subject' | 'object',
) {
  const keys = Object.keys(individualUuidMap);
  let rQuery = app.locals.db
    .selectFrom('individual_relations as R')
    .innerJoin('individuals as S', 'S.individual_id', 'R.subject_individual_id')
    .innerJoin('individuals as O', 'O.individual_id', 'R.object_individual_id')
    .select([
      'S.individual_id as subject_individual_id',
      'S.individual_uuid as subject_individual_uuid',
      'R.subject_individual_id',
      'R.relation_type',
      'O.individual_id as object_individual_id',
      'O.individual_uuid as object_individual_uuid',
      'R.object_individual_id',
    ])
    .where((eb) => {
      if (direction === 'subject') {
        return eb('R.subject_individual_id', 'in', keys);
      }
      if (direction === 'object') {
        return eb('R.object_individual_id', 'in', keys);
      }
      return eb.or([
        eb('R.subject_individual_id', 'in', keys),
        eb('R.object_individual_id', 'in', keys),
      ]);
    })
    .where('R.deleted_at', 'is', null);

  if (Array.isArray(relationTypes)) {
    rQuery = rQuery.where('R.relation_type', 'in', relationTypes as unknown as RelationTypeEnum[]);
  }

  const relations = await rQuery.execute();

  let namespacedIdentifierMap: Awaited<ReturnType<typeof getIdentifiersForIndividuals>> | undefined;
  if (namespaces?.length && relations.length) {
    const relationMap = relations.reduce<Record<IndividualId, WithIndividualUuid>>((acc, r) => {
      acc[r.subject_individual_id] = {
        individual_uuid: r.subject_individual_uuid,
      };
      acc[r.object_individual_id] = {
        individual_uuid: r.object_individual_uuid,
      };
      return acc;
    }, {});
    namespacedIdentifierMap = await getIdentifiersForIndividuals(app, relationMap, namespaces);
  }

  const result: Record<
    IndividualUuid,
    {
      subject_individual_uuid: string;
      relation: string;
      object_individual_uuid: string;
      identifiers?: ReturnType<typeof toApiIdentifierDetail>[];
    }[]
  > = {};
  for (const r of relations) {
    const subjectUuid = r.subject_individual_uuid;
    const objectUuid = r.object_individual_uuid;
    const relation = {
      subject_individual_uuid: subjectUuid,
      relation: r.relation_type,
      object_individual_uuid: objectUuid,
    };
    if (!direction || direction === 'subject') {
      if (!result[subjectUuid]) {
        result[subjectUuid] = [];
      }
      result[subjectUuid].push({
        ...relation,
        identifiers:
          namespacedIdentifierMap?.[r.object_individual_uuid]?.map(toApiIdentifierDetail),
      });
    }
    if (!direction || direction === 'object') {
      if (!result[objectUuid]) {
        result[objectUuid] = [];
      }
      result[objectUuid].push({
        ...relation,
        identifiers:
          namespacedIdentifierMap?.[r.subject_individual_uuid]?.map(toApiIdentifierDetail),
      });
    }
  }
  return result;
}

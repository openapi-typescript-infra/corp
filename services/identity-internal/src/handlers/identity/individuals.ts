import { parse } from 'date-fns';
import { ServiceError } from '@openapi-typescript-infra/service';

import type { IdentityInternalApi, IdentityInternal } from '#src/types/index.ts';
import {
  createIndividual,
  toBiologicalSex,
  toBirthdate,
  toIndividualIdMap,
  updateIndividualByUuid,
} from '#src/lib/db/individual.ts';
import { resolveAncillaryData } from '#src/lib/db/resolvers.ts';
import type { IndividualUuid } from '#src/lib/db/types.ts';
import { toDatabaseIdentifierDetail } from '#src/lib/db/namespaces.ts';
import type { components } from '#src/generated/service/index.ts';

/**
 * Parse external_ids in "namespace:identifier" format into IdentifierInput objects.
 * Identifiers with namespace 'individual-uuid' are separated out for direct lookup.
 */
function parseExternalIds(externalIds?: string[]) {
  const directUuids: string[] = [];
  const identifierInputs: components['schemas']['IdentifierInput'][] = [];

  if (!externalIds?.length) {
    return { directUuids, identifierInputs };
  }

  for (const extId of externalIds) {
    const colonIndex = extId.indexOf(':');
    if (colonIndex === -1) {
      // Treat bare values as individual-uuid
      directUuids.push(extId);
      continue;
    }
    const namespace = extId.substring(0, colonIndex);
    const identifier = extId.substring(colonIndex + 1);

    if (namespace === 'individual-uuid') {
      directUuids.push(identifier);
    } else {
      identifierInputs.push({
        namespace: namespace as components['schemas']['IdentifierNamespaces'],
        identifier,
      });
    }
  }

  return { directUuids, identifierInputs };
}

async function resolveSearchTerms(
  app: IdentityInternal['App'],
  individualUuids?: string[],
  externalIds?: string[],
) {
  const matches = new Map<
    string,
    {
      individual_id: string;
      individual_uuid: string;
      biological_sex: string | null;
      birthdate: Date | null;
    }
  >();
  const { directUuids, identifierInputs } = parseExternalIds(externalIds);

  const uuids = [...(individualUuids || []), ...directUuids];

  await Promise.all([
    uuids.length
      ? app.locals.db
          .selectFrom('individuals')
          .select(['individual_uuid', 'individual_id', 'biological_sex', 'birthdate'])
          .where('individual_uuid', 'in', uuids)
          .execute()
          .then((r) => r.map((i) => matches.set(i.individual_uuid, i)))
      : undefined,
    identifierInputs.length
      ? toDatabaseIdentifierDetail(app, identifierInputs).then((ids) =>
          app.locals.db
            .selectFrom('individuals')
            .innerJoin(
              'individual_identifiers',
              'individuals.individual_id',
              'individual_identifiers.individual_id',
            )
            .select(['individual_uuid', 'individuals.individual_id', 'biological_sex', 'birthdate'])
            .where('deleted_at', 'is', null)
            .where('released_at', 'is', null)
            .where((eb) =>
              eb.or(
                ids.map((id) =>
                  eb.and([
                    eb('identifier_namespace_id', '=', id.identifier_namespace_id),
                    eb('identifier', '=', id.identifier),
                    eb('is_unique', 'is', id.is_unique),
                  ]),
                ),
              ),
            )
            .execute()
            .then((r) => r.map((i) => matches.set(i.individual_uuid, i))),
        )
      : undefined,
  ]);
  return Array.from(matches.values());
}

export const GET: IdentityInternalApi['getIndividuals'] = async (req, res) => {
  const individuals = await resolveSearchTerms(
    req.app,
    req.query.individual_uuids,
    req.query.external_ids,
  );

  if (individuals.length === 0) {
    res.sendStatus(404);
    return;
  }

  const idMap = toIndividualIdMap(individuals);
  const resolved = await resolveAncillaryData(req.app, idMap, {
    identifierNamespaces: req.query.identifier_namespaces,
    schemaInstanceSpecs: req.query.profiles,
    addressTypes: req.query.addresses,
    getRelations: req.query.relation_types,
    relationIdentifiers: req.query.relation_identifiers,
    getGroups: req.query.groups,
    consentList: req.query.consents,
    fetchTags: req.query.tags,
  });

  const askedBirthdate = req.query.fields?.includes('birthdate');
  const askedBioSex = req.query.fields?.includes('biological_sex');
  // Individual schema is intentionally open (type: object) in the API spec
  res.json({
    individuals: individuals.map((i) => ({
      individual_uuid: i.individual_uuid,
      identifiers: resolved.identifiers[i.individual_uuid] || undefined,
      profiles: resolved.profiles[i.individual_uuid] || undefined,
      birthdate: askedBirthdate ? toBirthdate(i.birthdate) : undefined,
      biological_sex: askedBioSex ? toBiologicalSex(i.biological_sex) : undefined,
      groups: resolved.groups[i.individual_uuid] || undefined,
      relations: resolved.relations[i.individual_uuid] || undefined,
      addresses: resolved.addresses[i.individual_uuid] || undefined,
      consents: resolved.consents[i.individual_uuid] || undefined,
      tags: resolved.tags[i.individual_uuid] || undefined,
    })) as unknown as components['schemas']['Individual'][],
  });
};

export const POST: IdentityInternalApi['createIndividual'] = async (req, res) => {
  const { identifiers, individual_uuid: uuid, biological_sex, birthdate } = req.body;

  // Swagger can't validate this, so let's do it to make sure we don't orphan individuals
  if (birthdate && Number.isNaN(parse(birthdate, 'yyyy-MM-dd', new Date()).getTime())) {
    throw new ServiceError(req.app, 'Invalid date supplied', { status: 400 });
  }

  try {
    const individual = await createIndividual(req.app, uuid, identifiers);

    let fields: Awaited<ReturnType<typeof updateIndividualByUuid>> = {};
    if (biological_sex !== undefined || birthdate !== undefined) {
      fields = await updateIndividualByUuid(
        req.app,
        individual.individual_uuid,
        birthdate,
        biological_sex,
      );
    }

    res.status(201).json({
      ...individual,
      ...fields,
    });
  } catch (error) {
    if (error instanceof ServiceError && error.status === 409 && 'individual_uuid' in error) {
      res.status(409).json({
        conflicting_individual_uuid: (error as { individual_uuid: IndividualUuid }).individual_uuid,
      });
    } else {
      throw error;
    }
  }
};

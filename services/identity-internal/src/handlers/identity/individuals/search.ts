import type { IdentityInternalApi } from '#src/types/index.ts';
import { toBiologicalSex, toBirthdate, toIndividualIdMap } from '#src/lib/db/individual.ts';
import { resolveAncillaryData } from '#src/lib/db/resolvers.ts';
import { toDatabaseIdentifierDetail, type CanonicalIdentifier } from '#src/lib/db/namespaces.ts';
import type { components } from '#src/generated/service/index.ts';

function toMatchKey(namespace: string, identifier: string) {
  return `${namespace}:${identifier}`;
}

/**
 * Build a reverse lookup: for each canonicalized identifier from the query,
 * find which input identifier(s) it came from so we can key the matches map
 * using the original namespace:identifier the caller sent.
 */
function buildCanonicalToInputKeys(
  inputs: components['schemas']['IdentifierInput'][],
  canonicalized: CanonicalIdentifier[],
) {
  const map = new Map<string, string>();
  for (let i = 0; i < canonicalized.length; i++) {
    const c = canonicalized[i];
    const input = inputs[i];
    const canonKey = `${c.identifier_namespace_id}:${c.identifier}`;
    map.set(canonKey, toMatchKey(input.namespace, input.identifier));
  }
  return map;
}

export const POST: IdentityInternalApi['searchIndividualsByIdentifiers'] = async (req, res) => {
  const { identifiers } = req.body;

  const canonicalized = await toDatabaseIdentifierDetail(req.app, identifiers);

  const rows = await req.app.locals.db
    .selectFrom('individuals')
    .innerJoin(
      'individual_identifiers',
      'individuals.individual_id',
      'individual_identifiers.individual_id',
    )
    .select([
      'individual_uuid',
      'individuals.individual_id',
      'biological_sex',
      'birthdate',
      'identifier_namespace_id',
      'identifier',
    ])
    .where('deleted_at', 'is', null)
    .where('released_at', 'is', null)
    .where((eb) =>
      eb.or(
        canonicalized.map((id) =>
          eb.and([
            eb('identifier_namespace_id', '=', id.identifier_namespace_id),
            eb('identifier', '=', id.identifier),
            eb('is_unique', 'is', id.is_unique),
          ]),
        ),
      ),
    )
    .execute();

  if (rows.length === 0) {
    res.sendStatus(404);
    return;
  }

  // Build the matches map and deduplicate individuals
  const canonToInput = buildCanonicalToInputKeys(identifiers, canonicalized);
  const matches: Record<string, string> = {};
  const uniqueIndividuals = new Map<
    string,
    {
      individual_id: string;
      individual_uuid: string;
      biological_sex: string | null;
      birthdate: Date | null;
    }
  >();

  for (const row of rows) {
    const canonKey = `${row.identifier_namespace_id}:${row.identifier}`;
    const inputKey = canonToInput.get(canonKey);
    if (inputKey) {
      matches[inputKey] = row.individual_uuid;
    }
    if (!uniqueIndividuals.has(row.individual_uuid)) {
      uniqueIndividuals.set(row.individual_uuid, row);
    }
  }

  const individuals = Array.from(uniqueIndividuals.values());
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

  res.json({
    matches,
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

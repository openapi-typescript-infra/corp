import { parseISO } from 'date-fns';
import type { components } from '#src/generated/service/index.ts';
import { saveAddresses } from '#src/lib/db/addresses.ts';
import { saveConsents } from '#src/lib/db/consents.ts';
import { addMemberToGroup, removeGroupMember } from '#src/lib/db/groups.ts';
import {
  assignIdentifiers,
  resolveIdentifier,
  resolveIdentifierToSingleIndividual,
  toBiologicalSex,
  toBirthdate,
  toIndividualIdMap,
  updateIndividualByUuid,
} from '#src/lib/db/individual.ts';
import { modifyProfile } from '#src/lib/db/profile.ts';
import { resolveAncillaryData } from '#src/lib/db/resolvers.ts';
import { addIndividualTag, removeIndividualTag } from '#src/lib/db/tags.ts';
import type { IdentityInternalApi } from '#src/types/index.ts';

export const GET: IdentityInternalApi['getIndividualsByIdentifier'] = async (req, res) => {
  const { identifier, namespace } = req.params;
  const { is_unique, individuals } = await resolveIdentifier(req.app, identifier, namespace);

  if (individuals.length === 0) {
    res.sendStatus(404);
    return;
  }

  const resolved = await resolveAncillaryData(req.app, toIndividualIdMap(individuals), {
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
    total: individuals.length,
    items: individuals.map(({ individual_uuid, created_at, birthdate, biological_sex }) => ({
      individual_uuid,
      is_unique,
      created_at: created_at.toISOString(),
      birthdate: askedBirthdate ? toBirthdate(birthdate) : undefined,
      biological_sex: askedBioSex ? toBiologicalSex(biological_sex) : undefined,
      profiles: resolved.profiles[individual_uuid] || undefined,
      identifiers: resolved.identifiers[individual_uuid] || undefined,
      addresses: resolved.addresses[individual_uuid] || undefined,
      relations: resolved.relations[individual_uuid] || undefined,
      groups: resolved.groups[individual_uuid] || undefined,
      consents: resolved.consents[individual_uuid] || undefined,
      tags: resolved.tags[individual_uuid] || undefined,
    })) as unknown as components['schemas']['Individual'][],
  });
};

export const PATCH: IdentityInternalApi['updateIndividualByIdentifier'] = async (req, res) => {
  const { identifier, namespace } = req.params;
  const { profiles, addresses, consents, identifiers, tags, groups, birthdate, biological_sex } =
    req.body;

  const individual = await resolveIdentifierToSingleIndividual(req.app, identifier, namespace);

  if (birthdate !== undefined || biological_sex !== undefined) {
    await updateIndividualByUuid(req.app, individual.individual_uuid, birthdate, biological_sex);
  }

  let profileResults: components['schemas']['ProfileEntry'][] | undefined;
  if (profiles?.length) {
    const results = await Promise.all(
      profiles.map(({ name, patch, key, instance_name: instance }) =>
        modifyProfile(req.app, individual.individual_uuid, name, instance, key, patch),
      ),
    );
    profileResults = results.map((profile, index) => ({
      name: profiles[index].name,
      instance_name: profiles[index].instance_name,
      profile: profile as Record<string, unknown>,
    }));
  }

  if (identifiers?.length) {
    await assignIdentifiers(req.app, individual.individual_uuid, identifiers);
  }

  if (addresses?.length) {
    await saveAddresses(req.app, individual.individual_id, addresses);
  }

  if (consents?.length) {
    await saveConsents(req.app, individual.individual_id, consents);
  }

  if (tags?.length) {
    const toAdd = tags.filter((t) => t.operation === 'add');
    const toRemove = tags.filter((t) => t.operation === 'remove');
    await Promise.all([
      ...toAdd.map((t) => addIndividualTag(req.app, individual.individual_id, t.value)),
      ...toRemove.map((t) => removeIndividualTag(req.app, individual.individual_id, t.value)),
    ]);
  }

  if (groups?.length) {
    const toAdd = groups.filter((g) => g.operation === 'add');
    const toRemove = groups.filter((g) => g.operation === 'remove');
    await Promise.all([
      ...toAdd.map((g) =>
        addMemberToGroup(
          req.app,
          g.name,
          individual.individual_id,
          g.conflict_resolution,
          g.begins_at ? parseISO(g.begins_at) : undefined,
          g.ends_at ? parseISO(g.ends_at) : undefined,
        ),
      ),
      ...toRemove.map((g) => removeGroupMember(req.app, g.name, individual.individual_id)),
    ]);
  }

  res.json({
    individual_uuid: individual.individual_uuid,
    profiles: profileResults,
  });
};

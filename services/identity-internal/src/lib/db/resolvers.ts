import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import { getAddressesForIndividuals } from './addresses.ts';
import { getConsentsForIndividuals } from './consents.ts';
import { getGroupsForIndividuals } from './groups.ts';
import { getIdentifiersForIndividuals } from './individual.ts';
import { getProfilesForIndividuals } from './profile.ts';
import { getRelationsForIndividuals } from './relations.ts';
import { getTagsForIndividuals } from './tags.ts';
import type { IndividualId, WithIndividualUuid } from './types.ts';

const EMPTY = Object.freeze({
  identifiers: {},
  profiles: {},
  addresses: {},
  relations: {},
  groups: {},
  consents: {},
  tags: {},
});

interface ResolvedInfo {
  identifiers: Awaited<ReturnType<typeof getIdentifiersForIndividuals>>;
  profiles: Awaited<ReturnType<typeof getProfilesForIndividuals>>;
  addresses: Awaited<ReturnType<typeof getAddressesForIndividuals>>;
  relations: Awaited<ReturnType<typeof getRelationsForIndividuals>>;
  groups: Awaited<ReturnType<typeof getGroupsForIndividuals>>;
  consents: Awaited<ReturnType<typeof getConsentsForIndividuals>>;
  tags: Awaited<ReturnType<typeof getTagsForIndividuals>>;
}

export async function resolveAncillaryData(
  app: IdentityInternal['App'],
  individualUuidMap: Record<IndividualId, WithIndividualUuid>,
  args: {
    identifierNamespaces?: string[];
    schemaInstanceSpecs?: string[];
    addressTypes?: string[];
    getRelations?: components['schemas']['RelationType'][] | boolean;
    relationIdentifiers?: components['schemas']['IdentifierNamespaces'][];
    getGroups?: boolean;
    consentList?: components['schemas']['ConsentTypes'][];
    fetchTags?: boolean;
  },
): Promise<ResolvedInfo> {
  const {
    identifierNamespaces,
    schemaInstanceSpecs,
    addressTypes,
    getRelations,
    relationIdentifiers,
    getGroups,
    consentList,
    fetchTags,
  } = args;
  if (
    !identifierNamespaces?.length &&
    !schemaInstanceSpecs?.length &&
    !addressTypes?.length &&
    !getRelations &&
    !getGroups &&
    !consentList?.length &&
    !fetchTags
  ) {
    return EMPTY;
  }

  const emptyPromise = Promise.resolve({});
  const identifierPromise = identifierNamespaces?.length
    ? getIdentifiersForIndividuals(app, individualUuidMap, identifierNamespaces)
    : emptyPromise;
  const profilePromise = schemaInstanceSpecs?.length
    ? getProfilesForIndividuals(app, individualUuidMap, schemaInstanceSpecs)
    : emptyPromise;
  const addressPromise = addressTypes?.length
    ? getAddressesForIndividuals(app, individualUuidMap, addressTypes)
    : emptyPromise;
  const relationsPromise = getRelations
    ? getRelationsForIndividuals(app, individualUuidMap, getRelations, relationIdentifiers)
    : emptyPromise;
  const consentsPromise = consentList?.length
    ? getConsentsForIndividuals(app, individualUuidMap, consentList)
    : emptyPromise;
  const groupsPromise = getGroups ? getGroupsForIndividuals(app, individualUuidMap) : emptyPromise;
  const tagPromise = fetchTags ? getTagsForIndividuals(app, individualUuidMap) : emptyPromise;

  const [identifiers, profiles, addresses, relations, groups, consents, tags] = await Promise.all([
    identifierPromise,
    profilePromise,
    addressPromise,
    relationsPromise,
    groupsPromise,
    consentsPromise,
    tagPromise,
  ]);

  return {
    identifiers,
    profiles,
    addresses,
    relations,
    groups,
    consents,
    tags,
  };
}

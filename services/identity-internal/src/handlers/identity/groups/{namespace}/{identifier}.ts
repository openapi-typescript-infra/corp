import type { components } from '#src/generated/service/index.ts';
import { getAddressesForGroup, saveGroupAddresses } from '#src/lib/db/addresses.ts';
import { getConsentsForGroup } from '#src/lib/db/groupConsents.ts';
import { getProfilesForGroup, modifyGroupProfile } from '#src/lib/db/groupProfile.ts';
import {
  addGroupIdentifiers,
  type GroupSummary,
  getGroupByIdentifier,
  getGroupHierarchy,
  getIdentifiersForGroups,
  unescapeGroupName,
  updateGroupByInternalId,
} from '#src/lib/db/groups.ts';
import type { IdentityInternalApi } from '#src/types/index.ts';

const toPath = (fullyQualifiedName: string | null) =>
  unescapeGroupName((fullyQualifiedName ?? '').split('.'));

export const GET: IdentityInternalApi['getGroupByIdentifier'] = async (req, res) => {
  const group = await getGroupByIdentifier(req.app, req.params.namespace, req.params.identifier);
  if (!group) {
    res.sendStatus(404);
    return;
  }

  const [profiles, addresses, identifiers, hierarchy, consents] = await Promise.all([
    req.query.profiles?.length
      ? getProfilesForGroup(req.app, group.group_uuid, req.query.profiles)
      : Promise.resolve([]),
    req.query.addresses?.length
      ? getAddressesForGroup(req.app, group.group_id, req.query.addresses)
      : Promise.resolve([]),
    getIdentifiersForGroups(
      req.app,
      { [group.group_id]: { group_uuid: group.group_uuid } },
      req.query.identifier_namespaces,
    ),
    getGroupHierarchy(req.app, group.group_id, {
      parents: req.query.parents,
      children: req.query.children,
    }),
    req.query.consents?.length
      ? getConsentsForGroup(req.app, group.group_id, req.query.consents, req.query.consent_scope)
      : Promise.resolve([]),
  ]);

  const toApiGroup = (related: GroupSummary) => ({
    group_id: related.group_uuid,
    name: toPath(related.fully_qualified_name),
    group_type: related.group_type,
    display_name: related.display_name || undefined,
  });

  res.json({
    group_id: group.group_uuid,
    parent_group_id: group.parent_group_uuid ?? undefined,
    name: toPath(group.fully_qualified_name),
    group_type: group.group_type,
    display_name: group.display_name || undefined,
    profiles: profiles.length ? profiles : undefined,
    addresses: addresses.length ? addresses : undefined,
    consents: consents.length ? consents : undefined,
    identifiers: identifiers[group.group_uuid] || undefined,
    parents: hierarchy.parents.length ? hierarchy.parents.map(toApiGroup) : undefined,
    children: hierarchy.children.length ? hierarchy.children.map(toApiGroup) : undefined,
  });
};

export const PATCH: IdentityInternalApi['updateGroupByIdentifier'] = async (req, res) => {
  const group = await getGroupByIdentifier(req.app, req.params.namespace, req.params.identifier);
  if (!group) {
    res.sendStatus(404);
    return;
  }

  const { name, display_name, group_type, parent_group_id, profiles, addresses, identifiers } =
    req.body;
  let updated = group;
  if (
    name !== undefined ||
    display_name !== undefined ||
    group_type !== undefined ||
    parent_group_id !== undefined
  ) {
    updated = await updateGroupByInternalId(req.app, group.group_id, {
      name,
      displayName: display_name,
      groupType: group_type,
      parentGroupUuid: parent_group_id,
    });
  }

  let profileResults: components['schemas']['ProfileEntry'][] | undefined;
  if (profiles?.length) {
    const results = await Promise.all(
      profiles.map(({ name: profileName, patch, key, instance_name: instance }) =>
        modifyGroupProfile(req.app, group.group_uuid, profileName, instance, key, patch),
      ),
    );
    profileResults = results.map((profile, index) => ({
      name: profiles[index].name,
      instance_name: profiles[index].instance_name,
      profile: profile as Record<string, unknown>,
    }));
  }

  if (identifiers?.length) await addGroupIdentifiers(req.app, group.group_id, identifiers);
  if (addresses?.length) await saveGroupAddresses(req.app, group.group_id, addresses);

  res.json({
    group_id: updated.group_uuid,
    parent_group_id: updated.parent_group_uuid ?? undefined,
    name: toPath(updated.fully_qualified_name),
    group_type: updated.group_type,
    display_name: updated.display_name || undefined,
    profiles: profileResults,
  });
};

import { parseISO } from 'date-fns';

import {
  createGroup,
  addMemberToGroup,
  removeGroupMember,
  updateGroupDisplayName,
  escapeGroupName,
  unescapeGroupName,
} from '#src/lib/db/groups.ts';
import { getIndividualByUuid, resolveIdentifier } from '#src/lib/db/individual.ts';
import type { IndividualId, IndividualUuid } from '#src/lib/db/types.ts';
import type { IdentityInternalApi } from '#src/types/index.ts';

export const POST: IdentityInternalApi['createGroup'] = async (req, res) => {
  const group = await createGroup(
    req.app,
    req.body.name,
    req.body.group_type,
    req.body.display_name,
  );
  res.status(group.inserted ? 201 : 409).json({
    group_id: group.name,
    name: req.body.name,
    group_type: req.body.group_type,
    display_name: req.body.display_name,
  });
};

export const PATCH: IdentityInternalApi['modifyGroup'] = async (req, res) => {
  const { name, display_name, members } = req.body;

  // Verify group exists
  const ltreeName = escapeGroupName(name).join('.');
  const existing = await req.app.locals.db
    .selectFrom('groups')
    .select(['group_id', 'name', 'display_name'])
    .where('name', '=', ltreeName)
    .executeTakeFirst();

  if (!existing) {
    res.sendStatus(404);
    return;
  }

  if (display_name !== undefined) {
    await updateGroupDisplayName(req.app, name, display_name);
  }

  let memberResults:
    | { individual_uuid: string; begins_at?: string; ends_at?: string }[]
    | undefined;

  if (members?.length) {
    memberResults = [];
    for (const member of members) {
      let resolved: { individual_id: IndividualId; individual_uuid: IndividualUuid } | undefined;

      if (typeof member.individual === 'string') {
        resolved = await getIndividualByUuid(req.app, member.individual);
      } else {
        const { individuals } = await resolveIdentifier(
          req.app,
          member.individual.identifier,
          member.individual.namespace,
        );
        resolved = individuals?.[0];
      }

      if (!resolved) {
        res.sendStatus(404);
        return;
      }

      if (member.operation === 'add') {
        const result = await addMemberToGroup(
          req.app,
          name,
          resolved.individual_id,
          member.conflict_resolution,
          member.begins_at ? parseISO(member.begins_at) : undefined,
          member.ends_at ? parseISO(member.ends_at) : undefined,
        );
        memberResults.push({
          individual_uuid: resolved.individual_uuid,
          begins_at: result.begins_at?.toISOString() || undefined,
          ends_at: result.ends_at?.toISOString() || undefined,
        });
      } else {
        await removeGroupMember(req.app, name, resolved.individual_id);
        memberResults.push({ individual_uuid: resolved.individual_uuid });
      }
    }
  }

  res.json({
    group_id: existing.name,
    name: unescapeGroupName(existing.name.split('.')),
    display_name: display_name ?? existing.display_name ?? undefined,
    members: memberResults,
  });
};

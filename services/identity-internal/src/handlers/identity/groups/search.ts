import { getGroups, unescapeGroupName } from '#src/lib/db/groups.ts';
import type { IdentityInternalApi } from '#src/types/index.ts';

export const POST: IdentityInternalApi['searchGroups'] = async (req, res) => {
  const groups = await getGroups(req.app, req.body.components);
  res.json({
    groups: groups.map((g) => ({
      group_id: g.group_uuid,
      name: unescapeGroupName((g.fully_qualified_name ?? '').split('.')),
      group_type: g.group_type,
      display_name: g.display_name || undefined,
    })),
  });
};

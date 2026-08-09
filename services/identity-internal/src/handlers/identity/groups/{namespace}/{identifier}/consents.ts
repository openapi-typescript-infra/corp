import { getConsentsForGroup, saveGroupConsents } from '#src/lib/db/groupConsents.ts';
import { getGroupByIdentifier } from '#src/lib/db/groups.ts';
import { getIndividualByUuid } from '#src/lib/db/individual.ts';
import type { IdentityInternalApi } from '#src/types/index.ts';

export const PUT: IdentityInternalApi['upsertGroupConsents'] = async (req, res) => {
  const group = await getGroupByIdentifier(req.app, req.params.namespace, req.params.identifier);
  if (!group) {
    res.sendStatus(404);
    return;
  }

  const actor = await getIndividualByUuid(req.app, req.body.actor_individual_uuid);
  if (!actor) {
    res.sendStatus(404);
    return;
  }

  await saveGroupConsents(req.app, group.group_id, actor.individual_id, req.body.consents);
  const scope = req.body.consents[0]?.scope;
  const consentTypes = [...new Set(req.body.consents.map((consent) => consent.type))];
  const consents = await getConsentsForGroup(req.app, group.group_id, consentTypes, scope);

  res.json({ group_id: group.group_uuid, consents });
};

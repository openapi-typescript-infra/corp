import type { IdentityInternalApi } from '#src/types/service.ts';

export const GET: IdentityInternalApi['getAddress'] = async (req, res) => {
  const result = await req.app.locals.db
    .selectFrom('addresses as A')
    .innerJoin('address_map as M', 'M.address_id', 'A.address_id')
    .selectAll()
    .where('M.address_map_uuid', '=', req.params.address_id)
    .executeTakeFirst();

  if (!result) {
    res.sendStatus(404);
    return;
  }

  res.json({
    address_id: result.address_map_uuid,
    line_1: result.line_1 || undefined,
    line_2: result.line_2 || undefined,
    city: result.city,
    state: result.state,
    postal_code: result.postal_code,
    country: result.country,
  });
};

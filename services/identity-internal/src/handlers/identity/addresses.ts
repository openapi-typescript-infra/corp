import { sql } from 'kysely';
import { geocodeAddressById } from '#src/lib/geocode.ts';
import { getAddressWithKey } from '#src/lib/normalize.ts';
import type { IdentityInternalApi } from '#src/types/service.ts';

export const GET: IdentityInternalApi['getAddresses'] = async (req, res) => {
  const result = await req.app.locals.db
    .selectFrom('addresses as A')
    .innerJoin('address_map as M', 'M.address_id', 'A.address_id')
    .selectAll()
    .where('M.address_map_uuid', 'in', req.query.address_ids)
    .execute();

  if (result.length === 0) {
    res.sendStatus(404);
    return;
  }

  res.json({
    addresses: result.map((row) => ({
      address_id: row.address_map_uuid,
      line_1: row.line_1 || undefined,
      line_2: row.line_2 || undefined,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
      country: row.country,
    })),
  });
};

export const POST: IdentityInternalApi['createAddresses'] = async (req, res) => {
  const { addresses } = req.body;
  if (!addresses?.length) {
    res.sendStatus(400);
    return;
  }

  const raw = addresses[0];
  const address = getAddressWithKey(req.app, raw);

  const hasLocation =
    raw.geolocation &&
    raw.geolocation.latitude !== undefined &&
    raw.geolocation.longitude !== undefined;

  const result = await sql<{ uuid: string }>`
    SELECT
      create_address(
        ${address.key},
        ${raw.scope},
        ${address.line_1},
        ${address.line_2},
        ${address.city},
        ${address.state},
        ${address.postal_code},
        ${address.country},
        CASE WHEN ${hasLocation} THEN
          ST_SetSRID(ST_MakePoint(
            ${raw.geolocation?.longitude || 0},
            ${raw.geolocation?.latitude || 0}
            ), 4326)::GEOGRAPHY ELSE NULL END,
        NULL
      )
    as uuid;
  `.execute(req.app.locals.db);

  if (req.query.geocode) {
    await geocodeAddressById(req.app, result.rows[0].uuid);
  }

  const { key, ...addressWithoutKey } = address;
  res.status(201).json({
    address_id: result.rows[0].uuid,
    geolocation: raw.geolocation || undefined,
    ...addressWithoutKey,
  });
};

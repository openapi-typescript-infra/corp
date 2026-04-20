import { sql } from 'kysely';
import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternalApi } from '#src/types/service.ts';

const DEFAULT_RADIUS_METERS = 5000;
const MAX_RADIUS_METERS = 50000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const GET: IdentityInternalApi['searchAddresses'] = async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    res.sendStatus(400);
    return;
  }

  const radiusInput = Number(req.query.radius ?? DEFAULT_RADIUS_METERS);
  const radiusMeters = Math.min(
    MAX_RADIUS_METERS,
    Math.max(0, Number.isFinite(radiusInput) ? radiusInput : DEFAULT_RADIUS_METERS),
  );

  const { page: rawPage, page_size: rawPageSize } = req.query;
  const page = Number.isFinite(Number(rawPage)) ? Math.max(1, Math.floor(Number(rawPage))) : 1;
  const pageSize = Number.isFinite(Number(rawPageSize))
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(rawPageSize))))
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const searchPoint = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
  const distance = sql<number>`ST_Distance(a.geolocation, ${searchPoint})`;

  const rows = await req.app.locals.db
    .selectFrom('addresses as a')
    .innerJoin('address_map as m', 'm.address_id', 'a.address_id')
    .innerJoin('address_scopes as s', 's.address_scope_id', 'm.address_scope_id')
    .select([
      'm.address_map_uuid',
      'a.line_1',
      'a.line_2',
      'a.city',
      'a.state',
      'a.postal_code',
      'a.country',
      's.address_scope_name',
      distance.as('distance'),
    ])
    .where('s.address_scope_name', '=', req.query.scope)
    .where('a.geolocation', 'is not', null)
    .where(sql<boolean>`ST_DWithin(a.geolocation, ${searchPoint}, ${radiusMeters})`)
    .orderBy(distance)
    .orderBy('a.address_id')
    .limit(pageSize)
    .offset(offset)
    .execute();

  res.json({
    addresses: rows.map((row) => ({
      address_id: row.address_map_uuid,
      line_1: row.line_1 || undefined,
      line_2: row.line_2 || undefined,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
      country: row.country,
      scope: row.address_scope_name as components['schemas']['AddressScope'],
      distance: row.distance,
    })),
  });
};

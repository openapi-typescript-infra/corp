import { sql } from 'kysely';

import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

import type { components } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import { getAddressWithKey } from '#src/lib/normalize.ts';

const AddressTypeCache: Record<string, number> = {};
const AddressTypesById: Record<number, string> = {};

// Cache the address types in memory for the duration of the server's lifetime.
export async function resolveAddressTypes(app: IdentityInternal['App'], names: string[]) {
  const missingNames = new Set(names.filter((name) => !AddressTypeCache[name]));
  if (missingNames.size) {
    const updates = await app.locals.db
      .selectFrom('address_types')
      .select(['address_type_id', 'name'])
      .where('name', 'in', [...missingNames])
      .execute();
    for (const update of updates) {
      AddressTypeCache[update.name] = update.address_type_id;
      AddressTypesById[update.address_type_id] = update.name;
    }
  }
  if (names.find((name) => !AddressTypeCache[name])) {
    throw new Error(
      `Could not resolve address type: ${names
        .filter((name) => !AddressTypeCache[name])
        .join(', ')}`,
    );
  }
  return names.map((name) => AddressTypeCache[name]);
}

export async function getAddressesForIndividual(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  addressTypes: string[],
) {
  const { db } = app.locals;
  const result = await db
    .selectFrom('individual_addresses as IA')
    .innerJoin('address_types as T', 'T.address_type_id', 'IA.address_type_id')
    .innerJoin('addresses as A', 'A.address_id', 'IA.address_id')
    .select([
      'A.address_id',
      'A.line_1',
      'A.line_2',
      'A.city',
      'A.state',
      'A.postal_code',
      'A.country',
      'IA.individual_id',
      'IA.instance_name',
      'T.name',
    ])
    .where('IA.individual_id', '=', individualId)
    .where('IA.deleted_at', 'is', null)
    .where('T.name', 'in', addressTypes)
    .orderBy('IA.individual_address_id', 'desc')
    .execute();

  if (result.length === 0) {
    return [];
  }

  return result.map((row) => ({
    address_id: row.address_id,
    line_1: row.line_1 || undefined,
    line_2: row.line_2 || undefined,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country,
    address_type: row.name,
    individual_id: row.individual_id,
    instance_name: row.instance_name,
  }));
}

export async function getAddressesForIndividuals(
  app: IdentityInternal['App'],
  individualIdToUuidMap: Record<IndividualId, WithIndividualUuid>,
  addressTypes: string[],
) {
  const { db } = app.locals;
  const result = await db
    .selectFrom('individual_addresses as IA')
    .innerJoin('address_types as T', 'T.address_type_id', 'IA.address_type_id')
    .innerJoin('addresses as A', 'A.address_id', 'IA.address_id')
    .select([
      'A.address_id',
      'A.line_1',
      'A.line_2',
      'A.city',
      'A.state',
      'A.postal_code',
      'A.country',
      'IA.individual_id',
      'IA.instance_name',
      'T.name',
    ])
    .where('IA.individual_id', 'in', Object.keys(individualIdToUuidMap))
    .where('IA.deleted_at', 'is', null)
    .where('T.name', 'in', addressTypes)
    .orderBy('IA.individual_address_id', 'desc')
    .execute();

  if (result.length === 0) {
    return {};
  }

  const map: Record<IndividualUuid, typeof result> = {};

  for (const row of result) {
    const uuid = individualIdToUuidMap[row.individual_id].individual_uuid;
    map[uuid] = map[uuid] || [];
    map[uuid].push({
      ...row,
      line_1: row.line_1 || undefined,
      line_2: row.line_2 || undefined,
      address_type: row.name,
    } as unknown as (typeof result)[number]);
  }

  return map;
}

export async function getAddressId(
  app: IdentityInternal['App'],
  address: components['schemas']['ScopedAddress'],
): Promise<number> {
  const normalized = getAddressWithKey(app, address);

  const hasLocation =
    address.geolocation &&
    address.geolocation.latitude !== undefined &&
    address.geolocation.longitude !== undefined;

  const geolocation = hasLocation
    ? sql`ST_SetSRID(ST_MakePoint(${address.geolocation?.longitude || 0}, ${address.geolocation?.latitude || 0}), 4326)::GEOGRAPHY`
    : null;

  const result = await app.locals.db
    .insertInto('addresses')
    .values({
      address_key: normalized.key,
      line_1: normalized.line_1 || null,
      line_2: normalized.line_2 || null,
      city: normalized.city,
      state: normalized.state,
      postal_code: normalized.postal_code,
      country: normalized.country,
      geolocation: geolocation as unknown as string | null,
    })
    .onConflict((oc) =>
      oc.column('address_key').doUpdateSet((eb) => ({
        geolocation: sql`COALESCE(${eb.ref('excluded.geolocation')}, ${eb.ref('addresses.geolocation')})`,
      })),
    )
    .returning('address_id')
    .executeTakeFirstOrThrow();

  return result.address_id;
}

export async function saveAddresses(
  app: IdentityInternal['App'],
  individualId: IndividualId,
  addresses: { address_type: string; [key: string]: unknown }[],
  scope: components['schemas']['AddressScope'] = 'consumer',
) {
  if (addresses.length === 0) {
    return;
  }

  await resolveAddressTypes(
    app,
    addresses.map((address) => address.address_type),
  );

  const addressIds = await Promise.all(
    addresses.map(async (address) =>
      getAddressId(app, {
        ...address,
        scope,
      } as unknown as components['schemas']['ScopedAddress']),
    ),
  );

  const validAddresses: { address_type: string; instance_name?: string; id: number }[] = [];
  addresses.forEach((address, ix) => {
    if (addressIds[ix]) {
      validAddresses.push({
        ...address,
        instance_name: address.instance_name as string | undefined,
        id: addressIds[ix],
      });
    }
  });

  if (validAddresses.length === 0) {
    return;
  }

  const withoutInstance = validAddresses.filter((a) => !a.instance_name);
  const withInstance = validAddresses.filter((a) => a.instance_name);

  if (withoutInstance.length > 0) {
    await app.locals.db
      .insertInto('individual_addresses')
      .values(
        withoutInstance.map((a) => ({
          address_id: a.id,
          individual_id: individualId,
          address_type_id: AddressTypeCache[a.address_type],
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(['individual_id', 'address_type_id'])
          .where('deleted_at', 'is', null)
          .where('instance_name', 'is', null)
          .doUpdateSet({ address_id: (eb) => eb.ref('excluded.address_id') }),
      )
      .execute();
  }

  if (withInstance.length > 0) {
    await app.locals.db
      .insertInto('individual_addresses')
      .values(
        withInstance.map((a) => ({
          address_id: a.id,
          individual_id: individualId,
          address_type_id: AddressTypeCache[a.address_type],
          instance_name: a.instance_name || undefined,
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(['individual_id', 'address_type_id', 'instance_name'])
          .where('deleted_at', 'is', null)
          .where('instance_name', 'is not', null)
          .doUpdateSet({ address_id: (eb) => eb.ref('excluded.address_id') }),
      )
      .execute();
  }
}

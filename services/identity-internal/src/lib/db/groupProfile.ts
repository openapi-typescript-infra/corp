import type { ExpressionBuilder } from 'kysely';
import { sql } from 'kysely';
import type { DB, GroupProfiles, ProfileSchemas } from '#src/generated/database.ts';
import type { IdentityInternal } from '#src/types/index.ts';
import { type JsonPatchRawType, pgDecrypt } from './profile.ts';

export async function modifyGroupProfile<ProfileType = Record<string, unknown>>(
  app: IdentityInternal['App'],
  groupUuid: string,
  profileSchemaName: string,
  instanceName: string | undefined,
  key: { id: string; hex_key: string } | undefined,
  operations: JsonPatchRawType[],
) {
  if (key) {
    const result = await sql<{ profile: string }>`SELECT update_group_encrypted_profile(
        ${groupUuid}, ${profileSchemaName}, ${instanceName}, 1,
        ${key.id}, ${key.hex_key}, ${JSON.stringify(operations)}) as profile;`.execute(
      app.locals.db,
    );
    const decrypted = pgDecrypt(Buffer.from(result.rows[0].profile, 'hex'), key.hex_key);
    return JSON.parse(decrypted) as ProfileType;
  }
  const result = await sql<{ profile: object }>`SELECT update_group_profile(
      ${groupUuid},
      ${profileSchemaName},
      ${instanceName},
      1,
      ${JSON.stringify(operations)}) as profile;`.execute(app.locals.db);
  return result.rows?.[0].profile as ProfileType;
}

function getSchemaExpression(
  schemaInstanceSpecs: string[],
  eb: ExpressionBuilder<DB & { P: GroupProfiles; S: ProfileSchemas }, 'P' | 'S'>,
) {
  return eb.or(
    schemaInstanceSpecs.map((spec) => {
      if (spec.includes('#')) {
        const [schema, instance] = spec.split('#');
        return eb.and([
          eb('S.name', '=', schema),
          eb('P.instance_name', instance ? '=' : 'is', instance || null),
        ]);
      }
      return eb('S.name', '=', spec);
    }),
  );
}

export async function getProfilesForGroup(
  app: IdentityInternal['App'],
  groupUuid: string,
  schemaInstanceSpecs: string[],
) {
  const rows = await app.locals.db
    .selectFrom('group_profiles as P')
    .innerJoin('groups as G', 'P.group_id', 'G.group_id')
    .innerJoin('profile_schemas as S', 'P.profile_schema_id', 'S.profile_schema_id')
    .select([
      'S.name',
      'P.instance_name',
      'P.profile',
      'P.encrypted_profile',
      'P.updated_at',
      'P.created_at',
    ])
    .where('G.group_uuid', '=', groupUuid)
    .where('P.deleted_at', 'is', null)
    .where((eb) => getSchemaExpression(schemaInstanceSpecs, eb))
    .orderBy('P.updated_at', 'desc')
    .orderBy('P.group_profile_id', 'desc')
    .execute();

  return rows.map((row) => {
    const common = {
      name: row.name,
      instance_name: row.instance_name || undefined,
      updated_at: (row.updated_at || row.created_at).toISOString(),
    };
    return row.encrypted_profile
      ? {
          ...common,
          encrypted_profile: {
            ciphertext: row.encrypted_profile.toString('base64'),
            key_id: row.profile as string,
          },
        }
      : { ...common, profile: row.profile as Record<string, unknown> };
  });
}

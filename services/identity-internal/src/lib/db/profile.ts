import crypto from 'node:crypto';

import type { ExpressionBuilder } from 'kysely';
import { sql } from 'kysely';
import type { DB, IndividualProfiles, ProfileSchemas } from '#src/generated/database.ts';

import type { IdentityInternal } from '#src/types/index.ts';
import type { IndividualId, IndividualUuid, WithIndividualUuid } from './types.ts';

export interface JsonPatchRawType {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test' | 'inc' | 'clear' | 'merge' | 'push';
  path: string;
  value?: string | number | boolean | object | null | undefined;
  from?: string;
}

export function pgDecrypt(ciphertext: Buffer, key: string) {
  const IV_LENGTH = 16; // For AES-CBC
  const iv = ciphertext.subarray(0, IV_LENGTH) as unknown as Uint8Array;
  const encryptedText = ciphertext.subarray(IV_LENGTH) as unknown as Uint8Array;
  const keyBuffer = Buffer.from(key, 'hex') as unknown as Uint8Array;

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  const decryptedChunks = [decipher.update(encryptedText), decipher.final()];
  return Buffer.concat(decryptedChunks as unknown as Uint8Array[]).toString('utf8');
}

export async function modifyProfile<ProfileType = Record<string, unknown>>(
  app: IdentityInternal['App'],
  individualUuid: string,
  profileSchemaName: string,
  instanceName: string | undefined,
  key: { id: string; hex_key: string } | undefined,
  operations: JsonPatchRawType[],
) {
  if (key) {
    const result = await sql<{
      profile: string;
    }>`SELECT update_individual_encrypted_profile(
        ${individualUuid},
        ${profileSchemaName},
        ${instanceName},
        1,
        ${key.id},
        ${key.hex_key},
        ${JSON.stringify(operations)}) as profile;`.execute(app.locals.db);
    try {
      const hexCipherText = result.rows?.[0].profile;
      const decrypted = pgDecrypt(Buffer.from(hexCipherText, 'hex'), key.hex_key);
      return JSON.parse(decrypted) as ProfileType;
    } catch (error) {
      app.locals.logger.warn(
        Object.assign(error as Error, {
          individualUuid,
          schema: profileSchemaName,
          instance: instanceName,
        }),
        'Decryption failed for a profile schema',
      );
      throw error;
    }
  }

  const result = await sql<{
    profile: object;
  }>`SELECT update_individual_profile(
      ${individualUuid},
      ${profileSchemaName},
      ${instanceName},
      1,
      ${JSON.stringify(operations)}) as profile;`.execute(app.locals.db);

  return result.rows?.[0].profile as ProfileType;
}

function toApiProfile(profileEntry: Awaited<ReturnType<typeof getIndividualProfiles>>[number]) {
  if (profileEntry.encrypted_profile) {
    return {
      name: profileEntry.name,
      instance_name: profileEntry.instance_name || undefined,
      encrypted_profile: {
        ciphertext: profileEntry.encrypted_profile.toString('base64'),
        key_id: profileEntry.profile as string,
      },
      updated_at: (profileEntry.updated_at || profileEntry.created_at).toISOString(),
    };
  }

  return {
    name: profileEntry.name,
    instance_name: profileEntry.instance_name || undefined,
    profile: profileEntry.profile as unknown as Record<string, unknown>,
    updated_at: (profileEntry.updated_at || profileEntry.created_at).toISOString(),
  };
}

function getSchemaExpression(
  schemaInstanceSpecs: string[],
  eb: ExpressionBuilder<
    DB & {
      P: IndividualProfiles;
    } & {
      S: ProfileSchemas;
    },
    'P' | 'S'
  >,
) {
  return eb.or(
    schemaInstanceSpecs.map((spec) => {
      if (spec.includes('#')) {
        const [schema, instance] = spec.split('#');
        return eb.and([
          eb('S.name', '=', schema),
          eb('P.instance_name', instance ? '=' : 'is', instance || null),
        ]);
      } else {
        return eb('S.name', '=', spec);
      }
    }),
  );
}

export async function getIndividualProfiles(
  app: IdentityInternal['App'],
  individualUuid: IndividualUuid,
  schemaInstanceSpecs: string[],
) {
  const { db } = app.locals;
  const result = await db
    .selectFrom('individual_profiles as P')
    .innerJoin('individuals as I', 'P.individual_id', 'I.individual_id')
    .innerJoin('profile_schemas as S', 'P.profile_schema_id', 'S.profile_schema_id')
    .select([
      'S.name',
      'P.instance_name',
      'P.profile',
      'P.encrypted_profile',
      'P.updated_at',
      'P.created_at',
    ])
    .where('I.individual_uuid', '=', individualUuid)
    .where('P.deleted_at', 'is', null)
    .where((eb) => getSchemaExpression(schemaInstanceSpecs, eb))
    .orderBy('P.updated_at', 'desc')
    .execute();
  return result;
}

export async function getProfilesForIndividuals(
  app: IdentityInternal['App'],
  individualIdToUuidMap: Record<IndividualId, WithIndividualUuid>,
  schemaInstanceSpecs: string[],
): Promise<Record<IndividualUuid, ReturnType<typeof toApiProfile>[]>> {
  const { db } = app.locals;
  const result = await db
    .selectFrom('individual_profiles as P')
    .innerJoin('profile_schemas as S', 'P.profile_schema_id', 'S.profile_schema_id')
    .select([
      'P.individual_id',
      'S.name',
      'P.instance_name',
      'P.profile',
      'P.encrypted_profile',
      'P.updated_at',
      'P.created_at',
    ])
    .where('P.individual_id', 'in', Object.keys(individualIdToUuidMap))
    .where('P.deleted_at', 'is', null)
    .where((eb) => getSchemaExpression(schemaInstanceSpecs, eb))
    .orderBy('P.updated_at', 'desc')
    .orderBy('P.individual_profile_id', 'desc')
    .execute();

  const map: Record<IndividualUuid, ReturnType<typeof toApiProfile>[]> = {};
  result.forEach((row) => {
    const { individual_id, ...rest } = row;
    const uuid = individualIdToUuidMap[individual_id].individual_uuid;
    map[uuid] = map[uuid] || [];
    map[uuid].push(toApiProfile(rest));
  });
  return map;
}

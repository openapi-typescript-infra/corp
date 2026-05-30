import type { TableCache } from '@justtellme/cloud-sql';
import type { JTMRequestLocals, JTMServiceLocals } from '@justtellme/service';
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { Kysely, Selectable } from 'kysely';
import type { RedisClientType } from 'redis';

import type {
  DB,
  GroupTypes,
  IdentifierNamespaces,
  ProfileSchemas,
} from '../generated/database.ts';
import type { operationHandlers } from '../generated/service/index.ts';

import type { IdentityInternalConfigSchema } from './config.ts';

export interface IdentityInternalLocals extends JTMServiceLocals<IdentityInternalConfigSchema> {
  db: Kysely<DB>;
  redis?: RedisClientType;

  tables: {
    groupTypes: TableCache<Selectable<GroupTypes>, 'group_type_id', 'name'>;
    identifierNamespaces: TableCache<
      Selectable<IdentifierNamespaces>,
      'identifier_namespace_id',
      'name'
    >;
    profileSchemas: TableCache<Selectable<ProfileSchemas>, 'profile_schema_id', 'name'>;
  };
}

export type IdentityInternalRequestLocals = JTMRequestLocals;

export type IdentityInternal = ServiceTypes<IdentityInternalLocals, IdentityInternalRequestLocals>;

export type IdentityInternalApi = operationHandlers<
  IdentityInternalLocals,
  IdentityInternalRequestLocals
>;

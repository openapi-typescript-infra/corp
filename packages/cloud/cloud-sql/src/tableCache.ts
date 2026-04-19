// It can be useful to cache slow-changing tables (i.e. enums backed by tables), so we centralize that pattern here.
// This way you don't have to do a query first to lookup something and then to insert with the right id.
// The following should be true:
//  * Nothing is ever deleted from the table
//  * The name column must be unique
//  * Nothing is renamed in the table without proper planning (it should work, you just don't want to do it often and you definitely don't want names to overlap)

import type { Pool, QueryResultRow } from 'pg';
import pg from 'pg';

type WithIdAndName<IdKey extends string, NameKey extends string> = Record<IdKey, number | string> &
  Record<NameKey, string>;

// There is some problem with @types/pg missing this declaration even though it really is there.
const escapeIdentifier = (pg as unknown as { escapeIdentifier: (str: string) => string })
  .escapeIdentifier;

export interface TableCache<
  T extends WithIdAndName<IdColumn, NameColumn>,
  IdColumn extends string,
  NameColumn extends string,
> {
  resolveIdsFromNames(withNames: string[] | Record<NameColumn, string>[]): Promise<T[]>;
  resolveNamesFromIds(withIds: number[] | string[] | Record<IdColumn, number>[]): Promise<T[]>;
}

export function createTableCache<
  T extends WithIdAndName<IdColumn, NameColumn>,
  IdColumn extends string,
  NameColumn extends string,
  QueryType extends QueryResultRow = T,
>(
  db: Pool,
  options: {
    tableName: string;
    idColumn: IdColumn;
    nameColumn: NameColumn;
    onFetch?: (row: QueryType) => T;
  },
): TableCache<T, IdColumn, NameColumn> {
  const byId: Record<number | string, T> = {};
  const byName: Record<string, T> = {};

  [options.tableName, options.idColumn, options.nameColumn].forEach((name) => {
    const validIdentifier = /^[A-Za-z_]+$/.test(name);
    if (!validIdentifier) {
      throw new Error(
        'Invalid tableName, idColumn or nameColumn. Only letters and underscores are allowed.',
      );
    }
  });

  function cacheRow(row: QueryType) {
    const cacheRow = options.onFetch ? options.onFetch(row) : (row as unknown as T);
    byId[row[options.idColumn]] = cacheRow;
    byName[row[options.nameColumn]] = cacheRow;
  }

  return {
    async resolveIdsFromNames(withNames: string[] | Record<NameColumn, string>[]): Promise<T[]> {
      if (!withNames.length) {
        return [];
      }

      const namesOnly: string[] =
        typeof withNames[0] === 'string'
          ? (withNames as string[])
          : (withNames as Record<NameColumn, string>[]).map((obj) => obj[options.nameColumn]);
      const missingNames = new Set(namesOnly.filter((name) => !byName[name]));
      if (missingNames.size) {
        const { rows } = await db.query<QueryType>(
          // The identifier check above prevents this from being SQL-injectable, even though it would be FROM INSIDE THE HOUSE
          // in all but the most pathological cases.
          `SELECT * FROM ${escapeIdentifier(options.tableName)} WHERE ${escapeIdentifier(options.nameColumn)} = ANY($1)`,
          [Array.from(missingNames)],
        );
        rows.forEach(cacheRow);
      }
      return namesOnly.map((name) => {
        const resolved = byName[name];
        if (!resolved) {
          throw new Error(`Could not resolve name ${name} in ${options.tableName}`);
        }
        return resolved;
      });
    },
    async resolveNamesFromIds(
      withIds: number[] | string[] | Record<IdColumn, number>[],
    ): Promise<T[]> {
      if (!withIds.length) {
        return [];
      }

      const idsOnly: (number | string)[] =
        typeof withIds[0] === 'object'
          ? (withIds as Record<IdColumn, number>[]).map((obj) => obj[options.idColumn])
          : (withIds as (number | string)[]);
      const missingIds = new Set(idsOnly.filter((id) => !byId[Number(id)]));
      if (missingIds.size) {
        const { rows } = await db.query<QueryType>(
          // The identifier check above prevents this from being SQL-injectable, even though it would be FROM INSIDE THE HOUSE
          // in all but the most pathological cases.
          `SELECT * FROM ${escapeIdentifier(options.tableName)} WHERE ${escapeIdentifier(options.idColumn)} = ANY($1)`,
          [Array.from(missingIds)],
        );
        rows.forEach(cacheRow);
      }
      return idsOnly.map((id) => {
        const resolved = byId[Number(id)];
        if (!resolved) {
          throw new Error(`Could not resolve id ${id} in ${options.tableName}`);
        }
        return resolved;
      });
    },
  };
}

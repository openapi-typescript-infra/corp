import type { JTMConfigurationSchema, JTMServiceLocals } from '@justtellme/service';
import { useJTMService } from '@justtellme/service';
import { getReusableApp } from '@openapi-typescript-infra/service-tester';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getPgPool } from './pool.ts';
import { createTableCache } from './tableCache.ts';

describe('Table caching', () => {
  let db: Awaited<ReturnType<typeof getPgPool<JTMServiceLocals<JTMConfigurationSchema>>>>;

  beforeEach(async () => {
    const app = await getReusableApp({
      service: useJTMService<JTMServiceLocals<JTMConfigurationSchema>>,
      rootDirectory: path.resolve(new URL('../__tests__', import.meta.url).pathname),
    });
    db = await getPgPool(app, {
      useCloudConnector: false,
      host: 'localhost',
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
    });
    await db.pool.query('DROP TABLE test_table').catch(() => {});
    await db.pool.query(`CREATE TABLE IF NOT EXISTS test_table (
      test_id SERIAL PRIMARY KEY,
      test_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`);
    await db.pool.query(
      "INSERT INTO test_table (test_name) VALUES ('test1'), ('test2'), ('test3');",
    );
  });

  afterEach(async () => {
    await db.shutdown().catch(() => {});
  });

  interface TestRow {
    test_id: number;
    test_name: string;
    created_at: Date;
  }

  test('should resolve ids', async () => {
    const { resolveIdsFromNames, resolveNamesFromIds } = createTableCache<
      TestRow,
      'test_id',
      'test_name'
    >(db.pool, {
      tableName: 'test_table',
      idColumn: 'test_id',
      nameColumn: 'test_name',
    });
    const rows = await resolveIdsFromNames(['test1', 'test2']);
    expect(rows.length).toBe(2);
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].test_id).toBe(1);
    expect(rows[1].test_id).toBe(2);

    const last = await resolveIdsFromNames(['test3']);
    expect(last.length).toBe(1);

    await db.pool.end();
    const afterDeath = await resolveIdsFromNames(['test2', 'test1']);
    expect(afterDeath.length).toBe(2);
    expect(afterDeath[1].test_id, 'should preserve input order').toBe(1);
    expect(afterDeath[0].test_id).toBe(2);

    const byId = await resolveNamesFromIds([1, 2, 3]);
    expect(byId.length).toBe(3);
    expect(byId[0].test_name).toBe('test1');
    expect(byId[1].test_name).toBe('test2');
    expect(byId[2].test_name).toBe('test3');
  });

  test('should fail properly', async () => {
    const { resolveIdsFromNames, resolveNamesFromIds } = createTableCache(db.pool, {
      tableName: 'test_table',
      idColumn: 'test_id',
      nameColumn: 'test_name',
    });
    await expect(resolveIdsFromNames(['test4'])).rejects.toThrow();
    await expect(resolveNamesFromIds([4])).rejects.toThrow();
  });
});

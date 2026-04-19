import type { HSConfigurationSchema, HSServiceLocals } from '@justtellme/service';
import { useHSService } from '@justtellme/service';
import { getReusableApp } from '@openapi-typescript-infra/service-tester';
import path from 'path';
import { describe, expect, test } from 'vitest';

import { getPgPool } from './index.ts';

describe('Module exports', () => {
  test('should export expected elements', () => {
    expect(getPgPool).toBeTruthy();
    expect(typeof getPgPool).toBe('function');
  });

  test('should configure a db', async () => {
    const app = await getReusableApp({
      service: useHSService<HSServiceLocals<HSConfigurationSchema>>,
      rootDirectory: path.resolve(new URL('../__tests__', import.meta.url).pathname),
    });
    let pool = await getPgPool(app, {
      useCloudConnector: false,
      host: 'localhost',
    });
    expect(pool.pool, 'should get a pool').toBeTruthy();
    expect(pool.roPool, 'should get an R/O pool').toBeTruthy();
    expect(pool.pool, 'Pools should be the same').toEqual(pool.roPool);
    await pool.shutdown();

    pool = await getPgPool(app, {
      useCloudConnector: false,
      host: 'localhost',
      readOnlyReplica: true,
    });
    expect(pool.pool).not.toEqual(pool.roPool);
  });
});

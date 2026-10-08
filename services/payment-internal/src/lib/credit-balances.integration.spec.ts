import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startApp } from '@openapi-typescript-infra/service';
import { request } from '@openapi-typescript-infra/service-tester';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DB } from '../generated/database.ts';
import { service } from '../index.ts';
import type { PaymentInternal } from '../types/index.ts';

const connectionString = process.env.PAYMENT_TEST_DATABASE_URL;

describe.skipIf(!connectionString)('credit balance HTTP API', () => {
  const schema = `credit_balances_test_${process.pid}_${Date.now()}`;
  const individual = randomUUID();
  const otherIndividual = randomUUID();
  const scopeA = '10000000-0000-4000-8000-000000000001';
  const scopeB = '20000000-0000-4000-8000-000000000002';
  let admin: Pool;
  let db: Kysely<DB>;
  let app: PaymentInternal['App'];

  const createAccount = async (
    currency: string,
    amount: string,
    scope: string | null = null,
    owner = individual,
  ) => {
    const row = await db
      .insertInto('credit_accounts')
      .values({ individual_uuid: owner, currency, scope_uuid: scope })
      .returning('credit_account_id')
      .executeTakeFirstOrThrow();
    if (amount !== '0') {
      await db
        .insertInto('credit_entries')
        .values({
          credit_account_id: row.credit_account_id,
          idempotency_key: randomUUID(),
          amount,
        })
        .execute();
    }
    return row.credit_account_id;
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString, options: `-c search_path=${schema},public` });
    await admin.query(
      `CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO "payment-manager"`,
    );
    const migration = readFileSync(
      new URL('../../migrations/sqls/20261008000000-add-credit-ledger-up.sql', import.meta.url),
      'utf8',
    ).replaceAll('SET search_path = public, pg_temp', `SET search_path = ${schema}, pg_temp`);
    await admin.query(migration);
    db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString,
          options: `-c search_path=${schema},public -c role=payment-manager`,
        }),
      }),
    });
    // Exercise the actual service's OpenAPI validation and filesystem routing,
    // replacing only startup infrastructure with an isolated runtime database.
    app = await startApp({
      name: 'payment-internal',
      version: '0.0.0',
      rootDirectory: fileURLToPath(new URL('../..', import.meta.url)),
      codepath: 'src',
      service: () => ({
        ...service(),
        start(app) {
          app.locals.db = db;
        },
      }),
    });
    await createAccount('USD', '9007199254740993.123456789');
    await createAccount('CAD', '0');
    await createAccount('MINUTES', '15.5');
    await createAccount('MINUTES', '60', scopeA);
    await createAccount('MINUTES', '30', scopeB);
    await createAccount('USD', '1200', scopeA);
    await createAccount('USD', '999', null, otherIndividual);
  });

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  const get = ({
    individual_uuid,
    ...query
  }: {
    individual_uuid: string;
    currency?: string;
    scope_uuid?: string;
  }) =>
    request(app)
      .get(`/payment/individuals/${encodeURIComponent(individual_uuid)}/credit_balances`)
      .query(query);

  test('returns each currency and scope separately, with exact strings and zero balances', async () => {
    const response = await get({ individual_uuid: individual }).expect(200);
    expect(response.body).toEqual({
      individual_uuid: individual,
      balances: [
        { currency: 'CAD', scope_uuid: null, balance: '0' },
        { currency: 'MINUTES', scope_uuid: null, balance: '15.5' },
        { currency: 'MINUTES', scope_uuid: scopeA, balance: '60' },
        { currency: 'MINUTES', scope_uuid: scopeB, balance: '30' },
        { currency: 'USD', scope_uuid: null, balance: '9007199254740993.123456789' },
        { currency: 'USD', scope_uuid: scopeA, balance: '1200' },
      ],
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('currency filtering preserves separate scopes', async () => {
    const response = await get({ individual_uuid: individual, currency: 'MINUTES' }).expect(200);
    expect(response.body.balances).toEqual([
      { currency: 'MINUTES', scope_uuid: null, balance: '15.5' },
      { currency: 'MINUTES', scope_uuid: scopeA, balance: '60' },
      { currency: 'MINUTES', scope_uuid: scopeB, balance: '30' },
    ]);
  });

  test('scope filtering works across currencies and together with currency', async () => {
    const response = await get({ individual_uuid: individual, scope_uuid: scopeA }).expect(200);
    expect(response.body.balances).toEqual([
      { currency: 'MINUTES', scope_uuid: scopeA, balance: '60' },
      { currency: 'USD', scope_uuid: scopeA, balance: '1200' },
    ]);
    const filtered = await get({
      individual_uuid: individual,
      scope_uuid: scopeA,
      currency: 'USD',
    }).expect(200);
    expect(filtered.body.balances).toEqual([
      { currency: 'USD', scope_uuid: scopeA, balance: '1200' },
    ]);
  });

  test('never returns another individual’s balances', async () => {
    const response = await get({ individual_uuid: otherIndividual }).expect(200);
    expect(response.body).toEqual({
      individual_uuid: otherIndividual,
      balances: [{ currency: 'USD', scope_uuid: null, balance: '999' }],
    });
    const scoped = await get({
      individual_uuid: otherIndividual,
      currency: 'MINUTES',
      scope_uuid: scopeA,
    }).expect(200);
    expect(scoped.body.balances).toEqual([]);
  });

  test('unmatched filters and individuals return empty lists without creating accounts', async () => {
    const before = await db
      .selectFrom('credit_accounts')
      .select(db.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    for (const query of [
      { individual_uuid: randomUUID() },
      { individual_uuid: individual, currency: 'UNKNOWN' },
      { individual_uuid: individual, currency: 'usd' },
      { individual_uuid: individual, scope_uuid: randomUUID() },
    ]) {
      const response = await get(query).expect(200);
      expect(response.body).toEqual({ individual_uuid: query.individual_uuid, balances: [] });
    }
    const after = await db
      .selectFrom('credit_accounts')
      .select(db.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(after).toEqual(before);
  });

  test.each([
    { individual_uuid: 'not-a-uuid' },
    { individual_uuid: individual, scope_uuid: 'not-a-uuid' },
    { individual_uuid: individual, currency: '' },
  ])('rejects invalid path or query %j before reading balances', async (query) => {
    await get(query).expect(400);
  });

  test('requires an individual in the path and does not expose the old query-only route', async () => {
    await request(app).get('/payment/individuals/credit_balances').expect(404);
    await get({ individual_uuid: '' }).expect(404);
    await request(app)
      .get('/payment/credit_balances')
      .query({ individual_uuid: individual })
      .expect(404);
  });

  test('query parameters cannot override the individual in the path', async () => {
    const response = await request(app)
      .get(`/payment/individuals/${otherIndividual}/credit_balances`)
      .query({ individual_uuid: individual })
      .expect(200);
    expect(response.body).toEqual({
      individual_uuid: otherIndividual,
      balances: [{ currency: 'USD', scope_uuid: null, balance: '999' }],
    });
  });

  test('rejects repeated currency filters instead of broadening the query', async () => {
    await request(app)
      .get(`/payment/individuals/${individual}/credit_balances?currency=USD&currency=CAD`)
      .expect(400);
  });

  test('reads available credit through reservation, posting and voiding', async () => {
    const owner = randomUUID();
    const accountId = await createAccount('MINUTES', '60', scopeA, owner);
    const debit = await db
      .insertInto('credit_entries')
      .values({
        credit_account_id: accountId,
        idempotency_key: randomUUID(),
        amount: '-20',
        status: 'reserved',
      })
      .returning('credit_entry_id')
      .executeTakeFirstOrThrow();
    const readBalance = async () => {
      const response = await get({ individual_uuid: owner }).expect(200);
      return response.body.balances[0].balance;
    };
    expect(await readBalance()).toBe('40');
    await db
      .updateTable('credit_entries')
      .set({ status: 'posted' })
      .where('credit_entry_id', '=', debit.credit_entry_id)
      .execute();
    expect(await readBalance()).toBe('40');
    const reservation = await db
      .insertInto('credit_entries')
      .values({
        credit_account_id: accountId,
        idempotency_key: randomUUID(),
        amount: '-10',
        status: 'reserved',
      })
      .returning('credit_entry_id')
      .executeTakeFirstOrThrow();
    expect(await readBalance()).toBe('30');
    await db
      .updateTable('credit_entries')
      .set({ status: 'voided' })
      .where('credit_entry_id', '=', reservation.credit_entry_id)
      .execute();
    expect(await readBalance()).toBe('40');
    const sum = await sql<{
      balance: string;
    }>`SELECT SUM(amount)::text AS balance FROM credit_entries WHERE credit_account_id = ${accountId} AND status <> 'voided'`.execute(
      db,
    );
    expect(await readBalance()).toBe(sum.rows[0].balance);
  });
});

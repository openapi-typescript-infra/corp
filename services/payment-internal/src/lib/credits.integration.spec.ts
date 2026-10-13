import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DB } from '../generated/database.ts';
import {
  type CreditOperation,
  createCredit,
  postCreditReservation,
  reserveCredits,
  voidCreditReservation,
} from './credits.ts';

const connectionString = process.env.PAYMENT_TEST_DATABASE_URL;
describe.skipIf(!connectionString)('internal credit operations', () => {
  const schema = `credit_helpers_test_${process.pid}_${Date.now()}`;
  let admin: Pool;
  let db: Kysely<DB>;
  beforeAll(async () => {
    admin = new Pool({ connectionString, options: `-c search_path=${schema},public` });
    await admin.query(
      `CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO "payment-manager"`,
    );
    // Install both ledgers to exercise actual monetary transfers in caller transactions.
    for (const file of ['20260303005357-initial-schema', '20261008000000-add-credit-ledger']) {
      await admin.query(
        readFileSync(
          new URL(`../../migrations/sqls/${file}-up.sql`, import.meta.url),
          'utf8',
        ).replaceAll('SET search_path = public, pg_temp', `SET search_path = ${schema}, pg_temp`),
      );
    }
    db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString,
          options: `-c search_path=${schema},public -c role=payment-manager`,
        }),
      }),
    });
  });
  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  const operation = (overrides: Partial<CreditOperation> = {}): CreditOperation => ({
    individualUuid: randomUUID(),
    currency: 'USD',
    amount: '10',
    idempotencyKey: randomUUID(),
    ...overrides,
  });
  const balance = async (id: string) => {
    const result = await sql<{ balance: string; total: string }>`SELECT a.balance::text,
      COALESCE(SUM(e.amount) FILTER (WHERE e.status <> 'voided'), 0)::text AS total
      FROM credit_accounts a LEFT JOIN credit_entries e USING (credit_account_id)
      WHERE a.credit_account_id = ${id} GROUP BY a.credit_account_id`.execute(db);
    expect(result.rows[0].balance).toBe(result.rows[0].total);
    return result.rows[0].balance;
  };
  const reservation = async () => {
    const purchase = operation();
    const grant = await createCredit(db, purchase);
    const spend = { ...purchase, amount: '7', idempotencyKey: randomUUID() };
    const held = await reserveCredits(db, spend);
    return {
      purchase,
      grant,
      spend,
      held,
      reference: {
        individualUuid: purchase.individualUuid,
        creditEntryUuid: held.entry.credit_entry_uuid,
      },
    };
  };

  test('exact grants replay equivalent decimals and reordered metadata', async () => {
    const transactionId = randomUUID();
    const input = operation({
      currency: 'MINUTES',
      scopeUuid: randomUUID(),
      amount: '9007199254740993.123456789',
      extraData: { transaction_id: transactionId, kind: 'purchase' },
    });
    const first = await createCredit(db, input);
    expect(first.created).toBe(true);
    const retry = await createCredit(db, {
      ...input,
      amount: `0${input.amount}0`,
      extraData: { kind: 'purchase', transaction_id: transactionId },
    });
    expect(retry.created).toBe(false);
    expect(retry.entry.credit_entry_uuid).toBe(first.entry.credit_entry_uuid);
    expect(await balance(first.entry.credit_account_id)).toBe(input.amount);
  });

  test('rejects key reuse with different owner, currency, scope, amount, context or direction', async () => {
    const input = operation();
    const first = await createCredit(db, input);
    for (const change of [
      { individualUuid: randomUUID() },
      { currency: 'CAD' },
      { scopeUuid: randomUUID() },
      { amount: '11' },
      { extraData: { transaction_id: randomUUID() } },
    ]) {
      await expect(createCredit(db, { ...input, ...change })).rejects.toMatchObject({
        code: 'credit_idempotency_conflict',
      });
    }
    await expect(reserveCredits(db, input)).rejects.toMatchObject({
      code: 'credit_idempotency_conflict',
    });
    expect(await balance(first.entry.credit_account_id)).toBe('10');
  });

  test('concurrent duplicate grants and reservations affect balances once', async () => {
    const input = operation();
    const grants = await Promise.all(Array.from({ length: 5 }, () => createCredit(db, input)));
    expect(grants.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(grants.map((r) => r.entry.credit_entry_uuid)).size).toBe(1);
    const spend = { ...input, amount: '8', idempotencyKey: randomUUID() };
    const holds = await Promise.all(Array.from({ length: 5 }, () => reserveCredits(db, spend)));
    expect(holds.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(holds.map((r) => r.entry.credit_entry_uuid)).size).toBe(1);
    expect(await balance(grants[0].entry.credit_account_id)).toBe('2');
  });

  test('concurrent conflicting keys reject one and roll back its account', async () => {
    const input = operation();
    const other = { ...input, individualUuid: randomUUID(), amount: '20' };
    const results = await Promise.allSettled([createCredit(db, input), createCredit(db, other)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'credit_idempotency_conflict' },
    });
    const accounts = await db
      .selectFrom('credit_accounts')
      .selectAll()
      .where('individual_uuid', 'in', [input.individualUuid, other.individualUuid])
      .execute();
    expect(accounts).toHaveLength(1);
    await balance(accounts[0].credit_account_id);
  });

  test('reservations never pool other currencies/scopes or create unfunded accounts', async () => {
    const input = operation({ currency: 'MINUTES', scopeUuid: randomUUID() });
    await createCredit(db, input);
    for (const change of [{ currency: 'USD' }, { scopeUuid: null }, { scopeUuid: randomUUID() }]) {
      await expect(
        reserveCredits(db, { ...input, ...change, idempotencyKey: randomUUID() }),
      ).rejects.toMatchObject({ code: 'insufficient_credit' });
    }
    const accounts = await db
      .selectFrom('credit_accounts')
      .selectAll()
      .where('individual_uuid', '=', input.individualUuid)
      .execute();
    expect(accounts).toHaveLength(1);
    expect(await balance(accounts[0].credit_account_id)).toBe('10');
  });

  test('concurrent distinct spends cannot overdraw and failed spends leave no entry', async () => {
    const input = operation();
    const grant = await createCredit(db, input);
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        reserveCredits(db, { ...input, amount: '7', idempotencyKey: randomUUID() }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'insufficient_credit' },
    });
    expect(await balance(grant.entry.credit_account_id)).toBe('3');
    expect(
      await db
        .selectFrom('credit_entries')
        .selectAll()
        .where('credit_account_id', '=', grant.entry.credit_account_id)
        .execute(),
    ).toHaveLength(2);
  });

  test.each(['posted', 'voided'] as const)(
    '%s is terminal and retrying a reservation preserves it',
    async (status) => {
      const { held, spend, reference } = await reservation();
      const finish = status === 'posted' ? postCreditReservation : voidCreditReservation;
      const opposite = status === 'posted' ? voidCreditReservation : postCreditReservation;
      await Promise.all([finish(db, reference), finish(db, reference)]);
      const retry = await reserveCredits(db, spend);
      expect(retry.created).toBe(false);
      expect(retry.entry.status).toBe(status);
      expect(await balance(held.entry.credit_account_id)).toBe(status === 'posted' ? '3' : '10');
      await expect(opposite(db, reference)).rejects.toMatchObject({
        code: 'credit_reservation_state_conflict',
      });
    },
  );

  test('racing success and cancellation produce one terminal state', async () => {
    const { held, reference } = await reservation();
    const results = await Promise.allSettled([
      postCreditReservation(db, reference),
      voidCreditReservation(db, reference),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'credit_reservation_state_conflict' },
    });
    const final = await db
      .selectFrom('credit_entries')
      .selectAll()
      .where('credit_entry_uuid', '=', reference.creditEntryUuid)
      .executeTakeFirstOrThrow();
    expect(await balance(held.entry.credit_account_id)).toBe(
      final.status === 'posted' ? '3' : '10',
    );
  });

  test('cannot finalize another individual’s reservation, a grant, or a missing entry', async () => {
    const { purchase, grant, held, reference } = await reservation();
    for (const finish of [postCreditReservation, voidCreditReservation]) {
      await expect(
        finish(db, { ...reference, individualUuid: randomUUID() }),
      ).rejects.toMatchObject({ code: 'credit_reservation_not_found' });
      await expect(
        finish(db, {
          individualUuid: purchase.individualUuid,
          creditEntryUuid: grant.entry.credit_entry_uuid,
        }),
      ).rejects.toMatchObject({ code: 'credit_reservation_not_found' });
      await expect(
        finish(db, { ...reference, creditEntryUuid: randomUUID() }),
      ).rejects.toMatchObject({ code: 'credit_reservation_not_found' });
    }
    expect(await balance(held.entry.credit_account_id)).toBe('3');
  });

  test.each(['0', '0.000', '-1', 'NaN', 'Infinity', '1e3', ' 1', '1.'])(
    'rejects invalid amount %s',
    async (amount) => {
      for (const create of [createCredit, reserveCredits])
        await expect(create(db, operation({ amount }))).rejects.toMatchObject({
          code: 'invalid_credit_request',
        });
    },
  );

  test('fulfillment and monetary transfers commit or roll back in the same transaction', async () => {
    const input = operation({ currency: 'MINUTES', amount: '60' });
    const source = await sql<{
      account_id: string;
    }>`SELECT account_id FROM pgledger_create_account(${`source.${randomUUID().replaceAll('-', '')}`}::ltree, 'USD')`.execute(
      db,
    );
    const destination = await sql<{
      account_id: string;
    }>`SELECT account_id FROM pgledger_create_account(${`destination.${randomUUID().replaceAll('-', '')}`}::ltree, 'USD')`.execute(
      db,
    );
    const paymentKey = randomUUID();
    const fulfill = (fail: boolean) =>
      db.transaction().execute(async (trx) => {
        const transfer = await sql<{
          transaction_id: string;
        }>`SELECT transaction_id FROM pgledger_create_transfer(
        ${source.rows[0].account_id}::uuid, ${destination.rows[0].account_id}::uuid, 5000,
        idempotency_id => ${paymentKey}, individual_uuid => ${input.individualUuid}::uuid
      )`.execute(trx);
        const credit = await createCredit(trx, {
          ...input,
          extraData: { transaction_id: transfer.rows[0].transaction_id },
        });
        if (fail) throw new Error('fulfillment failed');
        return credit;
      });
    await expect(fulfill(true)).rejects.toThrow('fulfillment failed');
    expect(
      await db
        .selectFrom('transactions')
        .selectAll()
        .where('idempotency_id', '=', paymentKey)
        .execute(),
    ).toEqual([]);
    expect(
      await db
        .selectFrom('credit_accounts')
        .selectAll()
        .where('individual_uuid', '=', input.individualUuid)
        .execute(),
    ).toEqual([]);
    const credit = await fulfill(false);
    expect(await balance(credit.entry.credit_account_id)).toBe('60');
    const money = await db
      .selectFrom('accounts')
      .select('balance')
      .where('account_id', '=', destination.rows[0].account_id)
      .executeTakeFirstOrThrow();
    expect(money.balance).toBe('5000');
  });

  test('reservation and terminal helpers participate in caller rollback', async () => {
    const { purchase, held, reference } = await reservation();
    await expect(
      db.transaction().execute(async (trx) => {
        await reserveCredits(trx, { ...purchase, amount: '2', idempotencyKey: randomUUID() });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await balance(held.entry.credit_account_id)).toBe('3');
    for (const finish of [postCreditReservation, voidCreditReservation]) {
      await expect(
        db.transaction().execute(async (trx) => {
          await finish(trx, reference);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const entry = await db
        .selectFrom('credit_entries')
        .select('status')
        .where('credit_entry_uuid', '=', reference.creditEntryUuid)
        .executeTakeFirstOrThrow();
      expect(entry.status).toBe('reserved');
      expect(await balance(held.entry.credit_account_id)).toBe('3');
    }
  });
});

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const connectionString = process.env.PAYMENT_TEST_DATABASE_URL;
const migration = (direction: string) =>
  readFileSync(
    new URL(
      `../../migrations/sqls/20261008000000-add-credit-ledger-${direction}.sql`,
      import.meta.url,
    ),
    'utf8',
  );

describe.skipIf(!connectionString)('individual credit ledger migration', () => {
  const schema = `credit_ledger_test_${process.pid}_${Date.now()}`;
  let admin: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    admin = new Pool({ connectionString, options: `-c search_path=${schema},public` });
    await admin.query(
      `CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO "payment-manager"`,
    );
    const up = migration('up').replaceAll(
      'SET search_path = public, pg_temp',
      `SET search_path = ${schema}, pg_temp`,
    );
    await admin.query(up);
    await admin.query(migration('down'));
    await admin.query(up);
    runtime = new Pool({
      connectionString,
      options: `-c search_path=${schema},public -c role=payment-manager`,
    });
  });

  afterAll(async () => {
    await runtime?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  const account = async (
    currency = 'USD',
    scope: string | null = null,
    individual = randomUUID(),
  ) => {
    const { rows } = await runtime.query(
      `INSERT INTO credit_accounts (individual_uuid, currency, scope_uuid) VALUES ($1, $2, $3) RETURNING credit_account_id`,
      [individual, currency, scope],
    );
    return rows[0].credit_account_id as string;
  };
  const entry = async (
    id: string,
    amount: string,
    status = 'posted',
    key: string = randomUUID(),
  ) => {
    const { rows } = await runtime.query(
      `INSERT INTO credit_entries (credit_account_id, amount, status, idempotency_key)
       VALUES ($1, $2, $3, $4) RETURNING credit_entry_id`,
      [id, amount, status, key],
    );
    return rows[0].credit_entry_id as string;
  };
  const balance = async (id: string) => {
    const { rows } = await runtime.query(
      `SELECT a.balance, COALESCE(SUM(e.amount) FILTER (WHERE e.status <> 'voided'), 0) AS total
       FROM credit_accounts a LEFT JOIN credit_entries e USING (credit_account_id)
       WHERE a.credit_account_id = $1 GROUP BY a.credit_account_id`,
      [id],
    );
    expect(rows[0].balance).toBe(rows[0].total);
    return rows[0].balance;
  };

  test('isolates individuals, currencies and scopes, including a unique unscoped account', async () => {
    const individual = randomUUID();
    const ids = await Promise.all([
      account('USD', null, individual),
      account('CAD', null, individual),
      account('MINUTES', randomUUID(), individual),
      account('MINUTES', randomUUID(), individual),
      account('MINUTES', null, individual),
      account('USD'),
    ]);
    for (const id of ids) await entry(id, '10');
    await entry(ids[2], '-10');
    expect(await Promise.all(ids.map(balance))).toEqual(['10', '10', '0', '10', '10', '10']);
    await expect(account('USD', null, individual)).rejects.toMatchObject({ code: '23505' });
    const scope = randomUUID();
    await account('MINUTES', scope, individual);
    await expect(account('MINUTES', scope, individual)).rejects.toMatchObject({ code: '23505' });
  });

  test('keeps exact fractional amounts and rolls back overdrafts', async () => {
    const id = await account();
    await entry(id, '0.3');
    await entry(id, '-0.1');
    expect(await balance(id)).toBe('0.2');
    await expect(entry(id, '-0.3')).rejects.toMatchObject({ code: '23514' });
    expect(await balance(id)).toBe('0.2');
    await entry(id, '-0.2');
    expect(await balance(id)).toBe('0.0');
  });

  test('reserves immediately, voids once, and keeps the debit for audit', async () => {
    const id = await account();
    await entry(id, '60');
    const debit = await entry(id, '-45', 'reserved');
    expect(await balance(id)).toBe('15');
    await expect(entry(id, '-20')).rejects.toMatchObject({ code: '23514' });
    for (let retry = 0; retry < 2; retry++) {
      await runtime.query(
        `UPDATE credit_entries SET status = 'voided' WHERE credit_entry_id = $1`,
        [debit],
      );
      expect(await balance(id)).toBe('60');
    }
    const { rows } = await runtime.query(
      `SELECT amount, status FROM credit_entries WHERE credit_entry_id = $1`,
      [debit],
    );
    expect(rows).toEqual([{ amount: '-45', status: 'voided' }]);
    await expect(
      runtime.query(`UPDATE credit_entries SET status = 'posted' WHERE credit_entry_id = $1`, [
        debit,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  test('posting a reservation does not debit twice and cannot subsequently be voided', async () => {
    const id = await account();
    await entry(id, '60');
    const debit = await entry(id, '-45', 'reserved');
    await runtime.query(`UPDATE credit_entries SET status = 'posted' WHERE credit_entry_id = $1`, [
      debit,
    ]);
    expect(await balance(id)).toBe('15');
    await expect(
      runtime.query(`UPDATE credit_entries SET status = 'voided' WHERE credit_entry_id = $1`, [
        debit,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  test.each(['0', 'NaN', 'Infinity', '-Infinity'])('rejects invalid amount %s', async (amount) => {
    const id = await account();
    await expect(entry(id, amount)).rejects.toMatchObject({ code: '23514' });
    expect(await balance(id)).toBe('0');
  });

  test('rejects positive reservations, initial voids, and blank idempotency keys', async () => {
    const id = await account();
    await expect(entry(id, '1', 'reserved')).rejects.toMatchObject({ code: '23514' });
    await expect(entry(id, '-1', 'voided')).rejects.toMatchObject({ code: '23514' });
    await expect(entry(id, '1', 'posted', ' ')).rejects.toMatchObject({ code: '23514' });
    expect(await balance(id)).toBe('0');
  });

  test('duplicate inserts, including ON CONFLICT, never change balances', async () => {
    const id = await account();
    const key = randomUUID();
    await entry(id, '10', 'posted', key);
    await expect(entry(id, '10', 'posted', key)).rejects.toMatchObject({ code: '23505' });
    await runtime.query(
      `INSERT INTO credit_entries (credit_account_id, amount, idempotency_key)
      VALUES ($1, 10, $2) ON CONFLICT (idempotency_key) DO NOTHING`,
      [id, key],
    );
    expect(await balance(id)).toBe('10');
  });

  test('runtime cannot rewrite entries, balances, account identities, or delete history', async () => {
    const id = await account();
    const credit = await entry(id, '10');
    for (const query of [
      `UPDATE credit_accounts SET balance = 100 WHERE credit_account_id = $1`,
      `UPDATE credit_accounts SET currency = 'CAD' WHERE credit_account_id = $1`,
      `DELETE FROM credit_accounts WHERE credit_account_id = $1`,
      `UPDATE credit_entries SET amount = 100 WHERE credit_account_id = $1`,
      `UPDATE credit_entries SET deleted_at = now() WHERE credit_account_id = $1`,
      `DELETE FROM credit_entries WHERE credit_account_id = $1`,
    ])
      await expect(runtime.query(query, [id])).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime.query(
        `INSERT INTO credit_accounts (individual_uuid, currency, balance) VALUES ($1, 'USD', 100)`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      admin.query(`UPDATE credit_entries SET amount = 100 WHERE credit_entry_id = $1`, [credit]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await balance(id)).toBe('10');
  });

  test('transaction rollback restores both a reservation and a void', async () => {
    const id = await account();
    await entry(id, '10');
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO credit_entries (credit_account_id, amount, status, idempotency_key) VALUES ($1, -8, 'reserved', $2)`,
        [id, randomUUID()],
      );
      await client.query('ROLLBACK');
      expect(await balance(id)).toBe('10');
      const debit = await entry(id, '-8', 'reserved');
      await client.query('BEGIN');
      await client.query(`UPDATE credit_entries SET status = 'voided' WHERE credit_entry_id = $1`, [
        debit,
      ]);
      await client.query('ROLLBACK');
      expect(await balance(id)).toBe('2');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('recomputes from history, including reservations and excluding voids', async () => {
    const id = await account();
    await entry(id, '100.5');
    await entry(id, '-10.25');
    await entry(id, '-20', 'reserved');
    const voided = await entry(id, '-30', 'reserved');
    await runtime.query(`UPDATE credit_entries SET status = 'voided' WHERE credit_entry_id = $1`, [
      voided,
    ]);
    await admin.query(`UPDATE credit_accounts SET balance = 999 WHERE credit_account_id = $1`, [
      id,
    ]);
    const { rows } = await admin.query('SELECT recompute_balance($1) AS balance', [id]);
    expect(rows).toEqual([{ balance: '70.25' }]);
    expect(await balance(id)).toBe('70.25');
    const empty = await account();
    await admin.query(`UPDATE credit_accounts SET balance = 999 WHERE credit_account_id = $1`, [
      empty,
    ]);
    await admin.query('SELECT recompute_balance($1)', [empty]);
    expect(await balance(empty)).toBe('0');
  });

  test('recompute rejects missing accounts and runtime calls', async () => {
    await expect(admin.query('SELECT recompute_balance(-1)')).rejects.toMatchObject({
      code: '23503',
    });
    await expect(admin.query('SELECT recompute_balance(NULL)')).rejects.toMatchObject({
      code: '23503',
    });
    const id = await account();
    await expect(runtime.query('SELECT recompute_balance($1)', [id])).rejects.toMatchObject({
      code: '42501',
    });
  });

  test('recompute rejects negative history without changing the cache', async () => {
    const id = await account();
    const credit = await entry(id, '10');
    await entry(id, '-3');
    // Simulate privileged corruption: runtime cannot delete entries.
    await admin.query('DELETE FROM credit_entries WHERE credit_entry_id = $1', [credit]);
    await expect(admin.query('SELECT recompute_balance($1)', [id])).rejects.toMatchObject({
      code: '23514',
    });
    const { rows } = await runtime.query(
      'SELECT balance FROM credit_accounts WHERE credit_account_id = $1',
      [id],
    );
    expect(rows).toEqual([{ balance: '7' }]);
  });

  test.each(['spend', 'void'])(
    'recompute waits for an in-flight %s and includes its committed result',
    async (operation) => {
      const id = await account();
      await entry(id, '10');
      const reserved = await entry(id, '-2', 'reserved');
      const writer = await runtime.connect();
      const repair = await admin.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await writer.query('BEGIN');
        if (operation === 'spend') {
          await writer.query(
            `INSERT INTO credit_entries (credit_account_id, amount, idempotency_key) VALUES ($1, -3, $2)`,
            [id, randomUUID()],
          );
        } else {
          await writer.query(
            `UPDATE credit_entries SET status = 'voided' WHERE credit_entry_id = $1`,
            [reserved],
          );
        }
        const {
          rows: [{ pid }],
        } = await repair.query('SELECT pg_backend_pid() AS pid');
        pending = repair
          .query('SELECT recompute_balance($1) AS balance', [id])
          .catch((error: unknown) => error);
        await expect
          .poll(async () => {
            const { rows } = await admin.query(
              'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
              [pid],
            );
            return rows[0]?.wait_event_type;
          })
          .toBe('Lock');
        await writer.query('COMMIT');
        const expected = operation === 'spend' ? '5' : '10';
        expect(await pending).toMatchObject({ rows: [{ balance: expected }] });
        expect(await balance(id)).toBe(expected);
      } finally {
        await writer.query('ROLLBACK');
        await pending;
        writer.release();
        repair.release();
      }
    },
  );

  test('a spend waiting behind recompute applies its delta after the repair', async () => {
    const id = await account();
    await entry(id, '10');
    await admin.query('UPDATE credit_accounts SET balance = 999 WHERE credit_account_id = $1', [
      id,
    ]);
    const repair = await admin.connect();
    const writer = await runtime.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await repair.query('BEGIN');
      await repair.query('SELECT recompute_balance($1)', [id]);
      const {
        rows: [{ pid }],
      } = await writer.query('SELECT pg_backend_pid() AS pid');
      pending = writer
        .query(
          `INSERT INTO credit_entries (credit_account_id, amount, idempotency_key) VALUES ($1, -3, $2)`,
          [id, randomUUID()],
        )
        .catch((error: unknown) => error);
      await expect
        .poll(async () => {
          const { rows } = await admin.query(
            'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
            [pid],
          );
          return rows[0]?.wait_event_type;
        })
        .toBe('Lock');
      await repair.query('COMMIT');
      expect(await pending).toMatchObject({ rowCount: 1 });
      expect(await balance(id)).toBe('7');
    } finally {
      await repair.query('ROLLBACK');
      await pending;
      repair.release();
      writer.release();
    }
  });

  test('concurrent spends wait for the account lock and cannot overdraw', async () => {
    const id = await account();
    await entry(id, '10');
    const first = await runtime.connect();
    const second = await runtime.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await first.query('BEGIN');
      await first.query(
        `INSERT INTO credit_entries (credit_account_id, amount, idempotency_key) VALUES ($1, -7, $2)`,
        [id, randomUUID()],
      );
      const {
        rows: [{ pid }],
      } = await second.query('SELECT pg_backend_pid() AS pid');
      pending = second
        .query(
          `INSERT INTO credit_entries (credit_account_id, amount, idempotency_key) VALUES ($1, -7, $2)`,
          [id, randomUUID()],
        )
        .catch((error: unknown) => error);
      await expect
        .poll(async () => {
          const { rows } = await admin.query(
            `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
            [pid],
          );
          return rows[0]?.wait_event_type;
        })
        .toBe('Lock');
      await first.query('COMMIT');
      expect(await pending).toMatchObject({ code: '23514' });
      expect(await balance(id)).toBe('3');
    } finally {
      await first.query('ROLLBACK');
      await pending;
      first.release();
      second.release();
    }
  });
});

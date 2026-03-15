import { describe, expect } from 'vitest';

import { Ledger, autoCreateAccountResolver } from './ledger.ts';

import { testWithApp } from '#src/test.fixtures.ts';

// Helper to create unique names per test to avoid collisions
let counter = 0;
function uniqueName(base: string) {
  return `test.${Date.now()}.${++counter}.${base}`;
}
function uniqueIdempKey() {
  return `idem_${Date.now()}_${++counter}`;
}

describe('Ledger integration', () => {
  // ── Account creation ────────────────────────────────────────────────────

  testWithApp('creates an account', { timeout: 30_000 }, async ({ app }) => {
    const ledger = new Ledger(app);
    const name = uniqueName('alice');

    const account = await ledger.createAccount(name, 'USD');

    expect(account.account_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(account.name).toBe(name);
    expect(account.currency).toBe('USD');
    expect(account.balance).toBe('0');
    expect(account.allow_negative_balance).toBe(true);
    expect(account.allow_positive_balance).toBe(true);
  });

  testWithApp('creates an account with custom constraints', async ({ app }) => {
    const ledger = new Ledger(app);
    const name = uniqueName('vault');

    const account = await ledger.createAccount(name, 'USD', {
      allowNegativeBalance: false,
      allowPositiveBalance: true,
      metadata: { type: 'vault' },
    });

    expect(account.allow_negative_balance).toBe(false);
    expect(account.allow_positive_balance).toBe(true);
    expect(account.metadata).toEqual({ type: 'vault' });
  });

  // ── Account queries ─────────────────────────────────────────────────────

  testWithApp('getAccount by name and currency', async ({ app }) => {
    const ledger = new Ledger(app);
    const name = uniqueName('bob');

    await ledger.createAccount(name, 'USD');
    const found = await ledger.getAccount(name, 'USD');

    expect(found).toBeDefined();
    expect(found?.name).toBe(name);
  });

  testWithApp('getAccountOrThrow throws on missing', async ({ app }) => {
    const ledger = new Ledger(app);

    await expect(ledger.getAccountOrThrow('nonexistent.account', 'USD')).rejects.toThrow(
      'Account not found',
    );
  });

  testWithApp('getAccountsUnder returns descendants', async ({ app }) => {
    const ledger = new Ledger(app);
    const prefix = uniqueName('org');

    await ledger.createAccount(`${prefix}.alice`, 'USD');
    await ledger.createAccount(`${prefix}.bob`, 'USD');
    await ledger.createAccount(`${prefix}.alice.wallet`, 'USD');

    const accounts = await ledger.getAccountsUnder(prefix, 'USD');
    const names = accounts.map((a) => a.name);

    expect(names).toContain(`${prefix}.alice`);
    expect(names).toContain(`${prefix}.bob`);
    expect(names).toContain(`${prefix}.alice.wallet`);
  });

  testWithApp('findAccounts with lquery pattern', async ({ app }) => {
    const ledger = new Ledger(app);
    const prefix = uniqueName('merchants');

    await ledger.createAccount(`${prefix}.store`, 'USD');
    await ledger.createAccount(`${prefix}.cafe`, 'USD');

    const accounts = await ledger.findAccounts(`${prefix}.*`, 'USD');

    expect(accounts.length).toBe(2);
  });

  // ── Simple transfer ─────────────────────────────────────────────────────

  testWithApp('simple 1:1 transfer', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');

    const transfers = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store)
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(1);
    expect(transfers[0].transfer_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(transfers[0].amount).toBe('1000');

    const aliceAccount = await ledger.getAccountOrThrow(alice, 'USD');
    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');

    expect(aliceAccount.balance).toBe('-1000');
    expect(storeAccount.balance).toBe('1000');
  });

  // ── Percentage split ────────────────────────────────────────────────────

  testWithApp('90/10 split to two destinations', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');
    const fees = uniqueName('fees');

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');
    await ledger.createAccount(fees, 'USD');

    const transfers = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store, 0.9)
      .to(fees, 0.1)
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(2);

    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');
    const feesAccount = await ledger.getAccountOrThrow(fees, 'USD');

    expect(storeAccount.balance).toBe('900');
    expect(feesAccount.balance).toBe('100');
  });

  testWithApp('split with remaining', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');
    const fees = uniqueName('fees');

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');
    await ledger.createAccount(fees, 'USD');

    const transfers = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store, 0.85)
      .to(fees, 'remaining')
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(2);

    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');
    const feesAccount = await ledger.getAccountOrThrow(fees, 'USD');

    expect(storeAccount.balance).toBe('850');
    expect(feesAccount.balance).toBe('150');
  });

  // ── Multi-source ────────────────────────────────────────────────────────

  testWithApp('multi-source with max constraint', async ({ app }) => {
    const ledger = new Ledger(app);
    const wallet = uniqueName('wallet');
    const backup = uniqueName('backup');
    const store = uniqueName('store');

    await ledger.createAccount(wallet, 'USD');
    await ledger.createAccount(backup, 'USD');
    await ledger.createAccount(store, 'USD');

    const transfers = await ledger
      .send('USD', 1000)
      .from(wallet, { max: 600 })
      .from(backup)
      .to(store)
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(2);

    const walletAccount = await ledger.getAccountOrThrow(wallet, 'USD');
    const backupAccount = await ledger.getAccountOrThrow(backup, 'USD');
    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');

    expect(walletAccount.balance).toBe('-600');
    expect(backupAccount.balance).toBe('-400');
    expect(storeAccount.balance).toBe('1000');
  });

  // ── Multi-source × multi-destination ────────────────────────────────────

  testWithApp('2 sources × 2 destinations proportional split', async ({ app }) => {
    const ledger = new Ledger(app);
    const wallet = uniqueName('wallet');
    const backup = uniqueName('backup');
    const store = uniqueName('store');
    const fees = uniqueName('fees');

    await ledger.createAccount(wallet, 'USD');
    await ledger.createAccount(backup, 'USD');
    await ledger.createAccount(store, 'USD');
    await ledger.createAccount(fees, 'USD');

    const transfers = await ledger
      .send('USD', 1000)
      .from(wallet, { max: 600 })
      .from(backup)
      .to(store, 0.9)
      .to(fees, 0.1)
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(4);

    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');
    const feesAccount = await ledger.getAccountOrThrow(fees, 'USD');

    expect(storeAccount.balance).toBe('900');
    expect(feesAccount.balance).toBe('100');
  });

  // ── Transaction metadata ────────────────────────────────────────────────

  testWithApp('attaches metadata and individual_uuid', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');

    const transfers = await ledger
      .send('USD', 500)
      .from(alice)
      .to(store)
      .metadata({ order_id: 'order_123' })
      .individualUuid('user_abc')
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(1);
    expect(transfers[0].transaction_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  // ── Idempotency ─────────────────────────────────────────────────────────

  testWithApp('transaction-level idempotency returns same result', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');
    const idempKey = `idem_${Date.now()}_${Math.random()}`;

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');

    const first = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store)
      .idempotencyId(idempKey)
      .commit();

    const second = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store)
      .idempotencyId(idempKey)
      .commit();

    expect(first[0].transaction_id).toBe(second[0].transaction_id);

    // Balance should only reflect one transfer
    const aliceAccount = await ledger.getAccountOrThrow(alice, 'USD');
    expect(aliceAccount.balance).toBe('-1000');
  });

  testWithApp('transfer-level idempotency skips duplicates', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');
    const txIdempKey = `tx_${Date.now()}_${Math.random()}`;
    const trIdempKey = `tr_${Date.now()}_${Math.random()}`;

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');

    await ledger
      .send('USD', 500)
      .from(alice)
      .to(store)
      .idempotencyId(txIdempKey)
      .transferIdempotencyId(trIdempKey)
      .commit();

    // Replay with same transfer idempotency key
    await ledger
      .send('USD', 500)
      .from(alice)
      .to(store)
      .idempotencyId(txIdempKey)
      .transferIdempotencyId(trIdempKey)
      .commit();

    const aliceAccount = await ledger.getAccountOrThrow(alice, 'USD');
    expect(aliceAccount.balance).toBe('-500');
  });

  // ── Append to existing transaction ──────────────────────────────────────

  testWithApp('appendTo adds transfers to existing transaction', async ({ app }) => {
    const ledger = new Ledger(app);
    const alice = uniqueName('alice');
    const store = uniqueName('store');
    const refund = uniqueName('refund');

    await ledger.createAccount(alice, 'USD');
    await ledger.createAccount(store, 'USD');
    await ledger.createAccount(refund, 'USD');

    // Initial transfer
    const first = await ledger
      .send('USD', 1000)
      .from(alice)
      .to(store)
      .idempotencyId(uniqueIdempKey())
      .commit();

    const txId = first[0].transaction_id;

    // Append another transfer to same transaction
    const all = await ledger.appendTo(txId, 'USD', 200).from(store).to(refund).commit();

    // Should return all transfers for the transaction
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((t) => t.transaction_id === txId)).toBe(true);

    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');
    expect(storeAccount.balance).toBe('800');
  });

  // ── Balance constraints ─────────────────────────────────────────────────

  testWithApp('rejects transfer that violates negative balance constraint', async ({ app }) => {
    const ledger = new Ledger(app);
    const sender = uniqueName('sender');
    const receiver = uniqueName('receiver');

    await ledger.createAccount(sender, 'USD', {
      allowNegativeBalance: false,
    });
    await ledger.createAccount(receiver, 'USD');

    await expect(
      ledger.send('USD', 1000).from(sender).to(receiver).idempotencyId(uniqueIdempKey()).commit(),
    ).rejects.toThrow('does not allow negative balance');
  });

  testWithApp('rejects transfer that violates positive balance constraint', async ({ app }) => {
    const ledger = new Ledger(app);
    const sender = uniqueName('sender');
    const receiver = uniqueName('receiver');

    await ledger.createAccount(sender, 'USD');
    await ledger.createAccount(receiver, 'USD', {
      allowPositiveBalance: false,
    });

    await expect(
      ledger.send('USD', 1000).from(sender).to(receiver).idempotencyId(uniqueIdempKey()).commit(),
    ).rejects.toThrow('does not allow positive balance');
  });

  // ── Currency mismatch ───────────────────────────────────────────────────

  testWithApp('rejects cross-currency transfer', async ({ app }) => {
    const ledger = new Ledger(app);
    const usdAccount = uniqueName('usd');
    const eurAccount = uniqueName('eur');

    const usd = await ledger.createAccount(usdAccount, 'USD');
    const eur = await ledger.createAccount(eurAccount, 'EUR');

    // Use autoCreate resolver to bypass name→id lookup (accounts have different currencies)
    // We need to build a custom resolver that maps both names to their IDs
    const customResolver = async () => {
      const map = new Map<string, string>();
      map.set(usdAccount, usd.account_id);
      map.set(eurAccount, eur.account_id);
      return map;
    };

    const crossLedger = new Ledger(app, { accountResolver: customResolver });

    await expect(
      crossLedger
        .send('USD', 100)
        .from(usdAccount)
        .to(eurAccount)
        .idempotencyId(uniqueIdempKey())
        .commit(),
    ).rejects.toThrow('different currencies');
  });

  // ── Auto-create account resolver ────────────────────────────────────────

  testWithApp('auto-create resolver creates missing accounts', async ({ app }) => {
    const ledger = new Ledger(app, {
      accountResolver: autoCreateAccountResolver,
    });
    const alice = uniqueName('alice');
    const store = uniqueName('store');

    // Don't create accounts manually — let the resolver do it
    const transfers = await ledger
      .send('USD', 500)
      .from(alice)
      .to(store)
      .idempotencyId(uniqueIdempKey())
      .commit();

    expect(transfers).toHaveLength(1);

    const aliceAccount = await ledger.getAccountOrThrow(alice, 'USD');
    const storeAccount = await ledger.getAccountOrThrow(store, 'USD');

    expect(aliceAccount.balance).toBe('-500');
    expect(storeAccount.balance).toBe('500');
  });

  // ── Strict resolver ─────────────────────────────────────────────────────

  testWithApp('strict resolver throws on missing accounts', async ({ app }) => {
    const ledger = new Ledger(app);

    await expect(
      ledger
        .send('USD', 100)
        .from('nonexistent.sender')
        .to('nonexistent.receiver')
        .idempotencyId(uniqueIdempKey())
        .commit(),
    ).rejects.toThrow('Accounts not found');
  });
});

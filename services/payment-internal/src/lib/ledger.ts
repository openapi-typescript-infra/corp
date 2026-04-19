import { type RawBuilder, type Selectable, sql } from 'kysely';

import type { Accounts, Transfers } from '#src/generated/database.ts';
import type { PaymentInternal } from '#src/types/service.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export type LedgerTransfer = Selectable<Transfers> & {
  from_account: string;
  to_account: string;
};

export interface CreateAccountOptions {
  allowNegativeBalance?: boolean;
  allowPositiveBalance?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SourceSpec {
  account: string;
  max?: number;
  overdraft?: number | 'unbounded';
}

export interface DestinationSpec {
  account: string;
  portion: number | 'remaining';
}

export interface ResolvedAmount {
  account: string;
  amount: number;
}

export interface TransferRequest {
  fromAccount: string;
  toAccount: string;
  amount: number;
  idempotencyId?: string;
}

/**
 * Resolves account names to IDs. Called before the atomic transfer batch.
 * This is the hook point for lazy account creation.
 */
export type AccountResolver = (
  names: string[],
  currency: string,
  app: PaymentInternal['App'],
) => Promise<Map<string, string>>;

export interface LedgerOptions {
  accountResolver?: AccountResolver;
}

// ── Pure computation functions ──────────────────────────────────────────────

export function validateTransaction(sources: SourceSpec[], destinations: DestinationSpec[]): void {
  if (sources.length === 0) {
    throw new Error('At least one source is required (.from())');
  }
  if (destinations.length === 0) {
    throw new Error('At least one destination is required (.to())');
  }

  const remainingCount = destinations.filter((d) => d.portion === 'remaining').length;
  if (remainingCount > 1) {
    throw new Error('Only one destination can use "remaining"');
  }

  const fixedSum = destinations.reduce((sum, d) => {
    if (typeof d.portion === 'number') {
      if (d.portion <= 0 || d.portion > 1) {
        throw new Error(
          `Portion must be between 0 (exclusive) and 1 (inclusive), got ${d.portion}`,
        );
      }
      return sum + d.portion;
    }
    return sum;
  }, 0);

  if (remainingCount === 0 && Math.abs(fixedSum - 1) > 1e-9) {
    throw new Error(`Destination portions must sum to 1 (or use "remaining"). Got ${fixedSum}`);
  }
  if (remainingCount > 0 && fixedSum >= 1) {
    throw new Error(`Fixed portions sum to ${fixedSum}, leaving nothing for "remaining"`);
  }
}

/**
 * Resolve destination portions into integer amounts.
 * Uses largest-remainder method to distribute rounding residuals.
 */
export function resolveDestinations(
  amount: number,
  destinations: DestinationSpec[],
): ResolvedAmount[] {
  let remainingIndex = -1;
  const result: ResolvedAmount[] = [];
  let allocated = 0;

  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i];
    if (dest.portion === 'remaining') {
      remainingIndex = i;
      result.push({ account: dest.account, amount: 0 });
    } else {
      const floored = Math.floor(amount * dest.portion);
      allocated += floored;
      result.push({ account: dest.account, amount: floored });
    }
  }

  const leftover = amount - allocated;

  if (remainingIndex >= 0) {
    result[remainingIndex].amount = leftover;
  } else if (leftover > 0) {
    // Distribute leftover using largest-remainder method
    const fractionals = destinations.map((d, i) => ({
      index: i,
      frac: typeof d.portion === 'number' ? (amount * d.portion) % 1 : 0,
    }));
    fractionals.sort((a, b) => b.frac - a.frac);

    for (let j = 0; j < leftover; j++) {
      result[fractionals[j].index].amount += 1;
    }
  }

  return result;
}

/**
 * Resolve source contributions sequentially.
 * Each source contributes up to its max (or all remaining).
 */
export function resolveSources(
  amount: number,
  currency: string,
  sources: SourceSpec[],
): ResolvedAmount[] {
  let remaining = amount;
  const result: ResolvedAmount[] = [];

  for (const source of sources) {
    if (remaining <= 0) {
      break;
    }

    const contribution = source.max !== undefined ? Math.min(source.max, remaining) : remaining;

    remaining -= contribution;
    if (contribution > 0) {
      result.push({ account: source.account, amount: contribution });
    }
  }

  if (remaining > 0) {
    throw new Error(`Sources cannot cover the full amount: ${remaining} ${currency} short`);
  }

  return result;
}

/**
 * Build the M×N transfer matrix from sources to destinations.
 * Each source's contribution is split across destinations proportionally.
 */
export function buildTransferMatrix(
  totalAmount: number,
  sources: ResolvedAmount[],
  destinations: ResolvedAmount[],
): TransferRequest[] {
  const transfers: TransferRequest[] = [];

  for (const src of sources) {
    let srcRemaining = src.amount;

    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];

      let transferAmount: number;
      if (i === destinations.length - 1) {
        transferAmount = srcRemaining;
      } else {
        transferAmount = Math.floor((dest.amount / totalAmount) * src.amount);
        srcRemaining -= transferAmount;
      }

      if (transferAmount > 0) {
        transfers.push({
          fromAccount: src.account,
          toAccount: dest.account,
          amount: transferAmount,
        });
      }
    }
  }

  return transfers;
}

// ── Account resolvers ───────────────────────────────────────────────────────

/**
 * Default resolver: looks up accounts by name+currency, throws on missing.
 */
export const strictAccountResolver: AccountResolver = async (names, currency, app) => {
  const uniqueNames = [...new Set(names)];
  const result = await sql<{ account_id: string; name: string }>`
    SELECT account_id, name::text FROM accounts
    WHERE name::text = ANY(${sql.val(uniqueNames)}) AND currency = ${currency}
  `.execute(app.locals.db);

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.name, row.account_id);
  }

  const missing = uniqueNames.filter((n) => !map.has(n));
  if (missing.length > 0) {
    throw new Error(`Accounts not found for currency ${currency}: ${missing.join(', ')}`);
  }

  return map;
};

/**
 * Auto-create resolver: creates missing accounts on the fly.
 * New accounts default to allow_negative_balance=true, allow_positive_balance=true.
 */
export const autoCreateAccountResolver: AccountResolver = async (names, currency, app) => {
  const uniqueNames = [...new Set(names)];

  // Look up existing accounts
  const existing = await sql<{ account_id: string; name: string }>`
    SELECT account_id, name::text FROM accounts
    WHERE name::text = ANY(${sql.val(uniqueNames)}) AND currency = ${currency}
  `.execute(app.locals.db);

  const map = new Map<string, string>();
  for (const row of existing.rows) {
    map.set(row.name, row.account_id);
  }

  // Create any that are missing
  const missing = uniqueNames.filter((n) => !map.has(n));
  for (const name of missing) {
    const created = await sql<{ account_id: string; name: string }>`
      SELECT account_id, name::text FROM pgledger_create_account(${name}::ltree, ${currency})
    `.execute(app.locals.db);
    map.set(created.rows[0].name, created.rows[0].account_id);
  }

  return map;
};

// ── Ledger ──────────────────────────────────────────────────────────────────

export class Ledger {
  app: PaymentInternal['App'];
  accountResolver: AccountResolver;

  constructor(app: PaymentInternal['App'], opts?: LedgerOptions) {
    this.app = app;
    this.accountResolver = opts?.accountResolver ?? strictAccountResolver;
  }

  /**
   * Start building a new transaction that sends `amount` of `currency`.
   *
   * @example
   * await ledger
   *   .send("USD", 10000)
   *   .from("users:alice")
   *   .to("merchant:store", 0.9)
   *   .to("platform:fees", "remaining")
   *   .commit();
   */
  send(currency: string, amount: number): TransactionBuilder {
    return new TransactionBuilder(this.app, this.accountResolver, currency, amount);
  }

  /** Alias for `send()`. */
  transfer(currency: string, amount: number): TransactionBuilder {
    return this.send(currency, amount);
  }

  /**
   * Append transfers to an existing transaction.
   *
   * @example
   * await ledger
   *   .appendTo(txId, "USD", 10000)
   *   .from("users:alice")
   *   .to("merchant:store", 0.9)
   *   .to("platform:fees", "remaining")
   *   .transferIdempotencyId("stripe:pi_xxx")
   *   .commit();
   */
  appendTo(transactionId: string, currency: string, amount: number): TransactionBuilder {
    const builder = new TransactionBuilder(this.app, this.accountResolver, currency, amount);
    builder.transactionId(transactionId);
    return builder;
  }

  async createAccount(
    name: string,
    currency: string,
    opts?: CreateAccountOptions,
  ): Promise<Selectable<Accounts>> {
    const allowNeg = opts?.allowNegativeBalance ?? true;
    const allowPos = opts?.allowPositiveBalance ?? true;
    const meta = opts?.metadata ? sql`${JSON.stringify(opts.metadata)}::jsonb` : sql`NULL::jsonb`;

    const result = await sql<Selectable<Accounts>>`
      SELECT * FROM pgledger_create_account(
        ${name}::ltree, ${currency}, ${allowNeg}, ${allowPos}, ${meta}
      )
    `.execute(this.app.locals.db);
    return result.rows[0];
  }

  async getAccount(name: string, currency?: string): Promise<Selectable<Accounts> | undefined> {
    if (currency) {
      const result = await sql<Selectable<Accounts>>`
        SELECT * FROM accounts_view
        WHERE name = ${name}::ltree AND currency = ${currency}
      `.execute(this.app.locals.db);
      return result.rows[0];
    }
    const result = await sql<Selectable<Accounts>>`
      SELECT * FROM accounts_view WHERE name = ${name}::ltree
    `.execute(this.app.locals.db);
    return result.rows[0];
  }

  async getAccountOrThrow(name: string, currency?: string): Promise<Selectable<Accounts>> {
    const account = await this.getAccount(name, currency);
    if (!account) {
      throw new Error(`Account not found: ${name}${currency ? ` (${currency})` : ''}`);
    }
    return account;
  }

  /**
   * Find all accounts that are descendants of the given path.
   * e.g. getAccountsUnder("users") returns users.alice, users.bob, users.alice.wallet, etc.
   */
  async getAccountsUnder(path: string, currency?: string): Promise<Selectable<Accounts>[]> {
    if (currency) {
      const result = await sql<Selectable<Accounts>>`
        SELECT * FROM accounts_view
        WHERE name <@ ${path}::ltree AND currency = ${currency}
        ORDER BY name
      `.execute(this.app.locals.db);
      return result.rows;
    }
    const result = await sql<Selectable<Accounts>>`
      SELECT * FROM accounts_view
      WHERE name <@ ${path}::ltree
      ORDER BY name
    `.execute(this.app.locals.db);
    return result.rows;
  }

  /**
   * Find accounts matching an lquery pattern.
   * e.g. "users.*.wallet" matches users.alice.wallet, users.bob.wallet
   * e.g. "merchant.*" matches merchant.store, merchant.cafe
   */
  async findAccounts(pattern: string, currency?: string): Promise<Selectable<Accounts>[]> {
    if (currency) {
      const result = await sql<Selectable<Accounts>>`
        SELECT * FROM accounts_view
        WHERE name ~ ${pattern}::lquery AND currency = ${currency}
        ORDER BY name
      `.execute(this.app.locals.db);
      return result.rows;
    }
    const result = await sql<Selectable<Accounts>>`
      SELECT * FROM accounts_view
      WHERE name ~ ${pattern}::lquery
      ORDER BY name
    `.execute(this.app.locals.db);
    return result.rows;
  }
}

// ── TransactionBuilder ──────────────────────────────────────────────────────

export class TransactionBuilder {
  app: PaymentInternal['App'];
  resolveAccounts: AccountResolver;
  currency: string;
  amount: number;
  sources: SourceSpec[] = [];
  destinations: DestinationSpec[] = [];
  _metadata?: Record<string, unknown>;
  _eventAt?: Date;
  _idempotencyId?: string;
  _individualUuid?: string;
  _transactionId?: string;
  _transferIdempotencyId?: string;

  constructor(
    app: PaymentInternal['App'],
    resolveAccounts: AccountResolver,
    currency: string,
    amount: number,
  ) {
    this.app = app;
    this.resolveAccounts = resolveAccounts;
    this.currency = currency;
    this.amount = amount;

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Amount must be a positive integer (use smallest currency unit, e.g. cents)');
    }
  }

  /**
   * Add a source account. Sources are drawn from sequentially.
   *
   * @param account  Account name (e.g. "users:alice")
   * @param opts.max Maximum amount to draw from this source
   * @param opts.overdraft  Allow overdraft: a number for a limit, or 'unbounded'
   */
  from(account: string, opts?: { max?: number; overdraft?: number | 'unbounded' }): this {
    this.sources.push({ account, ...opts });
    return this;
  }

  /**
   * Add a destination account with an optional portion.
   *
   * @param account  Account name (e.g. "merchant:store")
   * @param portion  Fraction 0–1 (e.g. 0.9 for 90%), or "remaining" for the rest.
   *                 Omit for a single destination (defaults to 100%).
   */
  to(account: string, portion?: number | 'remaining'): this {
    this.destinations.push({
      account,
      portion: portion ?? 'remaining',
    });
    return this;
  }

  /** Attach metadata to the transaction. */
  metadata(meta: Record<string, unknown>): this {
    this._metadata = meta;
    return this;
  }

  /** Override the event timestamp (defaults to now()). */
  eventAt(date: Date): this {
    this._eventAt = date;
    return this;
  }

  /** Set a transaction-level idempotency key. Duplicate commits return the original result. */
  idempotencyId(id: string): this {
    this._idempotencyId = id;
    return this;
  }

  /** Set the individual (user) who initiated this transaction. */
  individualUuid(uuid: string): this {
    this._individualUuid = uuid;
    return this;
  }

  /** Append to an existing transaction instead of creating a new one. */
  transactionId(id: string): this {
    this._transactionId = id;
    return this;
  }

  /**
   * Set a per-transfer idempotency key. Applied to all transfers in this batch.
   * If the key already exists, those transfers are silently skipped.
   *
   * For multi-transfer batches, each transfer gets a derived key:
   * `${key}:0`, `${key}:1`, etc.
   */
  transferIdempotencyId(id: string): this {
    this._transferIdempotencyId = id;
    return this;
  }

  /**
   * Resolve accounts, then execute the atomic transfer batch.
   *
   * Two phases:
   *   1. Account resolution (separate queries, can lazy-create accounts)
   *   2. Transfer execution (single atomic SQL command via pgledger_create_transfers)
   */
  async commit(): Promise<Selectable<Transfers>[]> {
    if (!this._idempotencyId && !this._transactionId) {
      throw new Error('idempotency_id is required (call .idempotencyId() or use .appendTo())');
    }

    validateTransaction(this.sources, this.destinations);

    const destAmounts = resolveDestinations(this.amount, this.destinations);
    const sourceAmounts = resolveSources(this.amount, this.currency, this.sources);

    const transfers = buildTransferMatrix(this.amount, sourceAmounts, destAmounts);
    if (transfers.length === 0) {
      throw new Error('Transaction produced no transfers');
    }

    // Assign per-transfer idempotency keys
    if (this._transferIdempotencyId) {
      if (transfers.length === 1) {
        transfers[0].idempotencyId = this._transferIdempotencyId;
      } else {
        for (let i = 0; i < transfers.length; i++) {
          transfers[i].idempotencyId = `${this._transferIdempotencyId}:${i}`;
        }
      }
    }

    // Phase 1: Resolve account names → IDs (not atomic, allows lazy creation)
    const allNames = transfers.flatMap((t) => [t.fromAccount, t.toAccount]);
    const accountMap = await this.resolveAccounts(allNames, this.currency, this.app);

    // Phase 2: Execute atomic transfer batch (single SQL command)
    return this.execute(transfers, accountMap);
  }

  // ── Database ────────────────────────────────────────────────────────────

  /**
   * Execute the atomic transfer batch. This is a single SQL command —
   * account locking, balance updates, transfer+entry creation all happen
   * inside pgledger_create_transfers(). All or nothing.
   */
  private execute(
    transfers: TransferRequest[],
    accountMap: Map<string, string>,
  ): Promise<Selectable<Transfers>[]> {
    const elements: RawBuilder<unknown>[] = transfers.map((t) => {
      const fromId = accountMap.get(t.fromAccount) as string;
      const toId = accountMap.get(t.toAccount) as string;
      return sql`ROW(${fromId}::uuid, ${toId}::uuid, ${t.amount}, ${t.idempotencyId ?? null})::TRANSFER_REQUEST`;
    });

    const transferArray = sql.join(elements, sql`, `);
    const eventAt = this._eventAt
      ? sql`${this._eventAt.toISOString()}::timestamptz`
      : sql`NULL::timestamptz`;
    const meta = this._metadata ? sql`${JSON.stringify(this._metadata)}::jsonb` : sql`NULL::jsonb`;
    const idempotencyId = this._idempotencyId ? sql`${this._idempotencyId}` : sql`NULL::text`;
    const individualUuid = this._individualUuid
      ? sql`${this._individualUuid}::uuid`
      : sql`NULL::uuid`;
    const transactionId = this._transactionId ? sql`${this._transactionId}::uuid` : sql`NULL::uuid`;

    return sql<Selectable<Transfers>>`
      SELECT * FROM pgledger_create_transfers(
        transfer_requests => ARRAY[${transferArray}],
        event_at => ${eventAt},
        metadata => ${meta},
        idempotency_id => ${idempotencyId},
        individual_uuid => ${individualUuid},
        transaction_id => ${transactionId}
      )
    `
      .execute(this.app.locals.db)
      .then((r) => r.rows);
  }
}

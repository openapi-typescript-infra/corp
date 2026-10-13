import { type Kysely, type Selectable, sql, type Transaction } from 'kysely';
import type { CreditEntries, DB, JsonObject } from '../generated/database.ts';

export type CreditEntry = Selectable<CreditEntries>;
export type CreditDatabase = Kysely<DB> | Transaction<DB>;

export interface CreditOperation {
  individualUuid: string;
  currency: string;
  scopeUuid?: string | null;
  /** Positive exact decimal quantity in this currency's agreed unit. */
  amount: string;
  /** Stable business-operation key; reuse for retries, not for a new payment attempt. */
  idempotencyKey: string;
  /** Immutable context, e.g. the originating transaction and payment attempt IDs. */
  extraData?: JsonObject;
}

export interface CreditReservationReference {
  individualUuid: string;
  creditEntryUuid: string;
}

export class CreditError extends Error {
  constructor(
    public readonly code:
      | 'invalid_credit_request'
      | 'credit_idempotency_conflict'
      | 'insufficient_credit'
      | 'credit_reservation_not_found'
      | 'credit_reservation_state_conflict',
    message: string,
  ) {
    super(message);
    this.name = 'CreditError';
  }
}

async function inTransaction<T>(
  db: CreditDatabase,
  work: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  // Do not commit the caller's payment transaction or start a nested transaction.
  if (db.isTransaction) return work(db as Transaction<DB>);
  return db.transaction().execute(work);
}

function validateOperation(operation: CreditOperation) {
  if (
    typeof operation.amount !== 'string' ||
    !/^[0-9]+(?:\.[0-9]+)?$/.test(operation.amount) ||
    !/[1-9]/.test(operation.amount) ||
    !operation.idempotencyKey?.trim() ||
    !operation.individualUuid ||
    !operation.currency ||
    operation.currency !== operation.currency.trim() ||
    operation.currency !== operation.currency.toUpperCase()
  ) {
    throw new CreditError(
      'invalid_credit_request',
      'Credit operations require an individual, uppercase currency, positive decimal-string amount and idempotency key.',
    );
  }
}

async function replay(
  db: Transaction<DB>,
  operation: CreditOperation,
  signedAmount: string,
): Promise<CreditEntry | undefined> {
  const row = await db
    .selectFrom('credit_entries as e')
    .innerJoin('credit_accounts as a', 'a.credit_account_id', 'e.credit_account_id')
    .selectAll('e')
    .select(
      sql<boolean>`
      a.individual_uuid = ${operation.individualUuid}::uuid
      AND a.currency = ${operation.currency}
      AND a.scope_uuid IS NOT DISTINCT FROM ${operation.scopeUuid ?? null}::uuid
      AND e.amount = ${signedAmount}::numeric
      AND e.extra_data = ${JSON.stringify(operation.extraData ?? {})}::jsonb
    `.as('matches'),
    )
    .where('e.idempotency_key', '=', operation.idempotencyKey)
    .forUpdate('e')
    .executeTakeFirst();
  if (!row) return undefined;
  const { matches, ...entry } = row;
  if (!matches) {
    throw new CreditError(
      'credit_idempotency_conflict',
      'This idempotency key already identifies a different credit operation.',
    );
  }
  // Return the current state, even if a reservation has since been posted/voided.
  // A retry must never reopen a voided reservation or debit a posted one again.
  return entry;
}

async function addEntry(
  db: CreditDatabase,
  operation: CreditOperation,
  kind: 'grant' | 'reserve',
): Promise<{ entry: CreditEntry; created: boolean }> {
  validateOperation(operation);
  const signedAmount = kind === 'grant' ? operation.amount : `-${operation.amount}`;
  try {
    return await inTransaction(db, async (trx) => {
      const existing = await replay(trx, operation, signedAmount);
      if (existing) return { entry: existing, created: false };

      if (kind === 'grant') {
        await trx
          .insertInto('credit_accounts')
          .values({
            individual_uuid: operation.individualUuid,
            currency: operation.currency,
            scope_uuid: operation.scopeUuid ?? null,
          })
          .onConflict((conflict) =>
            conflict.columns(['individual_uuid', 'currency', 'scope_uuid']).doNothing(),
          )
          .execute();
      }
      const account = await trx
        .selectFrom('credit_accounts')
        .select('credit_account_id')
        .where('individual_uuid', '=', operation.individualUuid)
        .where('currency', '=', operation.currency)
        .where('scope_uuid', operation.scopeUuid == null ? 'is' : '=', operation.scopeUuid ?? null)
        .executeTakeFirst();
      if (!account)
        throw new CreditError(
          'insufficient_credit',
          'No credit account exists for this individual, currency and scope.',
        );

      const entry = await trx
        .insertInto('credit_entries')
        .values({
          credit_account_id: account.credit_account_id,
          idempotency_key: operation.idempotencyKey,
          amount: signedAmount,
          status: kind === 'grant' ? 'posted' : 'reserved',
          extra_data: operation.extraData ?? {},
        })
        .onConflict((conflict) => conflict.column('idempotency_key').doNothing())
        .returningAll()
        .executeTakeFirst();
      if (entry) return { entry, created: true };

      // A concurrent request may have claimed the key after our first lookup.
      const concurrent = await replay(trx, operation, signedAmount);
      if (!concurrent)
        throw new Error('Credit idempotency entry disappeared; retry the transaction.');
      return { entry: concurrent, created: false };
    });
  } catch (error) {
    if (
      kind === 'reserve' &&
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23514' &&
      'constraint' in error &&
      error.constraint === 'credit_accounts_balance_check'
    ) {
      throw new CreditError(
        'insufficient_credit',
        'Insufficient available credit for this reservation.',
      );
    }
    throw error;
  }
}

/** Grant purchased/refunded credit. Caller verifies fulfillment eligibility. */
export function createCredit(db: CreditDatabase, operation: CreditOperation) {
  return addEntry(db, operation, 'grant');
}

/** Reserve an exact quantity in one currency/scope, reducing availability now. */
export function reserveCredits(db: CreditDatabase, operation: CreditOperation) {
  return addEntry(db, operation, 'reserve');
}

async function finishReservation(
  db: CreditDatabase,
  reference: CreditReservationReference,
  status: 'posted' | 'voided',
): Promise<CreditEntry> {
  return inTransaction(db, async (trx) => {
    const entry = await trx
      .selectFrom('credit_entries as e')
      .innerJoin('credit_accounts as a', 'a.credit_account_id', 'e.credit_account_id')
      .selectAll('e')
      .where('e.credit_entry_uuid', '=', reference.creditEntryUuid)
      .where('a.individual_uuid', '=', reference.individualUuid)
      .where('e.amount', '<', '0')
      .forUpdate('e')
      .executeTakeFirst();
    if (!entry)
      throw new CreditError(
        'credit_reservation_not_found',
        'Credit reservation not found for this individual.',
      );
    if (entry.status === status) return entry;
    if (entry.status !== 'reserved') {
      throw new CreditError(
        'credit_reservation_state_conflict',
        `Cannot ${status === 'posted' ? 'post' : 'void'} a ${entry.status} credit reservation.`,
      );
    }
    return trx
      .updateTable('credit_entries')
      .set({ status })
      .where('credit_entry_id', '=', entry.credit_entry_id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}

/** Finalize a successful redemption; the balance was reduced when reserved. */
export function postCreditReservation(db: CreditDatabase, reference: CreditReservationReference) {
  return finishReservation(db, reference, 'posted');
}

/** Release a reservation only after the caller confirms payment cannot succeed. */
export function voidCreditReservation(db: CreditDatabase, reference: CreditReservationReference) {
  return finishReservation(db, reference, 'voided');
}

# payment-internal

A payment ledger and associated payment handling (Stripe interfaces etc) for Just Tell Me

## Individual credit ledger

`credit_accounts` and `credit_entries` are independent of the general money ledger.
An account belongs to `(individual_uuid, currency, scope_uuid)`. The optional scope is a generic external identity: for example, a
provider UUID for `MINUTES`. Unscoped accounts use NULL, and there can be only one
account for each complete key, including NULL scopes. Currency identifiers are
uppercase, trimmed, nonempty text; they are not restricted to ISO currencies.
Accounts use an internal bigint key without an external account UUID; callers
identify them by individual, currency and scope.

Amounts use exact PostgreSQL `numeric`. Callers must agree on a consistent unit
for each currency (for example cents for USD/CAD, minutes for MINUTES), and pass
numeric values as decimal strings rather than JavaScript floating-point results.
Positive entries grant credit; negative entries spend it. The account balance is
the sum of non-voided entries and represents available credit. The database updates
it in the same transaction as each entry, locking the account and rejecting any
negative result. Separate accounts never pool their balances.

Operators can run `SELECT recompute_balance(credit_account_id)` to rebuild a cached
balance from the entries and return the repaired numeric balance. This takes the
same account lock as entry writes before summing posted and reserved entries;
voided entries are excluded, and an empty account sums to zero. Missing accounts
and negative ledger totals fail instead of hiding invalid history. Run this as a
standalone maintenance statement; the lock lasts until the transaction ends.
The function uses the caller's privileges and is not executable by the runtime
role or PUBLIC, preserving the runtime's sole balance-write path through triggers.

For a mixed payment, insert a negative entry with `status = 'reserved'` and commit
before contacting the payment provider. It immediately reduces available credit.
After confirmed success, update its status to `posted`; after confirmed failure,
update it to `voided` to restore credit. Repeating the same status is harmless.
Only reserved debits can change status, and posted or voided entries cannot be
reopened. A provider timeout alone is not proof of failure; eventual reconciliation
and payment orchestration are future work. Posted corrections use new entries.

Every entry requires a globally unique `idempotency_key`, which remains claimed
when voided. `ON CONFLICT (idempotency_key) DO NOTHING` has no balance effect, but
callers must retrieve the original entry and compare its payload before accepting
a retry. Account creation can likewise use `ON CONFLICT DO NOTHING` followed by a
lookup using the full account key. Runtime grants permit account creation, entry
insertion and status updates only; balances and entry details cannot be edited,
and neither ledger table supports deletion. `extra_data` can record external
payment references without coupling this migration to a particular provider or
the general ledger. Standard `deleted_at` columns are constrained to NULL.

The migration adds storage and database invariants only; it does not initiate
payments. Integration coverage in
`src/lib/credit-ledger.integration.spec.ts` applies, rolls back and reapplies the
migration in an isolated schema, then exercises runtime permissions, exact sums,
reservation transitions, transaction rollback, duplicate inserts and concurrent
spending. Run with `PAYMENT_TEST_DATABASE_URL` pointing to a disposable database
with the existing payment migrations applied.

### Reading credit balances

`GET /payment/individuals/{individual_uuid}/credit_balances` returns all existing credit
accounts for that individual. Add `currency=USD` to filter by an exact currency
identifier, `scope_uuid=<uuid>` to filter by a redemption scope, or both. Omitting
scope includes all scopes and unscoped accounts. `individual_uuid` is always
required in the path; malformed UUIDs return HTTP 400, and omitting the
individual path segment matches no route (HTTP 404).

The response is `{ individual_uuid, balances: [{ currency, scope_uuid, balance }] }`.
Each currency/scope pair stays separate, ordered by currency then scope with NULL
first. `scope_uuid: null` denotes an unscoped account. `balance` is an exact decimal
string representing available credit after reservations. Existing zero-balance
accounts are included; no matching accounts returns HTTP 200 with `balances: []`.
Reads never create accounts or reserve credit, and responses use `Cache-Control:
no-store`. A balance read is a snapshot, not a guarantee that a later debit will
succeed; the database still enforces availability when that debit is inserted.

This is an internal service API. The calling application must authorize access to
the requested individual before invoking it. Internal bigint IDs, entry history,
and metadata are not exposed by this endpoint.

Generic debit/credit HTTP endpoints are intentionally deferred. Checkout and
payment webhook handlers should share internal, idempotent reservation/post/void
operations tied to a payment attempt. The higher-level operation determines who
can spend, which scopes apply, and when success or failure is confirmed. Stripe's
[fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) requires
idempotent processing across webhook deliveries and distinguishes checkout
completion from delayed payment success; it does not require a generic ledger
mutation API. This step adds no Stripe requests or credit mutation endpoints.

`src/lib/credit-balances.integration.spec.ts` exercises the real HTTP routing and
OpenAPI validation against an isolated database using the runtime role. It covers
required individual scoping, currency/scope filtering, exact numeric serialization,
empty and zero balances, and balances through reservation/post/void transitions.
Run it with the same `PAYMENT_TEST_DATABASE_URL` used by the ledger tests.

### Internal credit operations

`src/lib/credits.ts` exposes four helpers for payment operations:

- `createCredit(db, operation)` grants positive credit, creating the account when
  needed. Use it after confirming a purchase or other grant is eligible.
- `reserveCredits(db, operation)` reserves a positive requested quantity as a
  negative entry in exactly one account. It never combines currencies or scopes.
- `postCreditReservation(db, { individualUuid, creditEntryUuid })` finalizes a
  successful redemption without reducing the balance a second time.
- `voidCreditReservation(db, { individualUuid, creditEntryUuid })` releases a
  reservation after confirmed cancellation/failure.

An operation supplies `individualUuid`, `currency`, optional `scopeUuid`, a positive
decimal-string `amount`, `idempotencyKey`, and optional immutable `extraData`.
Grant/reserve return `{ entry, created }`; repeating the same business operation
returns the original entry in its current state with `created: false`. A retry of
a voided reservation stays voided. A new payment attempt needs a new key. Reusing
a key with a different owner, currency, scope, amount, direction, or context raises
`CreditError` with `code: 'credit_idempotency_conflict'`. Decimal formatting and JSON
property order do not create false conflicts. Post/void retries are harmless, but
attempting the opposite terminal transition raises `credit_reservation_state_conflict`.

Each helper starts a database transaction when given a Kysely database, or joins
the supplied Kysely transaction without committing it. Fulfillment should pass
the same transaction to its monetary-ledger writes and `createCredit`. Payment
completion should likewise post the credit reservation and book settlement in the
same transaction. Let helper errors abort the enclosing transaction; retry the
whole operation after database serialization/deadlock errors. No transaction can
atomically include an external Stripe request, so commit reservations before
calling Stripe and reconcile the payment attempt from verified provider state.

The payment operation owns allocation and conversion. Record the credit quantity,
scope, monetary value, agreed conversion terms and operation references before
checkout; do not recalculate them from a later price. `extraData` can carry stable
transaction/payment-attempt references, but these are metadata, not foreign keys
or an implemented payment-attempt state machine. Use business-operation keys
(purchase line or redemption attempt), not just webhook delivery IDs.

The existing general ledger posts transfers immediately. A credit reservation
does not void those transfers. Defer final settlement until payment succeeds, or
introduce explicit holding-account transfers and their compensating entries.
Cancellation must confirm the provider can no longer succeed before releasing
credit; requesting cancellation or receiving a browser redirect alone is not
enough. Refunds after settlement require compensating ledger entries and, when
appropriate, a new credit grant rather than voiding a posted redemption.

`src/lib/credits.integration.spec.ts` covers exact grants, conflicting/concurrent
retries, overspending, reservation transitions, ownership and atomic rollback with
real monetary-ledger transfers. No mutation HTTP endpoints or Stripe orchestration
are added by these helpers.

From this service directory, run the credit integration suites against a disposable
PostgreSQL database with all payment migrations applied (PostgreSQL 18 is required
by the existing general ledger). The connection must be able to create schemas
and assume the `payment-manager` role; tests exercise runtime writes as that role.

```sh
PAYMENT_TEST_DATABASE_URL=postgresql://dbowner:onlyindev@localhost:25432/payment \
  yarn vitest run src/lib/credit-ledger.integration.spec.ts \
  src/lib/credit-balances.integration.spec.ts src/lib/credits.integration.spec.ts
```

Without `PAYMENT_TEST_DATABASE_URL`, these suites are skipped. CI supplies it
explicitly after applying the service migrations.

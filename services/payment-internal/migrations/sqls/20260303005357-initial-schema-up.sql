DO $do$
BEGIN IF EXISTS (
        SELECT
        FROM pg_catalog.pg_roles
        WHERE rolname = 'payment-manager'
    ) THEN RAISE NOTICE 'Role "payment-manager" already exists. Skipping.';

ELSE CREATE ROLE "payment-manager";

END IF;

END $do$;

CREATE EXTENSION IF NOT EXISTS ltree;

-- pgledger schema (modified from https://github.com/pgr0ss/pgledger)
-- Uses Postgres 18 native uuidv7() for all primary keys.
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT uuidv7(),
    name LTREE NOT NULL,
    currency TEXT NOT NULL,
    balance NUMERIC NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    allow_negative_balance BOOLEAN NOT NULL,
    allow_positive_balance BOOLEAN NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (name, currency)
);

CREATE INDEX accounts_name_gist ON accounts USING GIST (name);

GRANT SELECT,
INSERT,
UPDATE ON TABLE accounts TO "payment-manager";

CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuidv7(),
    idempotency_id TEXT NOT NULL UNIQUE,
    individual_uuid UUID,
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT,
INSERT,
UPDATE ON TABLE transactions TO "payment-manager";

CREATE INDEX ON transactions (individual_uuid);

CREATE INDEX ON transactions (idempotency_id);

CREATE TABLE transfers (
    transfer_id UUID PRIMARY KEY DEFAULT uuidv7(),
    transaction_id UUID NOT NULL REFERENCES transactions (transaction_id),
    idempotency_id TEXT UNIQUE,
    from_account_id UUID NOT NULL REFERENCES accounts (account_id),
    to_account_id UUID NOT NULL REFERENCES accounts (account_id),
    amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    event_at TIMESTAMPTZ NOT NULL,
    CHECK (
        amount > 0
        AND from_account_id != to_account_id
    )
);

GRANT SELECT,
INSERT,
UPDATE ON TABLE transfers TO "payment-manager";

CREATE INDEX ON transfers (transaction_id);

CREATE INDEX ON transfers (from_account_id);

CREATE INDEX ON transfers (to_account_id);

CREATE INDEX ON transfers (event_at);

CREATE TABLE entries (
    entry_id UUID PRIMARY KEY DEFAULT uuidv7(),
    account_id UUID NOT NULL REFERENCES accounts (account_id),
    transfer_id UUID NOT NULL REFERENCES transfers (transfer_id),
    amount NUMERIC NOT NULL,
    account_previous_balance NUMERIC NOT NULL,
    account_current_balance NUMERIC NOT NULL,
    account_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

GRANT SELECT,
INSERT,
UPDATE ON TABLE entries TO "payment-manager";

CREATE INDEX ON entries (account_id);

CREATE INDEX ON entries (transfer_id);

CREATE VIEW accounts_view AS
SELECT account_id,
    name,
    currency,
    balance,
    version,
    allow_negative_balance,
    allow_positive_balance,
    metadata,
    created_at,
    updated_at
FROM accounts;

GRANT SELECT ON accounts_view TO "payment-manager";

CREATE VIEW transactions_view AS
SELECT transaction_id,
    idempotency_id,
    individual_uuid,
    event_at,
    metadata,
    created_at,
    updated_at
FROM transactions;

GRANT SELECT ON transactions_view TO "payment-manager";

CREATE VIEW transfers_view AS
SELECT t.transfer_id,
    t.transaction_id,
    t.idempotency_id,
    t.from_account_id,
    t.to_account_id,
    fa.name::text AS from_account,
    ta.name::text AS to_account,
    t.amount,
    t.created_at,
    t.event_at
FROM transfers t
    JOIN accounts fa ON fa.account_id = t.from_account_id
    JOIN accounts ta ON ta.account_id = t.to_account_id;

GRANT SELECT ON transfers_view TO "payment-manager";

CREATE VIEW entries_view AS
SELECT e.entry_id,
    e.account_id,
    e.transfer_id,
    t.transaction_id,
    e.amount,
    e.account_previous_balance,
    e.account_current_balance,
    e.account_version,
    e.created_at,
    t.event_at,
    tx.metadata
FROM entries e
    INNER JOIN transfers t ON e.transfer_id = t.transfer_id
    INNER JOIN transactions tx ON t.transaction_id = tx.transaction_id;

GRANT SELECT ON entries_view TO "payment-manager";

CREATE
OR REPLACE FUNCTION pgledger_create_account(
    name LTREE,
    currency TEXT,
    allow_negative_balance BOOLEAN DEFAULT TRUE,
    allow_positive_balance BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT NULL
) RETURNS SETOF ACCOUNTS_VIEW AS $$
BEGIN RETURN QUERY
INSERT INTO accounts (
        name,
        currency,
        allow_negative_balance,
        allow_positive_balance,
        metadata,
        created_at,
        updated_at
    )
VALUES (
        name,
        currency,
        allow_negative_balance,
        allow_positive_balance,
        metadata,
        now(),
        now()
    ) RETURNING *;

END;

$$ LANGUAGE plpgsql;

-- Helper function to check account balance constraints
CREATE
OR REPLACE FUNCTION pgledger_check_account_balance_constraints(account ACCOUNTS) RETURNS VOID AS $$
BEGIN -- If account doesn't allow negative balance and balance is negative, raise an error
    IF NOT account.allow_negative_balance
    AND (account.balance < 0) THEN RAISE
EXCEPTION 'Account (id=%, name=%) does not allow negative balance',
    account.account_id,
    account.name;

END IF;

-- If account doesn't allow positive balance and balance is positive, raise an error
IF NOT account.allow_positive_balance
AND (account.balance > 0) THEN RAISE
EXCEPTION 'Account (id=%, name=%) does not allow positive balance',
    account.account_id,
    account.name;

END IF;

END;

$$ LANGUAGE plpgsql;

-- Define a composite type for transfer requests
CREATE TYPE TRANSFER_REQUEST AS (
    from_account_id UUID,
    to_account_id UUID,
    amount NUMERIC,
    idempotency_id TEXT
);

-- Convenience: single transfer, auto-creates a transaction
CREATE
OR REPLACE FUNCTION pgledger_create_transfer(
    from_account_id UUID,
    to_account_id UUID,
    amount NUMERIC,
    event_at TIMESTAMPTZ DEFAULT NULL,
    metadata JSONB DEFAULT NULL,
    idempotency_id TEXT DEFAULT NULL,
    individual_uuid UUID DEFAULT NULL,
    transaction_id UUID DEFAULT NULL,
    transfer_idempotency_id TEXT DEFAULT NULL
) RETURNS SETOF TRANSFERS_VIEW AS $$
BEGIN RETURN QUERY
SELECT *
FROM pgledger_create_transfers(
        transfer_requests => array [(
            from_account_id,
            to_account_id,
            amount,
            transfer_idempotency_id
        )::TRANSFER_REQUEST ],
        event_at => event_at,
        metadata => metadata,
        idempotency_id => idempotency_id,
        individual_uuid => individual_uuid,
        transaction_id => transaction_id
    );

END;

$$ LANGUAGE plpgsql;

-- Variadic convenience overload (no per-transfer idempotency)
CREATE
OR REPLACE FUNCTION pgledger_create_transfers(VARIADIC transfer_requests TRANSFER_REQUEST [ ]) RETURNS SETOF TRANSFERS_VIEW AS $$
BEGIN RETURN QUERY
SELECT *
FROM pgledger_create_transfers(transfer_requests);

END;

$$ LANGUAGE plpgsql;

-- Core function: creates or appends to a transaction with N transfers atomically
--
-- Modes:
--   1. transaction_id provided       → append transfers to existing transaction
--   2. idempotency_id provided       → find existing tx or create new one
--   3. neither                       → create new transaction
--
-- Per-transfer idempotency:
--   If a transfer_request has a non-null idempotency_id that already exists,
--   that individual transfer is skipped (no error, no duplicate).
--
CREATE OR REPLACE FUNCTION pgledger_create_transfers(
transfer_requests TRANSFER_REQUEST [ ],
event_at TIMESTAMPTZ DEFAULT NULL,
metadata JSONB DEFAULT NULL,
idempotency_id TEXT DEFAULT NULL,
individual_uuid UUID DEFAULT NULL,
transaction_id UUID DEFAULT NULL
) RETURNS SETOF TRANSFERS_VIEW AS $$
DECLARE transfer_request transfer_request;

tx_id UUID;

new_transfer_id UUID;

resolved_event_at TIMESTAMPTZ := coalesce(event_at, now());

from_account accounts;

to_account accounts;

iter_account_id UUID;

all_account_ids UUID [ ] := '{}';

existing_tx_id UUID;

existing_transfer_id UUID;

BEGIN -- Resolve the transaction to operate on
    IF pgledger_create_transfers.transaction_id IS NOT NULL THEN -- Mode 1: append to existing transaction
SELECT transactions.transaction_id INTO tx_id
FROM transactions
WHERE transactions.transaction_id = pgledger_create_transfers.transaction_id;

IF tx_id IS NULL THEN RAISE
EXCEPTION 'Transaction not found: %',
    pgledger_create_transfers.transaction_id;

END IF;

-- Update the transaction timestamp
UPDATE transactions
SET updated_at = now()
WHERE transactions.transaction_id = tx_id;

ELSIF idempotency_id IS NOT NULL THEN -- Mode 2: find-or-create by idempotency_id
SELECT transactions.transaction_id INTO existing_tx_id
FROM transactions
WHERE transactions.idempotency_id = pgledger_create_transfers.idempotency_id;

IF existing_tx_id IS NOT NULL THEN -- Transaction exists. Check if any transfer-level idempotency is used.
-- If not, this is a full replay — return existing transfers immediately.
-- If yes, fall through to process individual transfers (skipping duplicates).
tx_id := existing_tx_id;

IF NOT EXISTS (
    SELECT 1
    FROM unnest(transfer_requests) AS r
    WHERE r.idempotency_id IS NOT NULL
) THEN RETURN QUERY
SELECT *
FROM transfers_view
WHERE transfers_view.transaction_id = tx_id
ORDER BY transfer_id;

RETURN;

END IF;

ELSE
INSERT INTO transactions (
        idempotency_id,
        individual_uuid,
        event_at,
        metadata,
        created_at,
        updated_at
    )
VALUES (
        idempotency_id,
        individual_uuid,
        resolved_event_at,
        metadata,
        now(),
        now()
    ) RETURNING transactions.transaction_id INTO tx_id;

END IF;

ELSE RAISE
EXCEPTION 'idempotency_id is required when creating a new transaction (provide transaction_id to append)';

END IF;

-- Collect all unique account IDs and sort them to prevent deadlocks
FOREACH transfer_request IN ARRAY transfer_requests
LOOP -- Skip transfers that already exist (per-transfer idempotency check)
    IF transfer_request.idempotency_id IS NOT NULL THEN
SELECT transfers.transfer_id INTO existing_transfer_id
FROM transfers
WHERE transfers.idempotency_id = transfer_request.idempotency_id;

IF existing_transfer_id IS NOT NULL THEN CONTINUE;

END IF;

END IF;

all_account_ids := array_append(
    all_account_ids,
    transfer_request.from_account_id
);

all_account_ids := array_append(all_account_ids, transfer_request.to_account_id);

END
LOOP;

-- If all transfers were skipped (all idempotent duplicates), return existing transfers
IF array_length(all_account_ids, 1) IS NULL THEN RETURN QUERY
SELECT *
FROM transfers_view
WHERE transfers_view.transaction_id = tx_id
ORDER BY transfer_id;

RETURN;

END IF;

-- Remove duplicates and sort
SELECT ARRAY(
        SELECT DISTINCT unnest
        FROM unnest(all_account_ids)
        ORDER BY unnest
    ) INTO all_account_ids;

-- Lock all accounts in order
FOREACH iter_account_id IN ARRAY all_account_ids
LOOP PERFORM accounts.account_id
FROM accounts
WHERE accounts.account_id = iter_account_id FOR
UPDATE;

END
LOOP;

-- Process each transfer
FOREACH transfer_request IN ARRAY transfer_requests
LOOP -- Per-transfer idempotency: skip if already exists
    IF transfer_request.idempotency_id IS NOT NULL THEN
SELECT transfers.transfer_id INTO existing_transfer_id
FROM transfers
WHERE transfers.idempotency_id = transfer_request.idempotency_id;

IF existing_transfer_id IS NOT NULL THEN CONTINUE;

END IF;

END IF;

-- Preliminary checks
IF transfer_request.amount <= 0 THEN RAISE
EXCEPTION 'Amount (%) must be positive',
    transfer_request.amount;

END IF;

IF transfer_request.from_account_id = transfer_request.to_account_id THEN RAISE
EXCEPTION 'Cannot transfer to the same account (id=%)',
    transfer_request.from_account_id;

END IF;

-- Update account balances
UPDATE accounts
SET balance = balance - transfer_request.amount,
    version = version + 1,
    updated_at = now()
WHERE accounts.account_id = transfer_request.from_account_id RETURNING * INTO from_account;

-- Check balance constraints for the source account
PERFORM pgledger_check_account_balance_constraints(from_account);

UPDATE accounts
SET balance = balance + transfer_request.amount,
    version = version + 1,
    updated_at = now()
WHERE accounts.account_id = transfer_request.to_account_id RETURNING * INTO to_account;

-- Check balance constraints for the destination account
PERFORM pgledger_check_account_balance_constraints(to_account);

-- Check that currencies match
IF from_account.currency != to_account.currency THEN RAISE
EXCEPTION 'Cannot transfer between different currencies (% and %)',
    from_account.currency,
    to_account.currency;

END IF;

-- Create transfer record
INSERT INTO transfers (
        transaction_id,
        idempotency_id,
        from_account_id,
        to_account_id,
        amount,
        created_at,
        event_at
    )
VALUES (
        tx_id,
        transfer_request.idempotency_id,
        transfer_request.from_account_id,
        transfer_request.to_account_id,
        transfer_request.amount,
        now(),
        resolved_event_at
    ) RETURNING transfers.transfer_id INTO new_transfer_id;

-- Create entry for the source account (negative amount)
INSERT INTO entries (
        account_id,
        transfer_id,
        amount,
        account_previous_balance,
        account_current_balance,
        account_version,
        created_at
    )
VALUES (
        transfer_request.from_account_id,
        new_transfer_id,
        - transfer_request.amount,
        from_account.balance + transfer_request.amount,
        from_account.balance,
        from_account.version,
        now()
    );

-- Create entry for the destination account (positive amount)
INSERT INTO entries (
        account_id,
        transfer_id,
        amount,
        account_previous_balance,
        account_current_balance,
        account_version,
        created_at
    )
VALUES (
        transfer_request.to_account_id,
        new_transfer_id,
        transfer_request.amount,
        to_account.balance - transfer_request.amount,
        to_account.balance,
        to_account.version,
        now()
    );

END
LOOP;

-- Return all transfers for this transaction (including pre-existing ones)
RETURN QUERY
SELECT *
FROM transfers_view
WHERE transfers_view.transaction_id = tx_id
ORDER BY transfer_id;

END;

$$ LANGUAGE plpgsql;

GRANT "payment-manager" TO "payment-internal";
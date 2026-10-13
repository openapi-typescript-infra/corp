BEGIN;
DROP TABLE IF EXISTS credit_entries;
DROP TABLE IF EXISTS credit_accounts;
DROP TYPE IF EXISTS credit_entry_status_enum;
DROP FUNCTION IF EXISTS apply_credit_entry();
DROP FUNCTION IF EXISTS recompute_balance(bigint);
DROP FUNCTION IF EXISTS set_credit_updated_at();
COMMIT;

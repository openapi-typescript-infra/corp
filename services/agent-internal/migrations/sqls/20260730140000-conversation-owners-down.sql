DROP INDEX IF EXISTS idx_conversations_owners;

ALTER TABLE conversations DROP COLUMN IF EXISTS owners;

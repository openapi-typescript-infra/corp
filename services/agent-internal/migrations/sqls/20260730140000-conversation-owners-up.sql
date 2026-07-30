ALTER TABLE conversations
ADD COLUMN owners text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX idx_conversations_owners ON conversations USING gin (owners);

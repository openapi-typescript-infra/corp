CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $do$
BEGIN IF EXISTS (
        SELECT
        FROM pg_catalog.pg_roles
        WHERE rolname = 'agent-manager'
    ) THEN RAISE NOTICE 'Role "agent-manager" already exists. Skipping.';

ELSE CREATE ROLE "agent-manager";

END IF;

END $do$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Model registry
CREATE TABLE models (
    model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    input_cost_per_million NUMERIC,
    output_cost_per_million NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON TABLE models TO "agent-manager";

-- Client lookup
CREATE TABLE clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, version)
);

CREATE TRIGGER clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON TABLE clients TO "agent-manager";

-- Conversation status
CREATE TYPE conversation_status_enum AS ENUM ('active', 'archived', 'deleted');

-- Conversations
CREATE TABLE conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    agent_id TEXT,
    status conversation_status_enum NOT NULL DEFAULT 'active',
    client_id UUID NOT NULL REFERENCES clients(client_id),
    model TEXT,
    system_prompt TEXT,
    starting_tools JSONB,
    forked_from_conversation_id UUID REFERENCES conversations(conversation_id),
    forked_at_turn_ordinal INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_conversations_uuid ON conversations(conversation_uuid);
CREATE INDEX idx_conversations_agent_id ON conversations(agent_id);

GRANT SELECT, INSERT, UPDATE ON TABLE conversations TO "agent-manager";

-- Turn status
CREATE TYPE turn_status_enum AS ENUM ('pending', 'streaming', 'complete', 'error', 'tool_call');

-- Conversation turns
CREATE TABLE conversation_turns (
    turn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id),
    ordinal INTEGER NOT NULL,
    status turn_status_enum NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER conversation_turns_updated_at
    BEFORE UPDATE ON conversation_turns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);

GRANT SELECT, INSERT, UPDATE ON TABLE conversation_turns TO "agent-manager";

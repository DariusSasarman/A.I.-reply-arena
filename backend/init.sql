-- =========================================================
-- Database schema for AI Reply Arena / Backend
-- PostgreSQL compatible
-- =========================================================

-- =========================
-- API Keys table
-- =========================
CREATE TABLE IF NOT EXISTS api_keys (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Winner Selections table
-- =========================
CREATE TABLE IF NOT EXISTS winner_selections (
    id BIGSERIAL PRIMARY KEY,
    model_identifier VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    selected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255)
);

-- =========================
-- Chat History table
-- =========================
CREATE TABLE IF NOT EXISTS chat_history (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    model_identifier VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INT
);

-- =========================================================
-- Indexes (performance-critical)
-- =========================================================

-- API keys lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_session_provider
    ON api_keys(session_id, provider);

-- Chat history lookups
CREATE INDEX IF NOT EXISTS idx_chat_history_session
    ON chat_history(session_id);

CREATE INDEX IF NOT EXISTS idx_chat_history_model
    ON chat_history(model_identifier);

-- Winner selections lookup
CREATE INDEX IF NOT EXISTS idx_winner_selections_session
    ON winner_selections(session_id);

-- =========================================================
-- Trigger to auto-update updated_at column
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- End of schema
-- =========================================================

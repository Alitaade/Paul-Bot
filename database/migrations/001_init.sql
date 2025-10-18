-- 001_initial_schema.sql
-- Complete WhatsApp-Telegram Bot Platform Database Schema
-- Organized and optimized version with all features included

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,  
    first_name VARCHAR(255),
    username VARCHAR(255),
    session_id VARCHAR(255),
    phone_number VARCHAR(50),
    is_connected BOOLEAN DEFAULT FALSE,
    connection_status VARCHAR(50) DEFAULT 'disconnected',
    reconnect_attempts INTEGER DEFAULT 0,
    source VARCHAR(50) DEFAULT 'telegram',
    detected BOOLEAN DEFAULT FALSE,
    detected_at TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


     CREATE TABLE IF NOT EXISTS web_users_auth (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

-- Groups table with all moderation features
CREATE TABLE IF NOT EXISTS groups (
    id BIGSERIAL PRIMARY KEY,
    jid VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    description TEXT,
    grouponly_enabled BOOLEAN DEFAULT FALSE,
    public_mode BOOLEAN DEFAULT TRUE,
    antilink_enabled BOOLEAN DEFAULT FALSE,
    anticall_enabled BOOLEAN DEFAULT FALSE,
    antipromote_enabled BOOLEAN DEFAULT FALSE,
    antidemote_enabled BOOLEAN DEFAULT FALSE,
    is_closed BOOLEAN DEFAULT FALSE,
    closed_until TIMESTAMP,
    antibot_enabled BOOLEAN DEFAULT FALSE,
    antitag_enabled BOOLEAN DEFAULT FALSE,
    antitagadmin_enabled BOOLEAN DEFAULT FALSE,
    antigroupmention_enabled BOOLEAN DEFAULT FALSE,
    antiimage_enabled BOOLEAN DEFAULT FALSE,
    antivideo_enabled BOOLEAN DEFAULT FALSE,
    antiaudio_enabled BOOLEAN DEFAULT FALSE,
    antidocument_enabled BOOLEAN DEFAULT FALSE,
    antisticker_enabled BOOLEAN DEFAULT FALSE,
    antidelete_enabled BOOLEAN DEFAULT FALSE,
    antiviewonce_enabled BOOLEAN DEFAULT FALSE,
    antispam_enabled BOOLEAN DEFAULT FALSE,
    antiraid_enabled BOOLEAN DEFAULT FALSE,
    antiadd_enabled BOOLEAN DEFAULT FALSE,
    antiremove_enabled BOOLEAN DEFAULT FALSE,
    autowelcome_enabled BOOLEAN DEFAULT FALSE,
    autokick_enabled BOOLEAN DEFAULT FALSE,
    welcome_enabled BOOLEAN DEFAULT FALSE,
    goodbye_enabled BOOLEAN DEFAULT FALSE,
    warning_limit INTEGER DEFAULT 4,
    participants_count INTEGER DEFAULT 0,
    is_bot_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_promotions (
  id SERIAL PRIMARY KEY,
  group_jid VARCHAR(255) NOT NULL,
  user_jid VARCHAR(255) NOT NULL,
  promoted_by VARCHAR(255),
  promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_jid, user_jid)
);

CREATE TABLE IF NOT EXISTS group_member_additions (
  id SERIAL PRIMARY KEY,
  group_jid VARCHAR(255) NOT NULL,
  added_user_jid VARCHAR(255) NOT NULL,  
  added_by_jid VARCHAR(255) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_group_user ON admin_promotions (group_jid, user_jid);
CREATE INDEX IF NOT EXISTS idx_promoted_at ON admin_promotions (promoted_at);
CREATE INDEX IF NOT EXISTS idx_group_added ON group_member_additions (group_jid, added_at);
CREATE INDEX IF NOT EXISTS idx_added_by ON group_member_additions (added_by_jid);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    n_o BIGSERIAL PRIMARY KEY,
    id VARCHAR(255) NOT NULL,
    from_jid VARCHAR(255) NOT NULL,
    sender_jid VARCHAR(255) NOT NULL,
    timestamp BIGINT NOT NULL,
    content TEXT,
    media TEXT,
    media_type VARCHAR(255),
    session_id VARCHAR(255),
    user_id VARCHAR(255),
    is_view_once BOOLEAN DEFAULT FALSE,
    from_me BOOLEAN DEFAULT FALSE,
    push_name VARCHAR(255) DEFAULT 'Unknown',
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp users table with all anti-features
CREATE TABLE IF NOT EXISTS whatsapp_users (
    id BIGSERIAL PRIMARY KEY,
    jid VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    telegram_id BIGINT,
    antiviewonce_enabled BOOLEAN DEFAULT FALSE,
    antideleted_enabled BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warnings table
CREATE TABLE IF NOT EXISTS warnings (
    id BIGSERIAL PRIMARY KEY,
    user_jid VARCHAR(255) NOT NULL,
    group_jid VARCHAR(255) NOT NULL,
    warning_type VARCHAR(50) NOT NULL,
    warning_count INTEGER DEFAULT 1,
    reason TEXT,
    last_warning_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Violations table
CREATE TABLE IF NOT EXISTS violations (
    id BIGSERIAL PRIMARY KEY,
    user_jid VARCHAR(255) NOT NULL,
    group_jid VARCHAR(255) NOT NULL,
    violation_type VARCHAR(50) NOT NULL,
    message_content TEXT,
    detected_content JSONB,
    action_taken VARCHAR(50),
    warning_number INTEGER,
    message_id VARCHAR(255),
    violated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group analytics table
CREATE TABLE IF NOT EXISTS group_analytics (
    id BIGSERIAL PRIMARY KEY,
    group_jid VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    total_messages INTEGER DEFAULT 0,
    total_media_messages INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    antilink_violations INTEGER DEFAULT 0,
    antispam_violations INTEGER DEFAULT 0,
    antiraid_violations INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    warned_users INTEGER DEFAULT 0,
    kicked_users INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraints using DO blocks for safe execution
DO $$
BEGIN
    -- Messages table unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'messages_id_session_unique'
        AND table_name = 'messages'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT messages_id_session_unique UNIQUE(id, session_id);
    END IF;

    -- Warnings table unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'warnings_user_group_type_unique'
        AND table_name = 'warnings'
    ) THEN
        ALTER TABLE warnings ADD CONSTRAINT warnings_user_group_type_unique UNIQUE(user_jid, group_jid, warning_type);
    END IF;

    -- Settings table unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'settings_user_session_key_unique'
        AND table_name = 'settings'
    ) THEN
        ALTER TABLE settings ADD CONSTRAINT settings_user_session_key_unique UNIQUE(user_id, session_id, setting_key);
    END IF;

    -- Group analytics unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'analytics_group_date_unique'
        AND table_name = 'group_analytics'
    ) THEN
        ALTER TABLE group_analytics ADD CONSTRAINT analytics_group_date_unique UNIQUE(group_jid, date);
    END IF;
END $$;

-- Create comprehensive indexes with safe execution
DO $$
BEGIN
    -- Users table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_telegram_id') THEN
        CREATE INDEX idx_users_telegram_id ON users(telegram_id);
    END IF;

    -- Sessions table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_telegram_id') THEN
        CREATE INDEX idx_sessions_telegram_id ON sessions(telegram_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_session_data') THEN
        CREATE INDEX idx_sessions_session_data ON sessions(session_id) WHERE session_data IS NOT NULL;
    END IF;

    -- Groups table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_groups_jid') THEN
        CREATE INDEX idx_groups_jid ON groups(jid);
    END IF;

    -- Messages table indexes (comprehensive set)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_session_id') THEN
        CREATE INDEX idx_messages_session_id ON messages(session_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_from_jid') THEN
        CREATE INDEX idx_messages_from_jid ON messages(from_jid);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_sender_jid') THEN
        CREATE INDEX idx_messages_sender_jid ON messages(sender_jid);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_timestamp_desc') THEN
        CREATE INDEX idx_messages_timestamp_desc ON messages(timestamp DESC);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_id_session') THEN
        CREATE INDEX idx_messages_id_session ON messages(id, session_id);
    END IF;

    -- WhatsApp users table indexes (comprehensive set)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_whatsapp_users_jid') THEN
        CREATE INDEX idx_whatsapp_users_jid ON whatsapp_users(jid);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_whatsapp_users_telegram_id') THEN
        CREATE INDEX idx_whatsapp_users_telegram_id ON whatsapp_users(telegram_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_whatsapp_users_antiviewonce') THEN
        CREATE INDEX idx_whatsapp_users_antiviewonce ON whatsapp_users(antiviewonce_enabled) WHERE antiviewonce_enabled = true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_whatsapp_users_telegram_antideleted') THEN
        CREATE INDEX idx_whatsapp_users_telegram_antideleted ON whatsapp_users(telegram_id, antideleted_enabled);
    END IF;

    -- Warnings table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_warnings_user_group') THEN
        CREATE INDEX idx_warnings_user_group ON warnings(user_jid, group_jid);
    END IF;

    -- Violations table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_violations_user_group') THEN
        CREATE INDEX idx_violations_user_group ON violations(user_jid, group_jid);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_violations_date') THEN
        CREATE INDEX idx_violations_date ON violations(violated_at DESC);
    END IF;

    -- Settings table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_settings_user_session') THEN
        CREATE INDEX idx_settings_user_session ON settings(user_id, session_id);
    END IF;

    -- Group analytics table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analytics_group_date') THEN
        CREATE INDEX idx_analytics_group_date ON group_analytics(group_jid, date);
    END IF;
END $$;

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers safely
DO $$
BEGIN
    -- Users table trigger
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Sessions table trigger
    DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
    CREATE TRIGGER update_sessions_updated_at 
        BEFORE UPDATE ON sessions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Groups table trigger
    DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
    CREATE TRIGGER update_groups_updated_at 
        BEFORE UPDATE ON groups 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- WhatsApp users table trigger
    DROP TRIGGER IF EXISTS update_whatsapp_users_updated_at ON whatsapp_users;
    CREATE TRIGGER update_whatsapp_users_updated_at 
        BEFORE UPDATE ON whatsapp_users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Warnings table trigger
    DROP TRIGGER IF EXISTS update_warnings_updated_at ON warnings;
    CREATE TRIGGER update_warnings_updated_at 
        BEFORE UPDATE ON warnings 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Settings table trigger
    DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
    CREATE TRIGGER update_settings_updated_at 
        BEFORE UPDATE ON settings 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- Contatos (qualquer número que aparece, salvo ou não)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id              TEXT PRIMARY KEY,      -- wid: 5511999999999@c.us
  number          TEXT,                  -- só os dígitos
  formatted_number TEXT,                 -- +55 11 99999-9999
  name            TEXT,                  -- nome salvo na agenda (se houver)
  pushname        TEXT,                  -- nome público do WhatsApp
  formatted_name  TEXT,
  is_saved        INTEGER DEFAULT 0,     -- 1 = está na sua agenda
  is_business     INTEGER DEFAULT 0,
  avatar_url      TEXT,
  avatar_path     TEXT,
  first_seen      INTEGER,
  updated_at      INTEGER
);

-- ----------------------------------------------------------------
-- Grupos
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id                TEXT PRIMARY KEY,    -- wid: xxxxxxxx@g.us
  subject           TEXT,                -- nome do grupo
  description       TEXT,                -- descrição do grupo
  owner_id          TEXT,                -- criador
  participant_count INTEGER DEFAULT 0,
  avatar_url        TEXT,
  avatar_path       TEXT,
  created_at        INTEGER,
  updated_at        INTEGER
);

-- ----------------------------------------------------------------
-- Participantes de cada grupo
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_participants (
  group_id       TEXT,
  contact_id     TEXT,
  is_admin       INTEGER DEFAULT 0,
  is_super_admin INTEGER DEFAULT 0,
  updated_at     INTEGER,
  PRIMARY KEY (group_id, contact_id)
);
-- Acelera a tela "Connections" (grupos com membros em comum).
CREATE INDEX IF NOT EXISTS idx_gp_contact ON group_participants(contact_id);

-- ----------------------------------------------------------------
-- Conversas (uma linha por chat: privado ou grupo) — agiliza a lista
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
  id                   TEXT PRIMARY KEY,
  type                 TEXT,             -- 'private' | 'group'
  contact_id           TEXT,
  group_id             TEXT,
  title                TEXT,             -- nome salvo / nome do grupo / número
  subtitle             TEXT,             -- número (em privado)
  avatar_path          TEXT,
  last_message_at      INTEGER,
  last_message_preview TEXT,
  last_message_from_me INTEGER DEFAULT 0,
  message_count        INTEGER DEFAULT 0,
  archived             INTEGER DEFAULT 0,
  muted                INTEGER DEFAULT 0,
  updated_at           INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chats_last ON chats(last_message_at DESC);

-- ----------------------------------------------------------------
-- Mensagens
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT PRIMARY KEY,
  chat_id            TEXT,
  chat_type          TEXT,              -- 'private' | 'group'
  group_id           TEXT,
  sender_id          TEXT,
  sender_name        TEXT,
  sender_number      TEXT,
  sender_avatar_path TEXT,
  from_me            INTEGER DEFAULT 0,
  type               TEXT,              -- chat, image, ptt, video, ...
  body               TEXT,
  caption            TEXT,
  media_path         TEXT,
  mimetype           TEXT,
  quoted_msg_id      TEXT,
  quoted_body        TEXT,
  quoted_type        TEXT,
  quoted_media_path  TEXT,
  is_view_once       INTEGER DEFAULT 0,
  forwarded          INTEGER DEFAULT 0,
  timestamp          INTEGER,           -- horário da mensagem (ms epoch)
  created_at         INTEGER            -- quando foi salva (ms epoch)
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);

-- ----------------------------------------------------------------
-- Logs (também gravados em arquivo via winston)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  level     TEXT,
  message   TEXT,
  meta      TEXT,
  timestamp INTEGER
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp DESC);

-- ----------------------------------------------------------------
-- Configurações da aplicação (editáveis pela dashboard)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER
);

-- ----------------------------------------------------------------
-- Sessões do dashboard
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT,
  created_at INTEGER,
  expires_at INTEGER
);

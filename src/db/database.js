'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Garante que os diretórios existem.
for (const dir of [config.dataDir, config.mediaDir, config.avatarDir, config.logsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Aplica o schema (idempotente).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrações: adiciona colunas novas em bancos já existentes.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('chats', 'archived', 'archived INTEGER DEFAULT 0');
ensureColumn('chats', 'muted', 'muted INTEGER DEFAULT 0');
ensureColumn('messages', 'quoted_type', 'quoted_type TEXT');
ensureColumn('messages', 'quoted_media_path', 'quoted_media_path TEXT');
ensureColumn('messages', 'is_view_once', 'is_view_once INTEGER DEFAULT 0');
ensureColumn('messages', 'forwarded', 'forwarded INTEGER DEFAULT 0');

module.exports = db;

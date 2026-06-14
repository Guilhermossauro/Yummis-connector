'use strict';

const db = require('./database');

const now = () => Date.now();

// ================================================================
//  CONTATOS
// ================================================================
const upsertContactStmt = db.prepare(`
  INSERT INTO contacts (id, number, formatted_number, name, pushname, formatted_name,
                        is_saved, is_business, avatar_url, avatar_path, first_seen, updated_at)
  VALUES (@id, @number, @formatted_number, @name, @pushname, @formatted_name,
          @is_saved, @is_business, @avatar_url, @avatar_path, @first_seen, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    number          = COALESCE(excluded.number, contacts.number),
    formatted_number= COALESCE(excluded.formatted_number, contacts.formatted_number),
    name            = COALESCE(excluded.name, contacts.name),
    pushname        = COALESCE(excluded.pushname, contacts.pushname),
    formatted_name  = COALESCE(excluded.formatted_name, contacts.formatted_name),
    is_saved        = excluded.is_saved,
    is_business     = excluded.is_business,
    updated_at      = excluded.updated_at
`);

function upsertContact(c) {
  upsertContactStmt.run({
    id: c.id,
    number: c.number || null,
    formatted_number: c.formatted_number || null,
    name: c.name || null,
    pushname: c.pushname || null,
    formatted_name: c.formatted_name || null,
    is_saved: c.is_saved ? 1 : 0,
    is_business: c.is_business ? 1 : 0,
    avatar_url: c.avatar_url || null,
    avatar_path: c.avatar_path || null,
    first_seen: c.first_seen || now(),
    updated_at: now()
  });
}

const setContactAvatarStmt = db.prepare(
  `UPDATE contacts SET avatar_url = @avatar_url, avatar_path = @avatar_path, updated_at = @updated_at WHERE id = @id`
);
function setContactAvatar(id, avatar_url, avatar_path) {
  setContactAvatarStmt.run({ id, avatar_url, avatar_path, updated_at: now() });
}

const getContactStmt = db.prepare(`SELECT * FROM contacts WHERE id = ?`);
const getContact = (id) => getContactStmt.get(id);

function listContacts({ search = '', limit = 500 } = {}) {
  const like = `%${search}%`;
  return db
    .prepare(
      `SELECT * FROM contacts
       WHERE (@search = '' OR name LIKE @like OR pushname LIKE @like OR number LIKE @like)
       ORDER BY is_saved DESC, COALESCE(name, pushname, number) COLLATE NOCASE ASC
       LIMIT @limit`
    )
    .all({ search, like, limit });
}

// ================================================================
//  GRUPOS
// ================================================================
const upsertGroupStmt = db.prepare(`
  INSERT INTO groups (id, subject, description, owner_id, participant_count,
                      avatar_url, avatar_path, created_at, updated_at)
  VALUES (@id, @subject, @description, @owner_id, @participant_count,
          @avatar_url, @avatar_path, @created_at, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    subject           = COALESCE(excluded.subject, groups.subject),
    description       = COALESCE(excluded.description, groups.description),
    owner_id          = COALESCE(excluded.owner_id, groups.owner_id),
    participant_count = COALESCE(excluded.participant_count, groups.participant_count),
    updated_at        = excluded.updated_at
`);

function upsertGroup(g) {
  upsertGroupStmt.run({
    id: g.id,
    subject: g.subject || null,
    description: g.description || null,
    owner_id: g.owner_id || null,
    participant_count: g.participant_count != null ? g.participant_count : null,
    avatar_url: g.avatar_url || null,
    avatar_path: g.avatar_path || null,
    created_at: g.created_at || now(),
    updated_at: now()
  });
}

const setGroupAvatarStmt = db.prepare(
  `UPDATE groups SET avatar_url = @avatar_url, avatar_path = @avatar_path, updated_at = @updated_at WHERE id = @id`
);
function setGroupAvatar(id, avatar_url, avatar_path) {
  setGroupAvatarStmt.run({ id, avatar_url, avatar_path, updated_at: now() });
}

const getGroupStmt = db.prepare(`SELECT * FROM groups WHERE id = ?`);
const getGroup = (id) => getGroupStmt.get(id);

function listGroups({ search = '', limit = 500 } = {}) {
  const like = `%${search}%`;
  return db
    .prepare(
      `SELECT * FROM groups
       WHERE (@search = '' OR subject LIKE @like OR description LIKE @like)
       ORDER BY subject COLLATE NOCASE ASC
       LIMIT @limit`
    )
    .all({ search, like, limit });
}

const upsertParticipantStmt = db.prepare(`
  INSERT INTO group_participants (group_id, contact_id, is_admin, is_super_admin, updated_at)
  VALUES (@group_id, @contact_id, @is_admin, @is_super_admin, @updated_at)
  ON CONFLICT(group_id, contact_id) DO UPDATE SET
    is_admin = excluded.is_admin,
    is_super_admin = excluded.is_super_admin,
    updated_at = excluded.updated_at
`);
function upsertParticipant(p) {
  upsertParticipantStmt.run({
    group_id: p.group_id,
    contact_id: p.contact_id,
    is_admin: p.is_admin ? 1 : 0,
    is_super_admin: p.is_super_admin ? 1 : 0,
    updated_at: now()
  });
}

function getGroupParticipants(groupId) {
  return db
    .prepare(
      `SELECT gp.is_admin, gp.is_super_admin,
              c.id, c.number, c.formatted_number, c.name, c.pushname, c.is_saved, c.avatar_path
       FROM group_participants gp
       LEFT JOIN contacts c ON c.id = gp.contact_id
       WHERE gp.group_id = ?
       ORDER BY gp.is_super_admin DESC, gp.is_admin DESC,
                COALESCE(c.name, c.pushname, c.number) COLLATE NOCASE ASC`
    )
    .all(groupId);
}

// ================================================================
//  CHATS (conversas)
// ================================================================
const upsertChatStmt = db.prepare(`
  INSERT INTO chats (id, type, contact_id, group_id, title, subtitle, avatar_path,
                     last_message_at, last_message_preview, last_message_from_me,
                     message_count, updated_at)
  VALUES (@id, @type, @contact_id, @group_id, @title, @subtitle, @avatar_path,
          @last_message_at, @last_message_preview, @last_message_from_me, 1, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    type                 = excluded.type,
    contact_id           = COALESCE(excluded.contact_id, chats.contact_id),
    group_id             = COALESCE(excluded.group_id, chats.group_id),
    title                = excluded.title,
    subtitle             = COALESCE(excluded.subtitle, chats.subtitle),
    avatar_path          = COALESCE(excluded.avatar_path, chats.avatar_path),
    last_message_at      = excluded.last_message_at,
    last_message_preview = excluded.last_message_preview,
    last_message_from_me = excluded.last_message_from_me,
    message_count        = chats.message_count + 1,
    updated_at           = excluded.updated_at
`);

function upsertChatOnMessage(chat) {
  upsertChatStmt.run({
    id: chat.id,
    type: chat.type,
    contact_id: chat.contact_id || null,
    group_id: chat.group_id || null,
    title: chat.title || chat.id,
    subtitle: chat.subtitle || null,
    avatar_path: chat.avatar_path || null,
    last_message_at: chat.last_message_at,
    last_message_preview: chat.last_message_preview || '',
    last_message_from_me: chat.last_message_from_me ? 1 : 0,
    updated_at: now()
  });
}

const setChatAvatarStmt = db.prepare(`UPDATE chats SET avatar_path = ? WHERE id = ?`);
const setChatAvatar = (id, avatarPath) => setChatAvatarStmt.run(avatarPath, id);

const getChatStmt = db.prepare(`SELECT * FROM chats WHERE id = ?`);
const getChat = (id) => getChatStmt.get(id);

function listChats({ search = '', type = '', archived = 'active', limit = 500 } = {}) {
  const like = `%${search}%`;
  let archCond = 'AND COALESCE(archived, 0) = 0';
  if (archived === 'archived') archCond = 'AND COALESCE(archived, 0) = 1';
  else if (archived === 'all') archCond = '';
  return db
    .prepare(
      `SELECT * FROM chats
       WHERE (@search = '' OR title LIKE @like OR subtitle LIKE @like)
         AND (@type = '' OR type = @type)
         ${archCond}
       ORDER BY last_message_at DESC
       LIMIT @limit`
    )
    .all({ search, like, type, limit });
}

const setChatArchivedStmt = db.prepare(`UPDATE chats SET archived = ?, updated_at = ? WHERE id = ?`);
const setChatArchived = (id, val) => setChatArchivedStmt.run(val ? 1 : 0, now(), id);

const setChatMutedStmt = db.prepare(`UPDATE chats SET muted = ?, updated_at = ? WHERE id = ?`);
const setChatMuted = (id, val) => setChatMutedStmt.run(val ? 1 : 0, now(), id);

// Limpa o conteúdo de uma conversa (apaga mensagens locais, mantém o chat).
function clearChat(id) {
  db.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(id);
  db.prepare(
    `UPDATE chats SET message_count = 0, last_message_preview = '', updated_at = ? WHERE id = ?`
  ).run(now(), id);
}

// ================================================================
//  MENSAGENS
// ================================================================
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (id, chat_id, chat_type, group_id, sender_id, sender_name,
                        sender_number, sender_avatar_path, from_me, type, body, caption,
                        media_path, mimetype, quoted_msg_id, quoted_body, quoted_type,
                        quoted_media_path, is_view_once, forwarded, timestamp, created_at)
  VALUES (@id, @chat_id, @chat_type, @group_id, @sender_id, @sender_name,
          @sender_number, @sender_avatar_path, @from_me, @type, @body, @caption,
          @media_path, @mimetype, @quoted_msg_id, @quoted_body, @quoted_type,
          @quoted_media_path, @is_view_once, @forwarded, @timestamp, @created_at)
  ON CONFLICT(id) DO NOTHING
`);

function insertMessage(m) {
  const info = insertMessageStmt.run({
    id: m.id,
    chat_id: m.chat_id,
    chat_type: m.chat_type,
    group_id: m.group_id || null,
    sender_id: m.sender_id || null,
    sender_name: m.sender_name || null,
    sender_number: m.sender_number || null,
    sender_avatar_path: m.sender_avatar_path || null,
    from_me: m.from_me ? 1 : 0,
    type: m.type || 'chat',
    body: m.body || null,
    caption: m.caption || null,
    media_path: m.media_path || null,
    mimetype: m.mimetype || null,
    quoted_msg_id: m.quoted_msg_id || null,
    quoted_body: m.quoted_body || null,
    quoted_type: m.quoted_type || null,
    quoted_media_path: m.quoted_media_path || null,
    is_view_once: m.is_view_once ? 1 : 0,
    forwarded: m.forwarded ? 1 : 0,
    timestamp: m.timestamp || now(),
    created_at: now()
  });
  return info.changes > 0; // false = mensagem duplicada
}

const getMessageByIdStmt = db.prepare(`SELECT * FROM messages WHERE id = ?`);
const getMessageById = (id) => getMessageByIdStmt.get(id);

// Apaga uma mensagem só do nosso banco (apagar "para mim" no painel).
function deleteMessageLocal(id) {
  const msg = getMessageById(id);
  if (!msg) return false;
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
  db.prepare(
    `UPDATE chats SET message_count = MAX(message_count - 1, 0) WHERE id = ?`
  ).run(msg.chat_id);
  return true;
}

const setMessageMediaStmt = db.prepare(`UPDATE messages SET media_path = ? WHERE id = ?`);
const setMessageMedia = (id, mediaPath) => setMessageMediaStmt.run(mediaPath, id);

// Paginação reversa (carrega as mais recentes; `before` busca as anteriores).
// Enriquece com dados do contato remetente para exibição estilo WhatsApp
// (nome + número + foto), sem precisar gravar isso em cada mensagem.
function getMessages(chatId, { limit = 50, before = null } = {}) {
  const rows = db
    .prepare(
      `SELECT m.*,
              c.name           AS c_name,
              c.pushname       AS c_pushname,
              c.is_saved       AS c_is_saved,
              c.avatar_path    AS c_avatar,
              c.formatted_number AS c_fnumber
       FROM messages m
       LEFT JOIN contacts c ON c.id = m.sender_id
       WHERE m.chat_id = @chatId
         AND (@before IS NULL OR m.timestamp < @before)
       ORDER BY m.timestamp DESC
       LIMIT @limit`
    )
    .all({ chatId, before, limit });
  return rows.reverse(); // ordem cronológica ascendente
}

function countMessages(chatId) {
  return db.prepare(`SELECT COUNT(*) n FROM messages WHERE chat_id = ?`).get(chatId).n;
}

function searchMessages({ q, limit = 100 } = {}) {
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT m.*, c.title AS chat_title, c.type AS chat_kind
       FROM messages m
       LEFT JOIN chats c ON c.id = m.chat_id
       WHERE m.body LIKE @like OR m.caption LIKE @like OR m.sender_name LIKE @like
       ORDER BY m.timestamp DESC
       LIMIT @limit`
    )
    .all({ like, limit });
}

// Exporta todas as mensagens de um chat em ordem cronológica (para resumos).
function getAllMessagesForChat(chatId) {
  return db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC`)
    .all(chatId);
}

// ================================================================
//  ESTATÍSTICAS / DASHBOARD
// ================================================================
function getStats() {
  const totalMessages = db.prepare(`SELECT COUNT(*) n FROM messages`).get().n;
  const totalContacts = db.prepare(`SELECT COUNT(*) n FROM contacts`).get().n;
  const totalGroups = db.prepare(`SELECT COUNT(*) n FROM groups`).get().n;
  const totalChats = db.prepare(`SELECT COUNT(*) n FROM chats`).get().n;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const messagesToday = db
    .prepare(`SELECT COUNT(*) n FROM messages WHERE timestamp >= ?`)
    .get(startOfDay.getTime()).n;

  // Mensagens por dia (últimos 14 dias)
  const perDay = db
    .prepare(
      `SELECT date(timestamp / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(Date.now() - 14 * 24 * 3600 * 1000);

  const byType = db
    .prepare(`SELECT type, COUNT(*) n FROM messages GROUP BY type ORDER BY n DESC`)
    .all();

  const topChats = db
    .prepare(
      `SELECT id, title, type, avatar_path, message_count
       FROM chats ORDER BY message_count DESC LIMIT 8`
    )
    .all();

  return {
    totalMessages,
    totalContacts,
    totalGroups,
    totalChats,
    messagesToday,
    perDay,
    byType,
    topChats
  };
}

// ================================================================
//  LOGS
// ================================================================
const insertLogStmt = db.prepare(
  `INSERT INTO logs (level, message, meta, timestamp) VALUES (?, ?, ?, ?)`
);
function insertLog(level, message, meta) {
  try {
    insertLogStmt.run(level, message, meta ? JSON.stringify(meta) : null, now());
  } catch (_) {
    /* nunca deixa o log derrubar a app */
  }
}

function listLogs({ level = '', limit = 300 } = {}) {
  return db
    .prepare(
      `SELECT * FROM logs
       WHERE (@level = '' OR level = @level)
       ORDER BY timestamp DESC LIMIT @limit`
    )
    .all({ level, limit });
}

// ================================================================
//  SETTINGS
// ================================================================
const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);
const setSetting = (key, value) => setSettingStmt.run(key, String(value), now());

const getSettingStmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
function getSetting(key, def = null) {
  const row = getSettingStmt.get(key);
  return row ? row.value : def;
}
function getAllSettings() {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ================================================================
//  CONNECTIONS (grupos que compartilham membros)
// ================================================================
function getConnections({ minShared = 1, limit = 300 } = {}) {
  const rows = db
    .prepare(
      `SELECT a.group_id AS g1, b.group_id AS g2, COUNT(*) AS shared
       FROM group_participants a
       JOIN group_participants b
         ON a.contact_id = b.contact_id AND a.group_id < b.group_id
       GROUP BY a.group_id, b.group_id
       HAVING shared >= @minShared
       ORDER BY shared DESC
       LIMIT @limit`
    )
    .all({ minShared, limit });

  const cache = {};
  const info = (id) => (cache[id] = cache[id] || getGroup(id) || { id, subject: id });
  return rows.map((r) => ({
    shared: r.shared,
    g1: info(r.g1),
    g2: info(r.g2)
  }));
}

function getSharedMembers(g1, g2) {
  return db
    .prepare(
      `SELECT c.id, c.name, c.pushname, c.number, c.formatted_number, c.is_saved, c.avatar_path
       FROM group_participants a
       JOIN group_participants b ON a.contact_id = b.contact_id
       JOIN contacts c ON c.id = a.contact_id
       WHERE a.group_id = @g1 AND b.group_id = @g2
       ORDER BY COALESCE(c.name, c.pushname, c.number) COLLATE NOCASE ASC`
    )
    .all({ g1, g2 });
}

// Membros de UM grupo que também estão em outros grupos, com a lista
// desses outros grupos por contato (tela Connections: grupo -> contatos).
function getGroupConnections(groupId) {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.pushname, c.number, c.formatted_number, c.is_saved, c.avatar_path,
              og.id AS og_id, og.subject AS og_subject, og.avatar_path AS og_avatar
       FROM group_participants gp
       JOIN group_participants gp2
         ON gp2.contact_id = gp.contact_id AND gp2.group_id <> gp.group_id
       JOIN contacts c ON c.id = gp.contact_id
       JOIN groups og ON og.id = gp2.group_id
       WHERE gp.group_id = @groupId
       ORDER BY COALESCE(c.name, c.pushname, c.number) COLLATE NOCASE ASC,
                og.subject COLLATE NOCASE ASC`
    )
    .all({ groupId });

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id)) {
      map.set(r.id, {
        id: r.id,
        name: r.name,
        pushname: r.pushname,
        number: r.number,
        formatted_number: r.formatted_number,
        is_saved: r.is_saved,
        avatar_path: r.avatar_path,
        groups: []
      });
    }
    map.get(r.id).groups.push({ id: r.og_id, subject: r.og_subject, avatar_path: r.og_avatar });
  }
  return [...map.values()];
}

function getContactGroups(contactId) {
  return db
    .prepare(
      `SELECT g.id, g.subject, g.avatar_path, gp.is_admin, gp.is_super_admin
       FROM group_participants gp
       JOIN groups g ON g.id = gp.group_id
       WHERE gp.contact_id = ?
       ORDER BY g.subject COLLATE NOCASE ASC`
    )
    .all(contactId);
}

// ================================================================
//  SESSÕES (auth)
// ================================================================
const createSessionStmt = db.prepare(
  `INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)`
);
function createSession(token, username, ttlHours) {
  const created = now();
  const expires = created + ttlHours * 3600 * 1000;
  createSessionStmt.run(token, username, created, expires);
  return expires;
}
const getSessionStmt = db.prepare(`SELECT * FROM sessions WHERE token = ?`);
const getSession = (token) => getSessionStmt.get(token);
const deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE token = ?`);
const deleteSession = (token) => deleteSessionStmt.run(token);
function purgeExpiredSessions() {
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now());
}

module.exports = {
  db,
  // contatos
  upsertContact,
  setContactAvatar,
  getContact,
  listContacts,
  // grupos
  upsertGroup,
  setGroupAvatar,
  getGroup,
  listGroups,
  upsertParticipant,
  getGroupParticipants,
  // chats
  upsertChatOnMessage,
  setChatAvatar,
  setChatArchived,
  setChatMuted,
  clearChat,
  getChat,
  listChats,
  // mensagens
  insertMessage,
  setMessageMedia,
  getMessages,
  countMessages,
  getMessageById,
  deleteMessageLocal,
  searchMessages,
  getAllMessagesForChat,
  // connections / detalhes
  getConnections,
  getSharedMembers,
  getGroupConnections,
  getContactGroups,
  // stats
  getStats,
  // logs
  insertLog,
  listLogs,
  // settings
  setSetting,
  getSetting,
  getAllSettings,
  // sessões
  createSession,
  getSession,
  deleteSession,
  purgeExpiredSessions
};

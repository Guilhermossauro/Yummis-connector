'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const models = require('../db/models');
const { ensureAvatar } = require('./avatars');
const {
  serializeId,
  numberFromId,
  formatNumber,
  isGroupId,
  previewForMessage
} = require('./util');

// ---------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------
function resolveFromMe(message) {
  return (
    message.fromMe === true ||
    (message.id && typeof message.id === 'object' && message.id.fromMe === true) ||
    message.self === 'out'
  );
}

// Regra do projeto: contato salvo -> nome; não salvo -> apenas o número.
function displayName(contact, number) {
  const saved = contact && contact.isMyContact === true;
  if (saved && (contact.name || contact.formattedName)) {
    return contact.name || contact.formattedName;
  }
  return formatNumber(number) || number || 'Desconhecido';
}

function safeName(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extFromMime(mime) {
  if (!mime) return 'bin';
  const sub = mime.split('/')[1] || 'bin';
  const clean = sub.split(';')[0];
  const map = { jpeg: 'jpg', 'x-m4a': 'm4a', mpeg: 'mp3', 'plain': 'txt' };
  return map[clean] || clean;
}

// Tipos cujo `body` do open-wa é lixo (base64/hash do arquivo): não guardamos.
const MEDIA_TYPES = new Set(['image', 'video', 'ptt', 'audio', 'document', 'sticker']);

// Loga cada mensagem em um bloco organizado, no estilo do console.log do usuário.
function logIncoming({ ts, sender, isGroup, groupTitle, fromId, type, mimetype, text }) {
  const k = (s) => s.padEnd(12, ' ');
  const lines = [
    '---------------------------------------',
    `${k('DATE TIME')}===> ${new Date(ts).toLocaleString('pt-BR')}`,
    `${k('FROM')}===> ${sender}${isGroup ? `  IN  ${groupTitle}` : ''}`,
    `${k('FROM_ID')}===> ${fromId || '-'}`,
    `${k('TYPE')}===> ${mimetype ? `[${mimetype}]` : type}`,
    `${k('BODY')}===> ${mimetype ? `[${mimetype}]` : text || ''}`
  ];
  logger.info(lines.join('\n'));
}

// Substitui menções "@número" pelo nome do contato (quando conhecido).
function resolveMentions(text, mentions) {
  if (!text || !mentions || !mentions.length) return text;
  let out = text;
  for (const mm of mentions) {
    if (mm.number && mm.name) out = out.split('@' + mm.number).join('@' + mm.name);
  }
  return out;
}

// Encaminha a mensagem para um webhook (JSON), se configurado nas settings.
async function dispatchWebhook(payload) {
  try {
    const url = models.getSetting('webhook_url');
    const enabled = models.getSetting('webhook_enabled') === 'true';
    if (!url || !enabled) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    logger.debug(`Webhook falhou: ${err.message}`);
  }
}

async function maybeSaveMedia(client, message) {
  if (!config.media.save) return null;
  if (!config.media.types.includes(message.type)) return null;
  if (!message.mimetype) return null;
  try {
    const decrypted = await client.decryptMedia(message);
    let buf;
    if (Buffer.isBuffer(decrypted)) buf = decrypted;
    else if (typeof decrypted === 'string') {
      const b64 = decrypted.includes(',') ? decrypted.split(',')[1] : decrypted;
      buf = Buffer.from(b64, 'base64');
    } else return null;

    const dir = path.join(config.mediaDir, message.type);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${safeName(message.id)}.${extFromMime(message.mimetype)}`;
    fs.writeFileSync(path.join(dir, fname), buf);
    return `/media/${message.type}/${fname}`;
  } catch (err) {
    logger.debug(`Falha ao salvar mídia (${message.type}): ${err.message}`);
    return null;
  }
}

// Atualiza fotos de perfil em segundo plano (não bloqueia o salvamento).
async function ensureAvatarsInBackground(client, ctx) {
  try {
    if (ctx.isGroup && ctx.groupId) {
      const g = models.getGroup(ctx.groupId);
      const p = await ensureAvatar(client, ctx.groupId, g && g.avatar_path);
      if (p && (!g || p !== g.avatar_path)) {
        models.setGroupAvatar(ctx.groupId, null, p);
        models.setChatAvatar(ctx.chatId, p);
      }
    } else if (!ctx.isGroup && ctx.contactId) {
      const c = models.getContact(ctx.contactId);
      const p = await ensureAvatar(client, ctx.contactId, c && c.avatar_path);
      if (p && (!c || p !== c.avatar_path)) {
        models.setContactAvatar(ctx.contactId, null, p);
        models.setChatAvatar(ctx.chatId, p);
      }
    }
    if (ctx.senderId) {
      const sc = models.getContact(ctx.senderId);
      const sp = await ensureAvatar(client, ctx.senderId, sc && sc.avatar_path);
      if (sp && (!sc || sp !== sc.avatar_path)) {
        models.setContactAvatar(ctx.senderId, null, sp);
      }
    }
  } catch (_) {
    /* best-effort */
  }
}

// ---------------------------------------------------------------
//  Tratamento de cada mensagem
// ---------------------------------------------------------------
async function handleMessage(client, message, opts = {}) {
  const { skipMedia = false, skipAvatars = false, quiet = false } = opts;
  try {
    if (!message || message.isNotification || message.type === 'e2e_notification') return false;
    if (message.type === 'protocol' || message.type === 'gp2') return false;

    const fromMe = resolveFromMe(message);
    if (fromMe && !config.whatsapp.captureOutgoing) return false;

    const ts = message.t ? message.t * 1000 : Date.now();
    const chatId = serializeId(message.chatId) || message.from;
    const isGroup = isGroupId(chatId) || message.isGroupMsg === true;

    // ----- Remetente -----
    const senderContact = message.sender || {};
    const senderId =
      serializeId(senderContact.id) || message.author || (fromMe ? null : chatId);
    const senderNumber = numberFromId(senderId);
    const senderSaved = senderContact.isMyContact === true;

    if (senderId && !fromMe) {
      models.upsertContact({
        id: senderId,
        number: senderNumber,
        formatted_number: formatNumber(senderNumber),
        name: senderSaved ? senderContact.name || senderContact.formattedName : null,
        pushname: senderContact.pushname || senderContact.notifyName || null,
        formatted_name: senderContact.formattedName || null,
        is_saved: senderSaved,
        is_business: senderContact.isBusiness === true
      });
    }

    const senderDisplay = fromMe ? 'Você' : displayName(senderContact, senderNumber);

    // ----- Resolve chat (privado x grupo) -----
    let groupId = null;
    let contactId = null;
    let chatTitle;
    let chatSubtitle = null;
    let chatAvatar = null;

    if (isGroup) {
      groupId = chatId;
      const meta = (message.chat && message.chat.groupMetadata) || {};
      const subject =
        (message.chat && (message.chat.name || message.chat.formattedTitle)) ||
        meta.subject ||
        groupId;
      const desc = meta.desc || meta.description || null;
      const owner = serializeId(meta.owner) || null;
      const participants = meta.participants || [];

      models.upsertGroup({
        id: groupId,
        subject,
        description: desc,
        owner_id: owner,
        participant_count: participants.length || null
      });

      for (const p of participants) {
        const pid = serializeId(p.id);
        if (!pid) continue;
        const pnum = numberFromId(pid);
        models.upsertContact({
          id: pid,
          number: pnum,
          formatted_number: formatNumber(pnum),
          is_saved: false
        });
        models.upsertParticipant({
          group_id: groupId,
          contact_id: pid,
          is_admin: p.isAdmin === true,
          is_super_admin: p.isSuperAdmin === true
        });
      }

      chatTitle = subject;
      const g = models.getGroup(groupId);
      chatAvatar = g && g.avatar_path;
    } else {
      // Conversa privada: o "outro lado" pode não ser o remetente (msgs enviadas).
      const otherContact =
        (message.chat && message.chat.contact) || (fromMe ? {} : senderContact);
      contactId =
        serializeId(otherContact.id) ||
        (fromMe ? serializeId(message.to) : senderId) ||
        chatId;
      const otherNumber = numberFromId(contactId);
      const otherSaved = otherContact.isMyContact === true;

      models.upsertContact({
        id: contactId,
        number: otherNumber,
        formatted_number: formatNumber(otherNumber),
        name: otherSaved ? otherContact.name || otherContact.formattedName : null,
        pushname: otherContact.pushname || otherContact.notifyName || null,
        formatted_name: otherContact.formattedName || null,
        is_saved: otherSaved,
        is_business: otherContact.isBusiness === true
      });

      chatTitle = displayName(otherContact, otherNumber);
      chatSubtitle = formatNumber(otherNumber);
      const c = models.getContact(contactId);
      chatAvatar = c && c.avatar_path;
    }

    // ----- Menções (@número -> @nome) -----
    const mentionedJidList = Array.isArray(message.mentionedJidList) ? message.mentionedJidList : [];
    const mentions = mentionedJidList.map((j) => {
      const mid = serializeId(j);
      const num = numberFromId(mid);
      const mc = mid ? models.getContact(mid) : null;
      const name = mc ? (mc.is_saved && mc.name ? mc.name : mc.pushname || null) : null;
      return { id: mid, number: num, name };
    });

    // ----- Mídia -----
    const isMedia = MEDIA_TYPES.has(message.type);
    const mediaPath = skipMedia ? null : await maybeSaveMedia(client, message);
    const resolvedBody = isMedia ? null : resolveMentions(message.body || null, mentions);

    // ----- Citação (mensagem respondida) -----
    const quoted = message.quotedMsg || message.quotedMsgObj;
    const quotedId = quoted
      ? serializeId(quoted.id) || (typeof quoted.id === 'string' ? quoted.id : null)
      : null;
    const quotedBody = quoted ? quoted.body || quoted.caption || null : null;
    const quotedType = quoted ? quoted.type || null : null;
    // Se a mensagem citada já estiver salva, reaproveita o caminho da mídia
    // (ex.: responder a uma imagem mostra a imagem na citação).
    let quotedMediaPath = null;
    if (quotedId) {
      const qm = models.getMessageById(quotedId);
      if (qm) quotedMediaPath = qm.media_path || null;
    }

    const isViewOnce = message.isViewOnce === true || message.isViewOnceMedia === true;
    const isForwarded = message.isForwarded === true || (message.forwardingScore || 0) > 0;

    // ----- Salva a mensagem -----
    const inserted = models.insertMessage({
      id: serializeId(message.id) || message.id,
      chat_id: chatId,
      chat_type: isGroup ? 'group' : 'private',
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderDisplay,
      sender_number: senderNumber,
      sender_avatar_path: null,
      from_me: fromMe,
      type: message.type,
      // Em mídias o "body" do open-wa costuma ser o base64/hash do arquivo —
      // não guardamos isso; ficamos apenas com a legenda (caption).
      // Em texto, as menções @número já vêm resolvidas para @nome.
      body: resolvedBody,
      caption: message.caption || null,
      media_path: mediaPath,
      mimetype: message.mimetype || null,
      quoted_msg_id: quotedId,
      quoted_body: quotedBody,
      quoted_type: quotedType,
      quoted_media_path: quotedMediaPath,
      is_view_once: isViewOnce,
      forwarded: isForwarded,
      timestamp: ts
    });

    if (!inserted) return false; // mensagem já existia

    // ----- Atualiza a conversa (lista) -----
    models.upsertChatOnMessage({
      id: chatId,
      type: isGroup ? 'group' : 'private',
      contact_id: contactId,
      group_id: groupId,
      title: chatTitle,
      subtitle: chatSubtitle,
      avatar_path: chatAvatar,
      last_message_at: ts,
      last_message_preview: previewForMessage(message),
      last_message_from_me: fromMe
    });

    // Log organizado + webhook (silenciados em carga em massa de histórico).
    if (!quiet) {
      logIncoming({
        ts,
        sender: senderDisplay,
        isGroup,
        groupTitle: chatTitle,
        fromId: fromMe ? chatId : senderId,
        type: message.type,
        mimetype: isMedia ? message.mimetype : null,
        text: previewForMessage(message)
      });
      dispatchWebhook({
        id: serializeId(message.id) || message.id,
        chat_id: chatId,
        chat_type: isGroup ? 'group' : 'private',
        group_id: groupId,
        group_name: isGroup ? chatTitle : null,
        sender: { id: senderId, name: senderDisplay, number: senderNumber },
        from_me: fromMe,
        type: message.type,
        body: resolvedBody,
        caption: message.caption || null,
        media_url: mediaPath,
        mimetype: message.mimetype || null,
        mentions,
        timestamp: ts
      });
    }

    // Fotos de perfil em segundo plano.
    if (!skipAvatars) {
      ensureAvatarsInBackground(client, {
        isGroup,
        chatId,
        groupId,
        contactId,
        senderId: isGroup ? senderId : null
      });
    }
    return true;
  } catch (err) {
    logger.error(`Erro ao tratar mensagem: ${err.message}`);
    return false;
  }
}

// Estado das tarefas longas (sync / histórico), lido pela dashboard.
const tasks = {
  sync: { running: false, done: 0, total: 0, label: '' },
  history: { running: false, done: 0, total: 0, label: '' }
};

// ---------------------------------------------------------------
//  Sincronização de contatos, grupos (detalhes) e fotos de perfil
// ---------------------------------------------------------------
async function syncAll(client) {
  if (tasks.sync.running) return tasks.sync;
  tasks.sync = { running: true, done: 0, total: 0, label: 'Lendo grupos e contatos...' };
  logger.info('Sincronizando contatos, grupos e fotos de perfil...');
  let groupCount = 0;
  let contactCount = 0;
  const avatarTargets = [];
  const seen = new Set();
  const addTarget = (kind, id) => {
    if (!id) return;
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    avatarTargets.push({ kind, id });
  };

  // ----- Grupos (com descrição e participantes) -----
  try {
    const groups = await client.getAllGroups().catch(() => []);
    for (const g of groups) {
      const gid = serializeId(g.id) || g.id;
      if (!gid) continue;
      let meta = g.groupMetadata || g;
      let desc = meta.desc || meta.description || null;
      let participants = meta.participants || g.participants || [];
      // Busca detalhes completos quando faltarem (descrição / participantes).
      if ((!desc || participants.length === 0) && typeof client.getGroupMetadata === 'function') {
        const full = await client.getGroupMetadata(gid).catch(() => null);
        if (full) {
          meta = full;
          desc = full.desc || full.description || desc;
          participants = full.participants || participants;
        }
      }
      models.upsertGroup({
        id: gid,
        subject: g.name || g.formattedTitle || meta.subject || gid,
        description: desc,
        owner_id: serializeId(meta.owner),
        participant_count: participants.length || null
      });
      addTarget('group', gid);
      for (const p of participants) {
        const pid = serializeId(p.id);
        if (!pid) continue;
        const pnum = numberFromId(pid);
        models.upsertContact({
          id: pid,
          number: pnum,
          formatted_number: formatNumber(pnum),
          is_saved: false
        });
        models.upsertParticipant({
          group_id: gid,
          contact_id: pid,
          is_admin: p.isAdmin === true,
          is_super_admin: p.isSuperAdmin === true
        });
        addTarget('contact', pid);
      }
      groupCount++;
    }
  } catch (err) {
    logger.warn(`Falha ao sincronizar grupos: ${err.message}`);
  }

  // ----- Contatos da agenda -----
  try {
    const contacts = await client.getAllContacts().catch(() => []);
    for (const c of contacts) {
      const cid = serializeId(c.id);
      if (!cid || cid.endsWith('@g.us') || cid.endsWith('@broadcast')) continue;
      const num = numberFromId(cid);
      models.upsertContact({
        id: cid,
        number: num,
        formatted_number: formatNumber(num),
        name: c.isMyContact ? c.name || c.formattedName : null,
        pushname: c.pushname || null,
        formatted_name: c.formattedName || null,
        is_saved: c.isMyContact === true,
        is_business: c.isBusiness === true
      });
      if (c.isMyContact) addTarget('contact', cid);
      contactCount++;
    }
  } catch (err) {
    logger.warn(`Falha ao sincronizar contatos: ${err.message}`);
  }

  // Garante avatar de quem tem conversa privada salva.
  for (const ch of models.listChats({ type: 'private', archived: 'all', limit: 5000 })) {
    if (ch.contact_id) addTarget('contact', ch.contact_id);
  }

  // ----- Fotos de perfil (em série, pula as já baixadas) -----
  let avatarCount = 0;
  if (config.media.saveAvatars) {
    tasks.sync.total = avatarTargets.length;
    tasks.sync.label = 'Baixando fotos de perfil...';
    let i = 0;
    for (const t of avatarTargets) {
      try {
        if (t.kind === 'group') {
          const g = models.getGroup(t.id);
          const p = await ensureAvatar(client, t.id, g && g.avatar_path);
          if (p && (!g || p !== g.avatar_path)) {
            models.setGroupAvatar(t.id, null, p);
            models.setChatAvatar(t.id, p);
            avatarCount++;
          }
        } else {
          const c = models.getContact(t.id);
          const p = await ensureAvatar(client, t.id, c && c.avatar_path);
          if (p && (!c || p !== c.avatar_path)) {
            models.setContactAvatar(t.id, null, p);
            models.setChatAvatar(t.id, p);
            avatarCount++;
          }
        }
      } catch (_) {
        /* best-effort */
      }
      i++;
      tasks.sync.done = i;
      if (i % 50 === 0) logger.info(`Sync de fotos: ${i}/${avatarTargets.length}`);
    }
  }

  tasks.sync.running = false;
  logger.info(
    `Sync concluído: ${groupCount} grupos, ${contactCount} contatos, ${avatarCount} fotos novas.`
  );
  return { groups: groupCount, contacts: contactCount, avatars: avatarCount };
}

// ---------------------------------------------------------------
//  Carregar mensagens antigas (histórico) de todas as conversas
// ---------------------------------------------------------------
async function loadHistory(client, { maxPagesPerChat = 8 } = {}) {
  if (tasks.history.running) return tasks.history;
  tasks.history = { running: true, done: 0, total: 0, label: 'Listando conversas...' };

  let chatIds = [];
  try {
    if (typeof client.getAllChatIds === 'function') {
      chatIds = (await client.getAllChatIds()).map((c) => serializeId(c) || c).filter(Boolean);
    } else {
      const chats = await client.getAllChats().catch(() => []);
      chatIds = chats.map((c) => serializeId(c.id)).filter(Boolean);
    }
  } catch (err) {
    logger.warn(`load-history: falha ao listar conversas: ${err.message}`);
  }

  tasks.history.total = chatIds.length;
  tasks.history.label = 'Carregando mensagens antigas...';
  logger.info(`Carregando histórico de ${chatIds.length} conversas...`);

  let saved = 0;
  let idx = 0;
  for (const cid of chatIds) {
    idx++;
    tasks.history.done = idx;
    try {
      if (typeof client.loadEarlierMessages === 'function') {
        for (let p = 0; p < maxPagesPerChat; p++) {
          const earlier = await client.loadEarlierMessages(cid).catch(() => null);
          if (!earlier || !earlier.length) break;
        }
      }
      let msgs = [];
      if (typeof client.getAllMessagesInChat === 'function') {
        msgs = await client.getAllMessagesInChat(cid, true, false).catch(() => []);
      } else if (typeof client.loadAndGetAllMessagesInChat === 'function') {
        msgs = await client.loadAndGetAllMessagesInChat(cid, true, false).catch(() => []);
      }
      for (const m of msgs) {
        if (await handleMessage(client, m, { skipMedia: true, skipAvatars: true, quiet: true })) {
          saved++;
        }
      }
    } catch (err) {
      logger.debug(`load-history ${cid}: ${err.message}`);
    }
    if (idx % 10 === 0) {
      logger.info(`Histórico: ${idx}/${chatIds.length} conversas, ${saved} novas mensagens.`);
    }
  }

  tasks.history.running = false;
  logger.info(`Histórico concluído: ${saved} novas mensagens de ${chatIds.length} conversas.`);
  return { chats: chatIds.length, saved };
}

// Carrega mensagens antigas de UMA conversa específica (sob demanda na thread).
async function loadChatHistory(client, chatId, { maxPages = 12 } = {}) {
  let saved = 0;
  try {
    if (typeof client.loadEarlierMessages === 'function') {
      for (let p = 0; p < maxPages; p++) {
        const earlier = await client.loadEarlierMessages(chatId).catch(() => null);
        if (!earlier || !earlier.length) break;
      }
    }
    let msgs = [];
    if (typeof client.getAllMessagesInChat === 'function') {
      msgs = await client.getAllMessagesInChat(chatId, true, false).catch(() => []);
    } else if (typeof client.loadAndGetAllMessagesInChat === 'function') {
      msgs = await client.loadAndGetAllMessagesInChat(chatId, true, false).catch(() => []);
    }
    for (const m of msgs) {
      if (await handleMessage(client, m, { skipMedia: true, skipAvatars: true, quiet: true })) saved++;
    }
  } catch (err) {
    logger.warn(`load-history (conversa ${chatId}): ${err.message}`);
  }
  logger.info(`Histórico da conversa ${chatId}: ${saved} novas mensagens.`);
  return { saved };
}

function registerHandlers(client) {
  client.onAnyMessage((message) => handleMessage(client, message));
  logger.info('Handlers de mensagem registrados (onAnyMessage).');
}

module.exports = { registerHandlers, handleMessage, syncAll, loadHistory, loadChatHistory, tasks };

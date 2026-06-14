'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const logger = require('../logger');
const models = require('../db/models');
const auth = require('./auth');
const wa = require('../whatsapp/client');

function formatTimestamp(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function buildTranscript(chat, messages) {
  const lines = [];
  lines.push(`Conversa: ${chat.title}`);
  if (chat.subtitle) lines.push(`Número: ${chat.subtitle}`);
  lines.push(`Tipo: ${chat.type === 'group' ? 'Grupo' : 'Privado'}`);
  lines.push(`Total de mensagens: ${messages.length}`);
  lines.push('='.repeat(50));
  for (const m of messages) {
    const who = m.from_me ? 'Você' : m.sender_name || m.sender_number || 'Desconhecido';
    const text = m.body || m.caption || `[${m.type}]`;
    lines.push(`[${formatTimestamp(m.timestamp)}] ${who}: ${text}`);
  }
  return lines.join('\n');
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '30mb' })); // base64 de mídias enviadas pela dashboard

  // Arquivos estáticos: mídia salva e dashboard.
  app.use('/media', express.static(config.mediaDir));

  const router = express.Router();

  // ---------------- AUTH ----------------
  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const token = auth.login(username, password);
    if (!token) return res.status(401).json({ error: 'credenciais inválidas' });
    logger.info(`Login na dashboard: ${username}`);
    res.json({ token, ttlHours: config.auth.ttlHours });
  });

  router.post('/auth/logout', (req, res) => {
    auth.logout(auth.tokenFromReq(req));
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    const valid = auth.isValidToken(auth.tokenFromReq(req));
    res.json({ authEnabled: config.auth.enabled, authenticated: !config.auth.enabled || valid, user: config.auth.user });
  });

  // ------------- tudo abaixo exige auth -------------
  router.use(auth.requireAuth);

  // ---------------- STATUS / WA ----------------
  router.get('/status', (req, res) => {
    res.json({
      status: wa.state.status,
      qr: wa.state.qr,
      me: wa.state.me,
      startedAt: wa.state.startedAt,
      lastError: wa.state.lastError,
      tasks: wa.tasks,
      stats: models.getStats()
    });
  });

  router.post('/wa/restart', async (req, res) => {
    res.json({ ok: true, message: 'Reiniciando cliente...' });
    wa.restart().catch((e) => logger.error(`Erro no restart: ${e.message}`));
  });

  router.post('/wa/logout', async (req, res) => {
    await wa.logout().catch(() => {});
    res.json({ ok: true });
  });

  router.post('/wa/sync', (req, res) => {
    if (!wa.getClient()) return res.status(400).json({ error: 'WhatsApp não conectado.' });
    if (wa.tasks.sync.running) {
      return res.json({ ok: true, started: false, message: 'Sincronização já em andamento.' });
    }
    wa.triggerSync().catch((e) => logger.error(`Sync falhou: ${e.message}`));
    res.json({ ok: true, started: true });
  });

  router.post('/wa/load-history', (req, res) => {
    if (!wa.getClient()) return res.status(400).json({ error: 'WhatsApp não conectado.' });
    if (wa.tasks.history.running) {
      return res.json({ ok: true, started: false, message: 'Carga já em andamento.' });
    }
    wa.triggerLoadHistory().catch((e) => logger.error(`load-history falhou: ${e.message}`));
    res.json({ ok: true, started: true });
  });

  // ---------------- STATS ----------------
  router.get('/stats', (req, res) => res.json(models.getStats()));

  // ---------------- CHATS ----------------
  router.get('/chats', (req, res) => {
    const { search = '', type = '', archived = 'active' } = req.query;
    res.json(models.listChats({ search, type, archived }));
  });

  router.get('/chats/:id', (req, res) => {
    const chat = models.getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: 'chat não encontrado' });
    if (chat.type === 'group' && chat.group_id) {
      chat.group = models.getGroup(chat.group_id);
      chat.participants = models.getGroupParticipants(chat.group_id);
    } else if (chat.contact_id) {
      chat.contact = models.getContact(chat.contact_id);
    }
    res.json(chat);
  });

  router.get('/chats/:id/messages', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '40', 10), 500);
    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    res.json({
      messages: models.getMessages(req.params.id, { limit, before }),
      total: models.countMessages(req.params.id)
    });
  });

  // Responder/enviar texto (com citação opcional).
  router.post('/chats/:id/send', async (req, res) => {
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    const quotedMsgId = req.body && req.body.quotedMsgId;
    if (!text) return res.status(400).json({ error: 'texto vazio' });
    try {
      const id = await wa.sendText(req.params.id, text, quotedMsgId);
      res.json({ ok: true, id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Enviar mídia (imagem / arquivo / áudio) — dataUrl base64.
  router.post('/chats/:id/send-media', async (req, res) => {
    const { dataUrl, filename, kind, caption, quotedMsgId } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: 'arquivo ausente' });
    try {
      const id = await wa.sendMedia(req.params.id, { dataUrl, filename, kind, caption, quotedMsgId });
      res.json({ ok: true, id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Arquivar / silenciar / limpar conversa.
  router.post('/chats/:id/archive', (req, res) => {
    models.setChatArchived(req.params.id, !!(req.body && req.body.archived));
    res.json({ ok: true });
  });
  router.post('/chats/:id/mute', (req, res) => {
    models.setChatMuted(req.params.id, !!(req.body && req.body.muted));
    res.json({ ok: true });
  });
  router.post('/chats/:id/clear', (req, res) => {
    models.clearChat(req.params.id);
    res.json({ ok: true });
  });

  // Buscar mensagens antigas desta conversa diretamente no WhatsApp.
  router.post('/chats/:id/load-history', async (req, res) => {
    if (!wa.getClient()) return res.status(400).json({ error: 'WhatsApp não conectado.' });
    try {
      const r = await wa.triggerLoadChatHistory(req.params.id);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Ações em lote (múltiplas conversas selecionadas).
  router.post('/chats/bulk', (req, res) => {
    const { ids = [], action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'nenhuma conversa' });
    for (const id of ids) {
      if (action === 'archive') models.setChatArchived(id, true);
      else if (action === 'unarchive') models.setChatArchived(id, false);
      else if (action === 'mute') models.setChatMuted(id, true);
      else if (action === 'unmute') models.setChatMuted(id, false);
      else if (action === 'clear') models.clearChat(id);
    }
    res.json({ ok: true, count: ids.length });
  });

  // Apagar mensagem: scope "me" (local) ou "everyone" (revoga no WhatsApp).
  router.post('/messages/:id/delete', async (req, res) => {
    const { chatId, scope } = req.body || {};
    try {
      if (scope === 'everyone') {
        if (!chatId) return res.status(400).json({ error: 'chatId obrigatório' });
        await wa.deleteMessage(chatId, req.params.id, true);
      }
      models.deleteMessageLocal(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Encaminhar mensagens para outra conversa.
  router.post('/messages/forward', async (req, res) => {
    const { to, ids } = req.body || {};
    if (!to || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'destino e mensagens são obrigatórios' });
    }
    try {
      await wa.forwardMessages(to, ids);
      res.json({ ok: true, count: ids.length });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/chats/:id/export', (req, res) => {
    const chat = models.getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: 'chat não encontrado' });
    const messages = models.getAllMessagesForChat(req.params.id);
    if ((req.query.format || 'txt') === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.json"`);
      return res.json({ chat, messages });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="conversa.txt"`);
    res.send(buildTranscript(chat, messages));
  });

  // ---------------- CONTATOS ----------------
  router.get('/contacts', (req, res) => {
    res.json(models.listContacts({ search: req.query.search || '' }));
  });

  router.get('/contacts/:id', (req, res) => {
    const contact = models.getContact(req.params.id);
    if (!contact) return res.status(404).json({ error: 'contato não encontrado' });
    contact.groups = models.getContactGroups(req.params.id);
    contact.chat = models.getChat(req.params.id) || null;
    res.json(contact);
  });

  // ---------------- GRUPOS ----------------
  router.get('/groups', (req, res) => {
    res.json(models.listGroups({ search: req.query.search || '' }));
  });

  router.get('/groups/:id', (req, res) => {
    const group = models.getGroup(req.params.id);
    if (!group) return res.status(404).json({ error: 'grupo não encontrado' });
    group.participants = models.getGroupParticipants(req.params.id);
    res.json(group);
  });

  // ---------------- CONNECTIONS (grupos com membros em comum) ----------------
  router.get('/connections', (req, res) => {
    const minShared = Math.max(parseInt(req.query.minShared || '1', 10), 1);
    res.json(models.getConnections({ minShared }));
  });

  router.get('/connections/members', (req, res) => {
    const { g1, g2 } = req.query;
    if (!g1 || !g2) return res.status(400).json({ error: 'g1 e g2 são obrigatórios' });
    res.json(models.getSharedMembers(g1, g2));
  });

  // Contatos de um grupo que também estão em outros grupos.
  router.get('/connections/group/:id', (req, res) => {
    res.json(models.getGroupConnections(req.params.id));
  });

  // ---------------- WEBHOOK ----------------
  router.post('/webhook/test', async (req, res) => {
    const url = models.getSetting('webhook_url');
    if (!url) return res.status(400).json({ error: 'Nenhuma URL de webhook configurada.' });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: true,
          message: 'Webhook de teste do whats-middle',
          example: {
            id: 'ABCD1234',
            chat_id: '5511999999999@c.us',
            chat_type: 'private',
            sender: { id: '5511999999999@c.us', name: 'Fulano', number: '5511999999999' },
            type: 'chat',
            body: 'Olá!',
            timestamp: Date.now()
          }
        })
      });
      res.json({ ok: true, status: r.status });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---------------- BUSCA DE MENSAGENS ----------------
  router.get('/messages/search', (req, res) => {
    const q = req.query.q || '';
    if (!q) return res.json([]);
    res.json(models.searchMessages({ q }));
  });

  // ---------------- LOGS ----------------
  router.get('/logs', (req, res) => {
    res.json(models.listLogs({ level: req.query.level || '', limit: parseInt(req.query.limit || '300', 10) }));
  });

  // ---------------- SETTINGS ----------------
  router.get('/settings', (req, res) => {
    res.json({
      app: models.getAllSettings(),
      runtime: {
        sessionId: config.whatsapp.sessionId,
        headless: config.whatsapp.headless,
        captureOutgoing: config.whatsapp.captureOutgoing,
        saveMedia: config.media.save,
        saveMediaTypes: config.media.types,
        saveAvatars: config.media.saveAvatars,
        authEnabled: config.auth.enabled,
        logLevel: config.logLevel
      }
    });
  });

  router.put('/settings', (req, res) => {
    const body = req.body || {};
    for (const [k, v] of Object.entries(body)) {
      models.setSetting(k, v);
    }
    res.json({ ok: true, app: models.getAllSettings() });
  });

  // ---------------- CONEXÕES (chave da API) ----------------
  router.post('/settings/api-key/generate', (req, res) => {
    const key = 'wm_' + crypto.randomBytes(24).toString('hex');
    models.setSetting('api_key', key);
    logger.info('Nova chave de API gerada pela dashboard.');
    res.json({ ok: true, apiKey: key });
  });
  router.post('/settings/api-key/revoke', (req, res) => {
    models.setSetting('api_key', '');
    logger.info('Chave de API revogada pela dashboard.');
    res.json({ ok: true });
  });

  // ---------------- API PÚBLICA /api/v1 (resumos via integração) ----------------
  // Autenticada por API_KEY (header X-API-Key ou ?api_key=). Pensada para você
  // consumir os dados de fora (ex.: pedir resumos ao Claude) sem login de sessão.
  function apiKeyAuth(req, res, next) {
    // Chave vem das Configurações (Conexões); o .env é só um fallback inicial.
    const effective = models.getSetting('api_key') || config.apiKey || '';
    if (!effective) {
      return res.status(503).json({ error: 'API desativada. Gere uma chave em Configurações → Conexões.' });
    }
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== effective) return res.status(401).json({ error: 'API key inválida' });
    next();
  }

  const v1 = express.Router();
  v1.use(apiKeyAuth);
  v1.get('/chats', (req, res) =>
    res.json(models.listChats({ search: req.query.search || '', type: req.query.type || '' }))
  );
  v1.get('/chats/:id/messages', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 5000);
    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    res.json(models.getMessages(req.params.id, { limit, before }));
  });
  v1.get('/chats/:id/transcript', (req, res) => {
    const chat = models.getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: 'chat não encontrado' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildTranscript(chat, models.getAllMessagesForChat(req.params.id)));
  });
  v1.get('/groups', (req, res) => res.json(models.listGroups({ search: req.query.search || '' })));
  v1.get('/contacts', (req, res) =>
    res.json(models.listContacts({ search: req.query.search || '' }))
  );
  v1.get('/search', (req, res) => res.json(models.searchMessages({ q: req.query.q || '' })));
  v1.get('/connections', (req, res) => res.json(models.getConnections({})));

  // v1 ANTES do router de sessão para não cair na exigência de login.
  app.use('/api/v1', v1);
  app.use('/api', router);

  // Dashboard (SPA) — tudo o que não for /api/* cai aqui.
  const publicDir = path.join(config.root, 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  return app;
}

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `🌐 Dashboard disponível em http://localhost:${config.server.port}`
      );
      resolve(server);
    });
  });
}

module.exports = { createApp, startServer };

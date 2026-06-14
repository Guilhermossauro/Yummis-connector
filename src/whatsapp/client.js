'use strict';

const { create, ev } = require('@open-wa/wa-automate');
const config = require('../config');
const logger = require('../logger');
const { registerHandlers, syncAll, loadHistory, loadChatHistory, tasks } = require('./handlers');

// Estado compartilhado, lido pela dashboard (/api/status).
const state = {
  status: 'starting', // starting | qr | authenticated | connected | disconnected | conflict
  qr: null, // data:image/png;base64,...
  me: null, // { number, pushname, ... }
  startedAt: Date.now(),
  lastError: null
};

let client = null;

// QR code emitido pelo open-wa (PNG em base64).
ev.on('qr.**', (qrcode) => {
  state.qr = qrcode;
  state.status = 'qr';
  logger.info('QR Code gerado — escaneie pela dashboard ou pelo terminal.');
});

ev.on('STARTUP.**', (data) => {
  logger.debug(`open-wa startup: ${JSON.stringify(data)}`);
});

async function refreshMe() {
  try {
    const me = await client.getMe();
    const hostNumber = await client.getHostNumber().catch(() => null);
    state.me = {
      number: hostNumber || (me && me.id && me.id.user) || null,
      pushname: (me && (me.pushname || me.formattedName)) || null
    };
  } catch (_) {
    /* ignore */
  }
}

async function start() {
  logger.info('Iniciando cliente WhatsApp (open-wa)...');
  try {
    const launchOptions = {
      sessionId: config.whatsapp.sessionId,
      multiDevice: true,
      authTimeout: 0,
      qrTimeout: 0,
      headless: config.whatsapp.headless,
      blockCrashLogs: true,
      disableSpins: true,
      logConsole: false,
      popup: false,
      cacheEnabled: false,
      sessionDataPath: config.dataDir,
      useChrome: config.whatsapp.useChrome,
      customUserAgent: config.whatsapp.userAgent,
      // IMPORTANTE: na v4.76 do open-wa o `customUserAgent` só é aplicado quando
      // `inDocker` é true (ver initializer.js). Sem isso, ele usa um user-agent
      // antigo (Chrome 104) e o WhatsApp Web devolve a página "atualize o Chrome",
      // travando a geração do QR. Como definimos `sessionDataPath`, ativar
      // `inDocker` não muda o diretório de sessão nem outros comportamentos.
      inDocker: true,
      killProcessOnBrowserClose: false
    };
    if (config.whatsapp.executablePath) {
      launchOptions.executablePath = config.whatsapp.executablePath;
    }
    client = await create(launchOptions);

    state.status = 'connected';
    state.qr = null;
    logger.info('✅ WhatsApp conectado.');

    await refreshMe();

    client.onStateChanged((s) => {
      logger.info(`Estado do WhatsApp: ${s}`);
      if (s === 'CONFLICT' || s === 'UNLAUNCHED') {
        state.status = 'conflict';
        client.forceRefocus().catch(() => {});
      } else if (s === 'CONNECTED') {
        state.status = 'connected';
      }
    });

    if (typeof client.onLogout === 'function') {
      client.onLogout(() => {
        logger.warn('WhatsApp deslogado.');
        state.status = 'disconnected';
      });
    }

    registerHandlers(client);

    // Sincroniza grupos/contatos em segundo plano (não bloqueia o boot).
    syncAll(client).catch((e) => logger.warn(`Sync inicial falhou: ${e.message}`));

    return client;
  } catch (err) {
    state.status = 'disconnected';
    state.lastError = err.message;
    logger.error(`Falha ao iniciar o WhatsApp: ${err.message}`);
    throw err;
  }
}

async function restart() {
  if (client) {
    try {
      await client.kill();
    } catch (_) {
      /* ignore */
    }
    client = null;
  }
  state.status = 'starting';
  state.qr = null;
  return start();
}

async function logout() {
  if (!client) return;
  try {
    await client.logout();
  } catch (_) {
    /* ignore */
  }
  state.status = 'disconnected';
}

async function triggerSync() {
  if (!client) throw new Error('Cliente não conectado.');
  return syncAll(client);
}

async function triggerLoadHistory() {
  if (!client) throw new Error('Cliente não conectado.');
  return loadHistory(client);
}

async function triggerLoadChatHistory(chatId) {
  if (!client) throw new Error('WhatsApp não conectado.');
  return loadChatHistory(client, chatId);
}

// Envia texto (com resposta/citação opcional).
async function sendText(chatId, text, quotedMsgId) {
  if (!client) throw new Error('WhatsApp não conectado.');
  if (!chatId || !text) throw new Error('Destino e texto são obrigatórios.');
  if (quotedMsgId && typeof client.reply === 'function') {
    return client.reply(chatId, text, quotedMsgId);
  }
  return client.sendText(chatId, text);
}

// Envia mídia (imagem / arquivo / áudio ptt) a partir de um data URL base64.
async function sendMedia(chatId, { dataUrl, filename, kind, caption, quotedMsgId } = {}) {
  if (!client) throw new Error('WhatsApp não conectado.');
  if (!chatId || !dataUrl) throw new Error('Destino e arquivo são obrigatórios.');
  if (kind === 'image') {
    return client.sendImage(chatId, dataUrl, filename || 'image.jpg', caption || '', quotedMsgId);
  }
  if (kind === 'ptt') {
    // Converte o áudio do navegador (webm/opus) para OGG/Opus (nota de voz).
    const { toOggOpus } = require('./audio');
    const oggUrl = await toOggOpus(dataUrl);
    return client.sendPtt(chatId, oggUrl, quotedMsgId);
  }
  return client.sendFile(chatId, dataUrl, filename || 'arquivo', caption || '', quotedMsgId);
}

// Apaga mensagem: everyone=false -> só para mim; true -> revoga para todos.
async function deleteMessage(chatId, msgId, everyone) {
  if (!client) throw new Error('WhatsApp não conectado.');
  return client.deleteMessage(chatId, msgId, !everyone, true);
}

async function forwardMessages(toChatId, msgIds) {
  if (!client) throw new Error('WhatsApp não conectado.');
  return client.forwardMessages(toChatId, msgIds, false);
}

function getClient() {
  return client;
}

module.exports = {
  start,
  restart,
  logout,
  triggerSync,
  triggerLoadHistory,
  triggerLoadChatHistory,
  sendText,
  sendMedia,
  deleteMessage,
  forwardMessages,
  getClient,
  state,
  tasks
};

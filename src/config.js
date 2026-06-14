'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true' || v === '1';
}

function list(v, def = []) {
  if (!v) return def;
  return String(v)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ROOT = path.join(__dirname, '..');
// Diretório de dados (banco + mídias). Pode ser sobrescrito por DATA_DIR.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

const config = {
  root: ROOT,
  dataDir: DATA_DIR,
  mediaDir: path.join(DATA_DIR, 'media'),
  avatarDir: path.join(DATA_DIR, 'media', 'avatars'),
  dbPath: path.join(DATA_DIR, 'whatsmiddle.db'),
  logsDir: path.join(ROOT, 'logs'),

  // Modo somente-dashboard (não inicia o WhatsApp). Útil para testes.
  disableWa: bool(process.env.DISABLE_WA, false),

  server: {
    port: parseInt(process.env.PORT || '3333', 10),
    host: process.env.HOST || '0.0.0.0'
  },

  auth: {
    enabled: bool(process.env.AUTH_ENABLED, true),
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin',
    secret: process.env.SESSION_SECRET || 'whats-middle-secret',
    ttlHours: parseInt(process.env.SESSION_TTL_HOURS || '72', 10)
  },

  // Chave para a API pública /api/v1 (resumos via integração externa / Claude).
  // Se vazia, a API pública fica desativada.
  apiKey: process.env.API_KEY || '',

  whatsapp: {
    sessionId: process.env.SESSION_ID || 'whats-middle',
    headless: bool(process.env.HEADLESS, true),
    captureOutgoing: bool(process.env.CAPTURE_OUTGOING, true),
    // open-wa recomenda fortemente usar o Chrome instalado (em vez do Chromium
    // empacotado) para o WhatsApp multi-dispositivo gerar o QR de forma confiável.
    useChrome: bool(process.env.USE_CHROME, true),
    executablePath: process.env.CHROME_PATH || undefined,
    // O open-wa usa por padrão um user-agent antigo (Chrome 104), que faz o
    // WhatsApp Web servir uma página sem o objeto interno que o QR depende.
    // Usamos um user-agent moderno para o QR ser gerado corretamente.
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
  },

  media: {
    save: bool(process.env.SAVE_MEDIA, true),
    types: list(process.env.SAVE_MEDIA_TYPES, [
      'image',
      'sticker',
      'ptt',
      'audio',
      'video',
      'document'
    ]),
    saveAvatars: bool(process.env.SAVE_AVATARS, true)
  },

  logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;

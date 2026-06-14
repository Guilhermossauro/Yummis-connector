'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');

function safeName(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/**
 * Garante que a foto de perfil (de contato ou grupo) esteja em disco.
 * Retorna o caminho público (/media/avatars/...) ou null.
 *
 * Só busca de novo se ainda não houver avatar salvo (currentPath vazio),
 * evitando refetch a cada mensagem.
 */
async function ensureAvatar(client, id, currentPath) {
  if (!config.media.saveAvatars) return currentPath || null;

  const file = path.join(config.avatarDir, `${safeName(id)}.jpg`);
  if (currentPath && fs.existsSync(file)) return currentPath;

  try {
    const pic = await client.getProfilePicFromServer(id);
    // Para grupos o open-wa às vezes devolve um objeto em vez de string —
    // extraímos a URL real. (Era a causa de grupos ficarem sem foto.)
    const url = typeof pic === 'string'
      ? pic
      : pic && (pic.eurl || pic.imgFull || pic.img || pic.url) || null;
    if (!url) return currentPath || null;
    const buf = await downloadBuffer(url);
    fs.writeFileSync(file, buf);
    const publicPath = `/media/avatars/${path.basename(file)}`;
    return publicPath;
  } catch (err) {
    logger.debug(`Não foi possível baixar avatar de ${id}: ${err.message}`);
    return currentPath || null;
  }
}

module.exports = { ensureAvatar };

'use strict';

// Extrai o wid serializado de objetos do open-wa que variam de formato.
function serializeId(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (id._serialized) return id._serialized;
  if (id.user && id.server) return `${id.user}@${id.server}`;
  return null;
}

// Pega só os dígitos do número a partir do wid.
function numberFromId(id) {
  const s = serializeId(id);
  if (!s) return null;
  const user = s.split('@')[0];
  return user.replace(/[^0-9]/g, '') || null;
}

// Formata um número brasileiro/internacional de forma legível.
function formatNumber(number) {
  if (!number) return null;
  const n = String(number);
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    if (rest.length === 9) return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${n}`;
}

const isGroupId = (id) => {
  const s = serializeId(id);
  return !!s && s.endsWith('@g.us');
};

// Resumo curto de uma mensagem para a lista de conversas.
function previewForMessage(m) {
  const icons = {
    image: '📷 Foto',
    video: '🎥 Vídeo',
    ptt: '🎤 Áudio',
    audio: '🎵 Áudio',
    document: '📄 Documento',
    sticker: '🌟 Figurinha',
    location: '📍 Localização',
    vcard: '👤 Contato'
  };
  if (m.body && m.type === 'chat') return m.body;
  if (m.caption) return `${icons[m.type] || ''} ${m.caption}`.trim();
  return icons[m.type] || m.body || '[mensagem]';
}

module.exports = { serializeId, numberFromId, formatNumber, isGroupId, previewForMessage };

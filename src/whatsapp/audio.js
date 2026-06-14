'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('../logger');

// Converte um áudio (ex.: webm/opus do navegador) para OGG/Opus, que é o
// formato das mensagens de voz do WhatsApp. Usa o binário do ffmpeg-static.
// Se o ffmpeg não estiver disponível, devolve o áudio original (best-effort).
function run(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

async function toOggOpus(dataUrl) {
  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch (_) {
    logger.warn('ffmpeg-static não instalado — enviando áudio sem conversão.');
    return dataUrl;
  }
  if (!ffmpegPath) return dataUrl;

  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buf = Buffer.from(b64, 'base64');
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inFile = path.join(os.tmpdir(), `wm_${stamp}.in`);
  const outFile = path.join(os.tmpdir(), `wm_${stamp}.ogg`);
  fs.writeFileSync(inFile, buf);
  try {
    // mono, 48kHz, opus — compatível com nota de voz (ptt) do WhatsApp.
    await run(ffmpegPath, [
      '-y', '-i', inFile,
      '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
      outFile
    ]);
    const out = fs.readFileSync(outFile);
    return 'data:audio/ogg;base64,' + out.toString('base64');
  } catch (err) {
    logger.warn(`Falha ao converter áudio: ${err.message} — enviando original.`);
    return dataUrl;
  } finally {
    fs.unlink(inFile, () => {});
    fs.unlink(outFile, () => {});
  }
}

module.exports = { toOggOpus };

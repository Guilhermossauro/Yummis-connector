'use strict';

const config = require('./config');
const logger = require('./logger');
const models = require('./db/models');
const { startServer } = require('./server/server');
const wa = require('./whatsapp/client');

async function main() {
  logger.info('==============================================');
  logger.info('  whats-middle — iniciando');
  logger.info('==============================================');

  models.purgeExpiredSessions();
  // Limpa sessões expiradas a cada hora.
  setInterval(() => models.purgeExpiredSessions(), 60 * 60 * 1000).unref();

  // 1) Sobe o dashboard primeiro (funciona mesmo sem WhatsApp conectado,
  //    permitindo exibir o QR Code para parear).
  await startServer();

  // 2) Conecta ao WhatsApp. Não derruba a aplicação se falhar — o usuário
  //    pode reiniciar pela dashboard.
  if (config.disableWa) {
    logger.warn('WhatsApp desativado (DISABLE_WA=true) — modo somente dashboard.');
  } else {
    wa.start().catch((err) => {
      logger.error(`WhatsApp não iniciou: ${err.message}. Use a dashboard para reiniciar.`);
    });
  }
}

main().catch((err) => {
  logger.error(`Falha fatal: ${err.stack || err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`unhandledRejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException: ${err.stack || err.message}`);
});

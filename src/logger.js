'use strict';

const path = require('path');
const winston = require('winston');
const Transport = require('winston-transport');
const config = require('./config');
const models = require('./db/models');

// Transport customizado: grava cada log também na tabela `logs`,
// para que o dashboard consiga exibir o histórico de logs.
class SqliteTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    const { level, message, ...meta } = info;
    delete meta[Symbol.for('level')];
    delete meta[Symbol.for('message')];
    delete meta[Symbol.for('splat')];
    const hasMeta = Object.keys(meta).length > 0;
    models.insertLog(level, String(message), hasMeta ? meta : null);
    callback();
  }
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.logLevel,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(config.logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(config.logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    }),
    new SqliteTransport({ level: 'info' })
  ]
});

module.exports = logger;

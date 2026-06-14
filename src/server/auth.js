'use strict';

const crypto = require('crypto');
const config = require('../config');
const models = require('../db/models');

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Compara senha em tempo constante.
function passwordMatches(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(String(config.auth.password));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function login(username, password) {
  if (username !== config.auth.user || !passwordMatches(password)) {
    return null;
  }
  const token = newToken();
  models.createSession(token, username, config.auth.ttlHours);
  return token;
}

function logout(token) {
  if (token) models.deleteSession(token);
}

function tokenFromReq(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function isValidToken(token) {
  if (!token) return false;
  const session = models.getSession(token);
  if (!session) return false;
  if (session.expires_at < Date.now()) {
    models.deleteSession(token);
    return false;
  }
  return true;
}

// Middleware Express.
function requireAuth(req, res, next) {
  if (!config.auth.enabled) return next();
  const token = tokenFromReq(req);
  if (isValidToken(token)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

module.exports = { login, logout, requireAuth, isValidToken, tokenFromReq };

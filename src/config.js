'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');

function resolveDirRelative(p, fallback) {
  const raw = p || fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // Ignora: meglio fallire visibilmente più avanti
  }
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  dbPath: path.isAbsolute(process.env.DB_PATH || '')
    ? process.env.DB_PATH
    : path.resolve(process.cwd(), process.env.DB_PATH || './data/gestionale.sqlite'),

  backupDir: resolveDirRelative(process.env.BACKUP_DIR, './backups'),
  exportDir: resolveDirRelative(process.env.EXPORT_DIR, './exports'),

  projectRoot: path.resolve(__dirname, '..'),
};

ensureDir(path.dirname(config.dbPath));
ensureDir(config.backupDir);
ensureDir(config.exportDir);

module.exports = config;

'use strict';

/**
 * Seed iniziale.
 * Legge INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD da .env.
 * - Idempotente: se lo username esiste già, non fa nulla.
 * - Esce con errore se le variabili obbligatorie mancano.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { getDb, closeDb } = require('./connection');

function seedAdmin() {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!username) throw new Error('INITIAL_ADMIN_USERNAME non impostata in .env');
  if (!password) throw new Error('INITIAL_ADMIN_PASSWORD non impostata in .env');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM admin WHERE username = ?').get(username);
  if (existing) {
    console.log(`Admin "${username}" già presente (id=${existing.id}). Nessuna azione.`);
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Admin "${username}" creato.`);
}

function main() {
  try {
    seedAdmin();
  } finally {
    closeDb();
  }
}

if (require.main === module) main();

module.exports = { seedAdmin };

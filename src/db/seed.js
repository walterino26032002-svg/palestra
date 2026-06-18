'use strict';

/**
 * Seed iniziale.
 * - Crea utente admin (admin / admin123) se non esiste.
 * - Idempotente: richiamabile più volte senza duplicati.
 */

const bcrypt = require('bcrypt');
const { getDb, closeDb } = require('./connection');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

function seedAdmin() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM admin WHERE username = ?').get(ADMIN_USERNAME);

  if (existing) {
    console.log(`Admin "${ADMIN_USERNAME}" già presente (id=${existing.id}). Nessuna azione.`);
    return;
  }

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, hash);
  console.log(`Admin "${ADMIN_USERNAME}" creato. Password iniziale: ${ADMIN_PASSWORD}`);
  console.log('!! Cambiala al primo login !!');
}

function main() {
  try {
    seedAdmin();
  } finally {
    closeDb();
  }
}

if (require.main === module) {
  main();
}

module.exports = { seedAdmin };

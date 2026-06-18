'use strict';

/**
 * Servizio di autenticazione.
 * - loginAdmin: cerca per username, verifica bcrypt.
 * - loginCliente: cerca per id + verifica password (bcrypt).
 * - Trova cliente per credenziali (id/cliente_id + password): per la V1
 *   la login cliente usa ID numerico + password personale.
 *
 * Convenzione STEP 2:
 *   - Le password dei clienti sono hash bcrypt salvate nella colonna
 *     `password_hash` della tabella `clienti` (campo aggiunto ora).
 *   - Il seed del cliente avverrà negli step successivi; per STEP 2 non
 *     ci sono clienti seedati. Login cliente semplicemente non troverà
 *     match fino a quando non verranno creati.
 */

const bcrypt = require('bcrypt');
const { getDb } = require('../db/connection');

class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function loginAdmin(username, password) {
  if (!username || !password) throw new AuthError('missing_credentials', 'Username o password mancanti.');
  const db = getDb();
  const row = db.prepare('SELECT id, username, password_hash FROM admin WHERE username = ?').get(username);
  if (!row) throw new AuthError('invalid_credentials', 'Credenziali non valide.');
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) throw new AuthError('invalid_credentials', 'Credenziali non valide.');
  return { id: row.id, username: row.username };
}

/**
 * Login cliente con identificatore flessibile.
 * Accetta, in ordine: username, email, telefono, ID numerico (fallback tecnico).
 * @param {string} identifier - valore inserito nel campo libero.
 * @param {string} password
 */
function loginCliente(identifier, password) {
  if (identifier == null || identifier === '' || !password) {
    throw new AuthError('missing_credentials', 'Credenziali mancanti.');
  }
  const db = getDb();
  const ident = String(identifier).trim();

  // Risolve il cliente provando username/email/telefono; fallback ID numerico.
  // username/email case-insensitive; telefono confronto esatto sul valore inserito.
  let row = db.prepare(`
    SELECT id, nome, cognome, email, attivo, password_hash
    FROM clienti
    WHERE username = ? COLLATE NOCASE
       OR email    = ? COLLATE NOCASE
       OR telefono = ?
    LIMIT 1
  `).get(ident, ident, ident);

  // Fallback tecnico: ID numerico puro.
  if (!row && /^\d+$/.test(ident)) {
    row = db.prepare(
      'SELECT id, nome, cognome, email, attivo, password_hash FROM clienti WHERE id = ?'
    ).get(parseInt(ident, 10));
  }

  if (!row) throw new AuthError('invalid_credentials', 'Credenziali non valide.');
  if (!row.password_hash) throw new AuthError('no_password_set', 'Password non impostata per questo cliente.');
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) throw new AuthError('invalid_credentials', 'Credenziali non valide.');

  return {
    id: row.id,
    nome: row.nome,
    cognome: row.cognome,
    email: row.email,
    attivo: !!row.attivo,
  };
}

/** STEP 2 non altera lo schema: le colonne password_hash / password_must_change
 *  sono aggiunte dalla migration 002_cliente_password.sql. */

module.exports = {
  AuthError,
  loginAdmin,
  loginCliente,
};

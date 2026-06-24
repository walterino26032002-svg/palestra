'use strict';

/**
 * Servizio clienti.
 * - Gestione anagrafica (no business logic del saldo: vedi movimenti.service).
 * - Il saldo e il badge vengono letti DAL servizio movimenti.
 */

const bcrypt = require('bcrypt');
const { getDb } = require('../db/connection');
const movimenti = require('./movimenti.service');

function listClienti({ soloAttivi = false, q = '' } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (soloAttivi) where.push('attivo = 1');
  if (q && q.trim()) {
    where.push('(nome LIKE ? OR cognome LIKE ? OR email LIKE ? OR telefono LIKE ?)');
    const like = '%' + q.trim() + '%';
    params.push(like, like, like, like);
  }
  const sql = `
    SELECT id, nome, cognome, email, telefono, attivo, creato_il, aggiornato_il
    FROM clienti
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY cognome ASC, nome ASC
  `;
  const rows = db.prepare(sql).all(...params);
  const today = new Date().toISOString().slice(0, 10);
  const stmtMensile = db.prepare(
    "SELECT 1 FROM abbonamenti_mensili_cliente WHERE cliente_id=? AND data_inizio<=? AND data_fine>=? LIMIT 1"
  );
  // Allega saldo + badge per ogni riga (semplice, N piccolo in V1).
  return rows.map((r) => {
    const saldo = movimenti.getSaldo(r.id);
    const hasActiveMensile = !!stmtMensile.get(r.id, today, today);
    const badge = movimenti.getBadge({ cliente: r, saldo, hasActiveMensile });
    return { ...r, saldo_ingressi: saldo, badge_label: badge.label, badge_tone: badge.tone };
  });
}

function getCliente(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, nome, cognome, email, telefono, note, attivo,
           password_must_change, creato_il, aggiornato_il
    FROM clienti WHERE id = ?
  `).get(id);
  if (!row) return null;
  const saldo = movimenti.getSaldo(row.id);
  const today = new Date().toISOString().slice(0, 10);
  const hasActiveMensile = !!db.prepare(
    "SELECT 1 FROM abbonamenti_mensili_cliente WHERE cliente_id=? AND data_inizio<=? AND data_fine>=? LIMIT 1"
  ).get(row.id, today, today);
  const badge = movimenti.getBadge({ cliente: row, saldo, hasActiveMensile });
  return {
    ...row,
    has_password: !!row.password_must_change !== undefined, // placeholder
    saldo_ingressi: saldo,
    badge_label: badge.label,
    badge_tone: badge.tone,
  };
}

function createCliente({ nome, cognome, email, telefono, note, attivo = 1, password = null }) {
  if (!nome || !String(nome).trim()) {
    const e = new Error('Nome obbligatorio'); e.code = 'validation'; throw e;
  }
  if (!cognome || !String(cognome).trim()) {
    const e = new Error('Cognome obbligatorio'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const mustChange = password ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO clienti (nome, cognome, email, telefono, note, attivo,
                         password_hash, password_must_change)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(nome).trim(),
    String(cognome).trim(),
    email ? String(email).trim() : null,
    telefono ? String(telefono).trim() : null,
    note ? String(note).trim() : null,
    attivo ? 1 : 0,
    passwordHash,
    mustChange
  );
  return info.lastInsertRowid;
}

function updateCliente(id, { nome, cognome, email, telefono, note, attivo }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM clienti WHERE id = ?').get(id);
  if (!existing) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`
    UPDATE clienti
       SET nome = COALESCE(?, nome),
           cognome = COALESCE(?, cognome),
           email = ?,
           telefono = ?,
           note = ?,
           attivo = COALESCE(?, attivo),
           aggiornato_il = datetime('now')
     WHERE id = ?
  `).run(
    nome ?? null,
    cognome ?? null,
    email ?? null,
    telefono ?? null,
    note ?? null,
    attivo === undefined ? null : (attivo ? 1 : 0),
    id
  );
  return true;
}

function toggleAttivo(id) {
  const db = getDb();
  const row = db.prepare('SELECT attivo FROM clienti WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }
  const nuovo = row.attivo ? 0 : 1;
  db.prepare('UPDATE clienti SET attivo = ?, aggiornato_il = datetime(\'now\') WHERE id = ?')
    .run(nuovo, id);
  return !!nuovo;
}

function setPassword(id, password) {
  if (!password || password.length < 4) {
    const e = new Error('Password troppo corta (min 4 caratteri)'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    UPDATE clienti
       SET password_hash = ?, password_must_change = 0, aggiornato_il = datetime('now')
     WHERE id = ?
  `).run(hash, id);
  if (!info.changes) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }
  return true;
}

module.exports = {
  listClienti,
  getCliente,
  createCliente,
  updateCliente,
  toggleAttivo,
  setPassword,
};

'use strict';

/**
 * NFC tessere + log eventi.
 * Stato live = `nfc_tessere` (lookup per uid).
 * Lo storico delle assegnazioni = `storico_nfc`.
 * Log grezzo di ogni lettura = `nfc_eventi`.
 */

const { getDb } = require('../db/connection');

function listTessere({ soloAttive = false, q = '' } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (soloAttive) where.push('t.attiva = 1');
  if (q && q.trim()) {
    where.push('(t.tessera_uid LIKE ? OR c.nome LIKE ? OR c.cognome LIKE ?)');
    const like = '%' + q.trim() + '%';
    params.push(like, like, like);
  }
  return db.prepare(`
    SELECT t.id, t.tessera_uid, t.cliente_id, t.attiva, t.creata_il, t.assegnata_il,
           c.nome AS cliente_nome, c.cognome AS cliente_cognome, c.attivo AS cliente_attivo
    FROM nfc_tessere t
    LEFT JOIN clienti c ON c.id = t.cliente_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.id DESC
  `).all(...params);
}

function getTessera(id) {
  const db = getDb();
  return db.prepare(`
    SELECT t.id, t.tessera_uid, t.cliente_id, t.attiva, t.creata_il, t.assegnata_il,
           c.nome AS cliente_nome, c.cognome AS cliente_cognome, c.attivo AS cliente_attivo
    FROM nfc_tessere t
    LEFT JOIN clienti c ON c.id = t.cliente_id
    WHERE t.id = ?
  `).get(id);
}

/** Lookup tessera per uid (live). Include il cliente (se assegnata). */
function findByUid(uid) {
  if (!uid) return null;
  const db = getDb();
  return db.prepare(`
    SELECT t.id, t.tessera_uid, t.cliente_id, t.attiva, t.creata_il, t.assegnata_il,
           c.id AS cli_id, c.nome AS cli_nome, c.cognome AS cli_cognome,
           c.attivo AS cli_attivo
    FROM nfc_tessere t
    LEFT JOIN clienti c ON c.id = t.cliente_id
    WHERE t.tessera_uid = ?
  `).get(uid);
}

function tesseraAssegnata(uid) {
  return !!findByUid(uid);
}

/**
 * Crea o riassegna una tessera.
 * - Se uid esiste già e ha un cliente diverso: chiudi la riga in storico_nfc,
 *   aggiorna il cliente_id e assegnata_il.
 * - Se uid esiste già con lo stesso cliente: noop (idempotente).
 * - Se uid nuovo: insert + eventuale storico.
 */
function creaOAssegna({ tesseraUid, clienteId }) {
  if (!tesseraUid || !String(tesseraUid).trim()) {
    const e = new Error('UID tessera obbligatorio'); e.code = 'validation'; throw e;
  }
  if (!clienteId) {
    const e = new Error('Cliente obbligatorio'); e.code = 'validation'; throw e;
  }
  const uid = String(tesseraUid).trim();
  const db = getDb();

  const cliente = db.prepare('SELECT id FROM clienti WHERE id = ?').get(clienteId);
  if (!cliente) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }

  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, cliente_id FROM nfc_tessere WHERE tessera_uid = ?').get(uid);
    if (existing) {
      if (existing.cliente_id === clienteId) {
        // idempotente
        return existing.id;
      }
      // chiudi storico precedente
      if (existing.cliente_id) {
        db.prepare(`
          UPDATE storico_nfc SET rimossa_il = datetime('now')
          WHERE tessera_uid = ? AND cliente_id = ? AND rimossa_il IS NULL
        `).run(uid, existing.cliente_id);
      }
      db.prepare(`
        UPDATE nfc_tessere
           SET cliente_id = ?, attiva = 1, assegnata_il = datetime('now')
         WHERE id = ?
      `).run(clienteId, existing.id);
      db.prepare(`
        INSERT INTO storico_nfc (tessera_uid, cliente_id) VALUES (?, ?)
      `).run(uid, clienteId);
      return existing.id;
    }
    // nuova tessera
    const info = db.prepare(`
      INSERT INTO nfc_tessere (tessera_uid, cliente_id, attiva, assegnata_il)
      VALUES (?, ?, 1, datetime('now'))
    `).run(uid, clienteId);
    db.prepare(`
      INSERT INTO storico_nfc (tessera_uid, cliente_id) VALUES (?, ?)
    `).run(uid, clienteId);
    return info.lastInsertRowid;
  });

  return tx();
}

function disassocia(id) {
  const db = getDb();
  const row = db.prepare('SELECT id, tessera_uid, cliente_id FROM nfc_tessere WHERE id = ?').get(id);
  if (!row) { const e = new Error('Tessera non trovata'); e.code = 'not_found'; throw e; }
  if (!row.cliente_id) { const e = new Error('Tessera non assegnata'); e.code = 'validation'; throw e; }
  db.transaction(() => {
    db.prepare(`UPDATE storico_nfc SET rimossa_il = datetime('now') WHERE tessera_uid = ? AND cliente_id = ? AND rimossa_il IS NULL`).run(row.tessera_uid, row.cliente_id);
    db.prepare(`UPDATE nfc_tessere SET cliente_id = NULL, assegnata_il = NULL WHERE id = ?`).run(id);
  })();
}

function toggleAttiva(id) {
  const db = getDb();
  const row = db.prepare('SELECT attiva FROM nfc_tessere WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Tessera non trovata'); e.code = 'not_found'; throw e;
  }
  const nuovo = row.attiva ? 0 : 1;
  db.prepare('UPDATE nfc_tessere SET attiva = ? WHERE id = ?').run(nuovo, id);
  return !!nuovo;
}

function listEventi({ limit = 100, tesseraUid = null, clienteId = null } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (tesseraUid) { where.push('e.tessera_uid = ?'); params.push(tesseraUid); }
  if (clienteId)  { where.push('e.cliente_id = ?');  params.push(clienteId); }
  return db.prepare(`
    SELECT e.id, e.tessera_uid, e.cliente_id, e.letto_il, e.sorgente, e.esito,
           c.nome AS cliente_nome, c.cognome AS cliente_cognome
    FROM nfc_eventi e
    LEFT JOIN clienti c ON c.id = e.cliente_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.id DESC
    LIMIT ?
  `).all(...params, limit);
}

/** Inserisce un evento grezzo. */
function insertEvento({ tesseraUid, clienteId = null, sorgente = null, esito = null }) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO nfc_eventi (tessera_uid, cliente_id, sorgente, esito)
    VALUES (?, ?, ?, ?)
  `).run(String(tesseraUid), clienteId, sorgente, esito);
  return info.lastInsertRowid;
}

module.exports = {
  listTessere,
  getTessera,
  findByUid,
  tesseraAssegnata,
  creaOAssegna,
  disassocia,
  toggleAttiva,
  listEventi,
  insertEvento,
};

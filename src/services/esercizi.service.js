'use strict';

/**
 * Servizio esercizi (di una seduta).
 */

const { getDb } = require('../db/connection');

function listEserciziSeduta(sedutaId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, seduta_id, ordine, nome, serie, ripetizioni, carico, recupero, rpe, note
    FROM esercizi
    WHERE seduta_id = ?
    ORDER BY ordine ASC, id ASC
  `).all(sedutaId);
}

function getEsercizio(id) {
  const db = getDb();
  return db.prepare(`
    SELECT id, seduta_id, ordine, nome, serie, ripetizioni, carico, recupero, rpe, note
    FROM esercizi WHERE id = ?
  `).get(id) || null;
}

function nextOrdine(sedutaId) {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM esercizi WHERE seduta_id = ?').get(sedutaId);
  return (row ? row.m : 0) + 10;
}

function addEsercizio({ sedutaId, nome, serie, ripetizioni, carico, recupero, rpe, note, ordine }) {
  if (!sedutaId) {
    const e = new Error('Seduta obbligatoria'); e.code = 'validation'; throw e;
  }
  if (!nome || !String(nome).trim()) {
    const e = new Error('Nome esercizio obbligatorio'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const sed = db.prepare('SELECT id FROM sedute WHERE id = ?').get(sedutaId);
  if (!sed) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }

  const ord = Number.isFinite(+ordine) ? parseInt(ordine, 10) : nextOrdine(sedutaId);
  const serieNum = (serie === undefined || serie === null || serie === '') ? null
    : Math.max(0, parseInt(serie, 10));

  const info = db.prepare(`
    INSERT INTO esercizi (seduta_id, ordine, nome, serie, ripetizioni, carico, recupero, rpe, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sedutaId,
    ord,
    String(nome).trim(),
    serieNum,
    ripetizioni ? String(ripetizioni).trim() : null,
    carico ? String(carico).trim() : null,
    recupero ? String(recupero).trim() : null,
    rpe ? String(rpe).trim() : null,
    note ? String(note).trim() : null
  );
  return info.lastInsertRowid;
}

function updateEsercizio(id, { nome, serie, ripetizioni, carico, recupero, rpe, note, ordine }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM esercizi WHERE id = ?').get(id);
  if (!existing) {
    const e = new Error('Esercizio non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`
    UPDATE esercizi
       SET nome        = COALESCE(?, nome),
           serie       = ?,
           ripetizioni = ?,
           carico      = ?,
           recupero    = ?,
           rpe         = ?,
           note        = ?,
           ordine      = COALESCE(?, ordine)
     WHERE id = ?
  `).run(
    nome ?? null,
    serie === undefined ? null : (serie === null || serie === '' ? null : Math.max(0, parseInt(serie, 10))),
    ripetizioni ?? null,
    carico ?? null,
    recupero ?? null,
    rpe === undefined ? null : (rpe === '' ? null : String(rpe).trim()),
    note ?? null,
    ordine === undefined ? null : parseInt(ordine, 10),
    id
  );
  return true;
}

function deleteEsercizio(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM esercizi WHERE id = ?').run(id);
  return info.changes > 0;
}

/**
 * Riordina gli esercizi di una seduta.
 * Input: array di id nell'ordine desiderato.
 */
function reorderEsercizi({ sedutaId, ordineIds }) {
  if (!sedutaId || !Array.isArray(ordineIds)) {
    const e = new Error('Parametri non validi'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const tx = db.transaction(() => {
    let ord = 10;
    const stmt = db.prepare('UPDATE esercizi SET ordine = ? WHERE id = ? AND seduta_id = ?');
    for (const id of ordineIds) {
      stmt.run(ord, parseInt(id, 10), sedutaId);
      ord += 10;
    }
  });
  tx();
  return true;
}

module.exports = {
  listEserciziSeduta,
  getEsercizio,
  addEsercizio,
  updateEsercizio,
  deleteEsercizio,
  reorderEsercizi,
};

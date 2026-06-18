'use strict';

/**
 * Bacheca avvisi admin.
 * Tabella: avvisi_bacheca(id, tipo, cliente_id, messaggio, creato_il, letto)
 */

const { getDb } = require('../db/connection');

const TIPI = {
  TESSERA_SCONOSCIUTA: 'tessera_sconosciuta',
  TESSERA_DISATTIVATA: 'tessera_disattivata',
  CLIENTE_NON_ATTIVO:  'cliente_non_attivo',
  SEDUTA_MANCANTE:     'seduta_mancante',
  // futuri: 'saldo_negativo', 'pagamento_scaduto', ...
};

/**
 * Crea un avviso. Restituisce l'id.
 */
function creaAvviso({ tipo, clienteId = null, messaggio }) {
  if (!tipo || !messaggio) {
    const e = new Error('Tipo e messaggio obbligatori'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO avvisi_bacheca (tipo, cliente_id, messaggio)
    VALUES (?, ?, ?)
  `).run(tipo, clienteId, String(messaggio));
  return info.lastInsertRowid;
}

function listAvvisi({ soloNonLetti = false, limit = 100 } = {}) {
  const db = getDb();
  const where = soloNonLetti ? 'WHERE a.letto = 0' : '';
  return db.prepare(`
    SELECT a.id, a.tipo, a.cliente_id, a.messaggio, a.creato_il, a.letto,
           c.nome AS cliente_nome, c.cognome AS cliente_cognome
    FROM avvisi_bacheca a
    LEFT JOIN clienti c ON c.id = a.cliente_id
    ${where}
    ORDER BY a.id DESC
    LIMIT ?
  `).all(limit);
}

function countNonLetti() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS n FROM avvisi_bacheca WHERE letto = 0').get();
  return row.n || 0;
}

function segnaLetto(id) {
  const db = getDb();
  const info = db.prepare('UPDATE avvisi_bacheca SET letto = 1 WHERE id = ?').run(id);
  return info.changes > 0;
}

function segnaTuttiLetti() {
  const db = getDb();
  const info = db.prepare('UPDATE avvisi_bacheca SET letto = 1 WHERE letto = 0').run();
  return info.changes;
}

function getAvviso(id) {
  const db = getDb();
  return db.prepare(`
    SELECT a.id, a.tipo, a.cliente_id, a.messaggio, a.creato_il, a.letto,
           c.nome AS cliente_nome, c.cognome AS cliente_cognome
    FROM avvisi_bacheca a
    LEFT JOIN clienti c ON c.id = a.cliente_id
    WHERE a.id = ?
  `).get(id);
}

module.exports = {
  TIPI,
  creaAvviso,
  listAvvisi,
  countNonLetti,
  segnaLetto,
  segnaTuttiLetti,
  getAvviso,
};

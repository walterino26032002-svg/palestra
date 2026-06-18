'use strict';

/**
 * Servizio blocchi.
 * - Un blocco contiene N settimane * M sedute (default 4x5 = 20 sedute BOZZA).
 * - Quando crei un blocco, le sedute vengono generate automaticamente.
 */

const { getDb } = require('../db/connection');

const DEFAULT_SETTIMANE = 4;
const DEFAULT_SEDUTE_PER_SETTIMANA = 5;

function listBlocchiCliente(clienteId) {
  const db = getDb();
  return db.prepare(`
    SELECT b.*,
           (SELECT COUNT(*) FROM sedute s WHERE s.blocco_id = b.id) AS sedute_totali,
           (SELECT COUNT(*) FROM sedute s WHERE s.blocco_id = b.id AND s.stato = 'COMPLETATA') AS sedute_completate,
           (SELECT COUNT(*) FROM sedute s WHERE s.blocco_id = b.id AND s.stato = 'SALTATA') AS sedute_saltate
    FROM blocchi b
    WHERE b.cliente_id = ?
    ORDER BY b.creato_il DESC, b.id DESC
  `).all(clienteId);
}

function getBlocco(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM blocchi WHERE id = ?').get(id) || null;
}

function countSedutePerBlocco(bloccoId) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS n FROM sedute WHERE blocco_id = ?').get(bloccoId);
  return row ? row.n : 0;
}

/**
 * Crea un blocco + le N sedute BOZZA.
 * @returns {number} id del blocco creato.
 */
function createBlocco({ clienteId, nome, dataInizio, settimane, sedutePerSettimana }) {
  if (!clienteId) {
    const e = new Error('Cliente obbligatorio'); e.code = 'validation'; throw e;
  }
  if (!nome || !String(nome).trim()) {
    const e = new Error('Nome blocco obbligatorio'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const cliente = db.prepare('SELECT id FROM clienti WHERE id = ?').get(clienteId);
  if (!cliente) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }

  const w = Math.max(1, parseInt(settimane, 10) || DEFAULT_SETTIMANE);
  const m = Math.max(1, parseInt(sedutePerSettimana, 10) || DEFAULT_SEDUTE_PER_SETTIMANA);
  const inizio = (dataInizio && /^\d{4}-\d{2}-\d{2}$/.test(dataInizio)) ? dataInizio : new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO blocchi (cliente_id, nome, data_inizio, settimane, sedute_per_settimana)
      VALUES (?, ?, ?, ?, ?)
    `).run(clienteId, String(nome).trim(), inizio, w, m);
    const bloccoId = info.lastInsertRowid;

    const ins = db.prepare(`
      INSERT INTO sedute (blocco_id, cliente_id, indice_settimana, indice_seduta, stato, titolo)
      VALUES (?, ?, ?, ?, 'BOZZA', ?)
    `);
    for (let iw = 1; iw <= w; iw++) {
      for (let is = 1; is <= m; is++) {
        ins.run(bloccoId, clienteId, iw, is, `Settimana ${iw} · Seduta ${is}`);
      }
    }
    return bloccoId;
  });

  return tx();
}

/** Crea blocco default 4 settimane × 5 sedute = 20 BOZZA. */
function createBloccoDefault(clienteId, { nome = 'Blocco 1' } = {}) {
  return createBlocco({
    clienteId,
    nome,
    dataInizio: new Date().toISOString().slice(0, 10),
    settimane: DEFAULT_SETTIMANE,
    sedutePerSettimana: DEFAULT_SEDUTE_PER_SETTIMANA,
  });
}

function updateBlocco(id, { nome, dataInizio, settimane, sedutePerSettimana, archiviato }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM blocchi WHERE id = ?').get(id);
  if (!existing) {
    const e = new Error('Blocco non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`
    UPDATE blocchi
       SET nome = COALESCE(?, nome),
           data_inizio = COALESCE(?, data_inizio),
           settimane = COALESCE(?, settimane),
           sedute_per_settimana = COALESCE(?, sedute_per_settimana),
           archiviato = COALESCE(?, archiviato)
     WHERE id = ?
  `).run(
    nome ?? null,
    dataInizio ?? null,
    settimane === undefined ? null : Math.max(1, parseInt(settimane, 10)),
    sedutePerSettimana === undefined ? null : Math.max(1, parseInt(sedutePerSettimana, 10)),
    archiviato === undefined ? null : (archiviato ? 1 : 0),
    id
  );
  return true;
}

function toggleArchiviato(id) {
  const db = getDb();
  const row = db.prepare('SELECT archiviato FROM blocchi WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Blocco non trovato'); e.code = 'not_found'; throw e;
  }
  const nuovo = row.archiviato ? 0 : 1;
  db.prepare('UPDATE blocchi SET archiviato = ? WHERE id = ?').run(nuovo, id);
  return !!nuovo;
}

module.exports = {
  DEFAULT_SETTIMANE,
  DEFAULT_SEDUTE_PER_SETTIMANA,
  listBlocchiCliente,
  getBlocco,
  countSedutePerBlocco,
  createBlocco,
  createBloccoDefault,
  updateBlocco,
  toggleArchiviato,
};

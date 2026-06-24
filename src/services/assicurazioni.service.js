'use strict';

/**
 * Assicurazioni annuali cliente.
 * Stati: PAGATO | DA_SALDARE
 * Una sola assicurazione per cliente per anno (UNIQUE).
 */

const { getDb } = require('../db/connection');

function currentYear() { return new Date().getFullYear(); }

function getAssicurazioneCliente(clienteId, anno) {
  const db = getDb();
  return db.prepare('SELECT * FROM assicurazioni_annuali_cliente WHERE cliente_id = ? AND anno = ?').get(clienteId, anno) || null;
}

function getAssicurazioneCorrente(clienteId) {
  return getAssicurazioneCliente(clienteId, currentYear());
}

/**
 * Crea assicurazione annuale.
 * data_inizio = YYYY-01-01, data_fine = YYYY-12-31 sempre.
 */
function creaAssicurazioneAnnuale({ clienteId, anno, statoPagamento = 'PAGATO', note }) {
  if (!clienteId) { const e = new Error('Cliente obbligatorio'); e.code = 'validation'; throw e; }
  const a = anno ? parseInt(anno, 10) : currentYear();
  if (!Number.isFinite(a) || a < 2000 || a > 2100) {
    const e = new Error('Anno non valido'); e.code = 'validation'; throw e;
  }
  const stato = statoPagamento === 'DA_SALDARE' ? 'DA_SALDARE' : 'PAGATO';
  const db = getDb();
  const existing = getAssicurazioneCliente(clienteId, a);
  if (existing) {
    const e = new Error(`Assicurazione ${a} già registrata per questo cliente`); e.code = 'duplicate'; throw e;
  }
  const info = db.prepare(`
    INSERT INTO assicurazioni_annuali_cliente
      (cliente_id, anno, data_inizio, data_fine, stato_pagamento, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(clienteId, a, `${a}-01-01`, `${a}-12-31`, stato, note || null);
  return info.lastInsertRowid;
}

/** Aggiorna solo stato_pagamento → PAGATO. */
function markAsPagata(id) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM assicurazioni_annuali_cliente WHERE id = ?').get(id);
  if (!row) { const e = new Error('Assicurazione non trovata'); e.code = 'not_found'; throw e; }
  db.prepare("UPDATE assicurazioni_annuali_cliente SET stato_pagamento = 'PAGATO', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return true;
}

module.exports = { getAssicurazioneCliente, getAssicurazioneCorrente, creaAssicurazioneAnnuale, markAsPagata, currentYear };

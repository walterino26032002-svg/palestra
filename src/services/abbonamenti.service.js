'use strict';

/**
 * Abbonamenti mensili per cliente.
 * Separati dai pacchetti a ingressi: non toccano il ledger movimenti_ingressi.
 */

const { getDb } = require('../db/connection');

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Restituisce l'abbonamento mensile attivo oggi per un cliente, o null.
 */
function getAbbonamentoMensileAttivoOggi(clienteId) {
  const db = getDb();
  const today = todayISO();
  return db.prepare(`
    SELECT a.id, a.cliente_id, a.tipo_abbonamento_id, a.data_inizio, a.data_fine,
           a.stato_pagamento, a.note, a.created_at,
           s.nome AS tipo_nome
    FROM abbonamenti_mensili_cliente a
    LEFT JOIN servizi s ON s.id = a.tipo_abbonamento_id
    WHERE a.cliente_id = ?
      AND a.data_inizio <= ?
      AND a.data_fine >= ?
    ORDER BY a.data_fine DESC
    LIMIT 1
  `).get(clienteId, today, today) || null;
}

/**
 * Lista tutti gli abbonamenti mensili di un cliente, dal più recente.
 */
function listAbbonamenti(clienteId) {
  const db = getDb();
  return db.prepare(`
    SELECT a.id, a.cliente_id, a.tipo_abbonamento_id, a.data_inizio, a.data_fine,
           a.stato_pagamento, a.note, a.created_at,
           s.nome AS tipo_nome
    FROM abbonamenti_mensili_cliente a
    LEFT JOIN servizi s ON s.id = a.tipo_abbonamento_id
    WHERE a.cliente_id = ?
    ORDER BY a.id DESC
  `).all(clienteId);
}

/**
 * Crea un nuovo abbonamento mensile per un cliente.
 */
function creaAbbonamento({ clienteId, tipoAbbonamentoId, dataInizio, dataFine, statoPagamento = 'PAGATO', note, adminId = null }) {
  if (!clienteId || !dataInizio || !dataFine) {
    const e = new Error('Cliente, data inizio e data fine obbligatori'); e.code = 'validation'; throw e;
  }
  if (dataFine < dataInizio) {
    const e = new Error('Data fine deve essere uguale o successiva a data inizio'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO abbonamenti_mensili_cliente
      (cliente_id, tipo_abbonamento_id, data_inizio, data_fine, stato_pagamento, note, admin_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    clienteId,
    tipoAbbonamentoId || null,
    dataInizio,
    dataFine,
    statoPagamento === 'DA_SALDARE' ? 'DA_SALDARE' : 'PAGATO',
    note || null,
    adminId || null
  );
  return info.lastInsertRowid;
}

/**
 * Aggiorna solo stato_pagamento di un abbonamento mensile.
 */
function markAsPagato(id) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM abbonamenti_mensili_cliente WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Abbonamento non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`UPDATE abbonamenti_mensili_cliente SET stato_pagamento = 'PAGATO', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  return true;
}

module.exports = {
  getAbbonamentoMensileAttivoOggi,
  listAbbonamenti,
  creaAbbonamento,
  markAsPagato,
  todayISO,
};

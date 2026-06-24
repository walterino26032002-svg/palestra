'use strict';

/**
 * Pagamenti.
 *
 * REGOLA FONDAMENTALE:
 *   - Quando registri un pagamento, contestualmente crei un movimento
 *     di ingressi POSITIVO (= servizi.ingressi) in `movimenti_ingressi`.
 *   - Le due operazioni avvengono in un'unica transazione: o entrambe o
 *     nessuna. Il saldo è SEMPRE derivato dai movimenti.
 */

const { getDb } = require('../db/connection');
const clienti = require('./clienti.service');
const servizi = require('./servizi.service');
const movimenti = require('./movimenti.service');

function listPagamentiCliente(clienteId, { limit = 100 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT p.id, p.cliente_id, p.servizio_id, p.importo_cent, p.metodo, p.note, p.pagato_il,
           p.admin_id, p.stato_pagamento,
           s.nome AS servizio_nome, s.ingressi AS servizio_ingressi, s.modalita AS servizio_modalita
    FROM pagamenti p
    LEFT JOIN servizi s ON s.id = p.servizio_id
    WHERE p.cliente_id = ?
    ORDER BY p.id DESC
    LIMIT ?
  `).all(clienteId, limit);
}

function getPagamento(id) {
  const db = getDb();
  return db.prepare(`
    SELECT p.id, p.cliente_id, p.servizio_id, p.importo_cent, p.metodo, p.note, p.pagato_il,
           p.admin_id, p.stato_pagamento,
           s.nome AS servizio_nome
    FROM pagamenti p
    LEFT JOIN servizi s ON s.id = p.servizio_id
    WHERE p.id = ?
  `).get(id);
}

/**
 * Registra pagamento + crea movimento ingressi positivo (solo per servizi INGRESSI).
 *
 * @param {object} p
 * @param {number} p.clienteId
 * @param {number} p.servizioId
 * @param {number} [p.importoCent]
 * @param {string} [p.metodo]
 * @param {string} [p.note]
 * @param {number} [p.adminId]
 * @param {string} [p.statoPagamento] - 'PAGATO' | 'DA_SALDARE'
 * @returns {object} { pagamentoId, movimentoId, ingressi, nuovoSaldo }
 */
function registraPagamento({ clienteId, servizioId, importoCent, metodo, note, adminId = null, statoPagamento = 'PAGATO' }) {
  if (!clienteId || !servizioId) {
    const e = new Error('Cliente e servizio obbligatori'); e.code = 'validation'; throw e;
  }
  const cliente = clienti.getCliente(clienteId);
  if (!cliente) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }
  const servizio = servizi.getServizio(servizioId);
  if (!servizio) {
    const e = new Error('Servizio non trovato'); e.code = 'not_found'; throw e;
  }

  const importo = Number.isFinite(+importoCent) && +importoCent >= 0
    ? parseInt(importoCent, 10)
    : servizio.prezzo_cent;

  const stato = statoPagamento === 'DA_SALDARE' ? 'DA_SALDARE' : 'PAGATO';

  const db = getDb();
  const tx = db.transaction(() => {
    const p = db.prepare(`
      INSERT INTO pagamenti (cliente_id, servizio_id, importo_cent, metodo, note, admin_id, stato_pagamento)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(clienteId, servizioId, importo, metodo || null, note || null, adminId, stato);
    const pagamentoId = p.lastInsertRowid;

    // Solo i servizi INGRESSI creano movimenti; i MENSILI no.
    const isMensile = servizio.modalita === 'MENSILE';
    const delta = (!isMensile && servizio.ingressi > 0) ? servizio.ingressi : 0;
    if (delta > 0) {
      const m = db.prepare(`
        INSERT INTO movimenti_ingressi (cliente_id, delta, motivo, riferimento_id, admin_id, creato_il)
        VALUES (?, ?, 'pagamento', ?, ?, datetime('now'))
      `).run(clienteId, delta, pagamentoId, adminId);
      return { pagamentoId, movimentoId: m.lastInsertRowid, ingressi: delta };
    }
    return { pagamentoId, movimentoId: null, ingressi: 0 };
  });

  const result = tx();
  const nuovoSaldo = movimenti.getSaldo(clienteId);
  return { ...result, nuovoSaldo };
}

/**
 * Segna un pagamento come PAGATO (da DA_SALDARE).
 * Non modifica ingressi né saldo.
 */
function markAsPagato(id) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM pagamenti WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Pagamento non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`UPDATE pagamenti SET stato_pagamento = 'PAGATO' WHERE id = ?`).run(id);
  return true;
}

module.exports = {
  listPagamentiCliente,
  getPagamento,
  registraPagamento,
  markAsPagato,
};

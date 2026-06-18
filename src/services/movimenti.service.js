'use strict';

/**
 * Movimenti ingressi — unica sorgente del saldo.
 *
 * REGOLA FONDAMENTALE:
 *   - Il saldo NON è mai un campo della tabella clienti.
 *   - saldo_ingressi = SUM(delta) su movimenti_ingressi per cliente_id.
 *   - Eventuali "correzioni" si fanno inserendo un movimento, mai editando
 *     direttamente il saldo.
 */

const { getDb } = require('../db/connection');

/**
 * Restituisce il saldo ingressi di un cliente.
 * @param {number} clienteId
 * @returns {number}
 */
function getSaldo(clienteId) {
  if (!clienteId) return 0;
  const db = getDb();
  const row = db.prepare(
    'SELECT COALESCE(SUM(delta), 0) AS saldo FROM movimenti_ingressi WHERE cliente_id = ?'
  ).get(clienteId);
  return row ? row.saldo : 0;
}

/**
 * Inserisce un movimento. Restituisce l'id creato.
 */
function insertMovimento({ clienteId, delta, motivo, riferimentoId = null, adminId = null }) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO movimenti_ingressi (cliente_id, delta, motivo, riferimento_id, admin_id, creato_il)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(clienteId, delta, motivo, riferimentoId, adminId);
  return info.lastInsertRowid;
}

/**
 * Ledger completo di un cliente, più recente prima.
 */
function getMovimenti(clienteId, { limit = 200 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT id, cliente_id, delta, motivo, riferimento_id, admin_id, creato_il
    FROM movimenti_ingressi
    WHERE cliente_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(clienteId, limit);
}

/**
 * Calcola il badge (label + classe CSS) in base a stato cliente + saldo.
 * - cliente.attivo = 0  -> 'Non attivo' (UNICO)
 * - saldo >= 2         -> 'Attivo'
 * - saldo = 1          -> 'Ultimo ingresso'
 * - saldo = 0          -> 'Da rinnovare'
 * - saldo < 0          -> 'Da regolarizzare'
 *
 * 'Senza scheda' è un badge separato e non interferisce (placeholder in V1
 * finché non arriva il modulo NFC; viene aggiunto dal chiamante se servono
 * entrambi). Regola: Non attivo ha priorità assoluta.
 */
function getBadge({ cliente, saldo }) {
  if (!cliente || !cliente.attivo) {
    return { label: 'Non attivo', tone: 'danger' };
  }
  if (saldo >= 2) return { label: 'Attivo', tone: 'ok' };
  if (saldo === 1) return { label: 'Ultimo ingresso', tone: 'warn' };
  if (saldo === 0) return { label: 'Da rinnovare', tone: 'warn' };
  return { label: 'Da regolarizzare', tone: 'danger' };
}

module.exports = {
  getSaldo,
  insertMovimento,
  getMovimenti,
  getBadge,
};

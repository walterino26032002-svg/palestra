'use strict';

/**
 * Servizio sedute.
 * Stati: BOZZA, PROSSIMA, COMPLETATA, SALTATA.
 * Vincoli:
 *   - max 1 PROSSIMA per cliente.
 *   - se marcco una seduta PROSSIMA, eventuali altre PROSSIMA dello stesso
 *     cliente tornano BOZZA (salvo COMPLETATA/SALTATA che restano).
 */

const { getDb } = require('../db/connection');

const STATI = ['BOZZA', 'PROSSIMA', 'COMPLETATA', 'SALTATA'];

function listSeduteBlocco(bloccoId) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM esercizi e WHERE e.seduta_id = s.id) AS esercizi_count
    FROM sedute s
    WHERE s.blocco_id = ?
    ORDER BY s.indice_settimana ASC, s.indice_seduta ASC, s.id ASC
  `).all(bloccoId);
}

function getSeduta(id) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, b.nome AS blocco_nome
    FROM sedute s
    JOIN blocchi b ON b.id = s.blocco_id
    WHERE s.id = ?
  `).get(id) || null;
}

function getProssimaSedutaCliente(clienteId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM sedute
    WHERE cliente_id = ? AND stato = 'PROSSIMA'
    ORDER BY id DESC LIMIT 1
  `).get(clienteId) || null;
}

/**
 * Cambia stato seduta.
 * Garantisce max 1 PROSSIMA per cliente.
 */
function setStatoSeduta(id, nuovoStato) {
  if (!STATI.includes(nuovoStato)) {
    const e = new Error(`Stato non valido: ${nuovoStato}`); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const seduta = db.prepare('SELECT id, cliente_id FROM sedute WHERE id = ?').get(id);
  if (!seduta) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }

  const tx = db.transaction(() => {
    if (nuovoStato === 'PROSSIMA') {
      // Le PROSSIMA esistenti dello stesso cliente -> BOZZA.
      db.prepare(`
        UPDATE sedute SET stato = 'BOZZA', aggiornata_il = datetime('now')
        WHERE cliente_id = ? AND stato = 'PROSSIMA' AND id != ?
      `).run(seduta.cliente_id, id);
    }
    db.prepare(`
      UPDATE sedute SET stato = ?, aggiornata_il = datetime('now') WHERE id = ?
    `).run(nuovoStato, id);
  });
  tx();
  return true;
}

/**
 * Marca la seduta come PROSSIMA (garantendo unicità).
 */
function setProssima(id) {
  return setStatoSeduta(id, 'PROSSIMA');
}

/**
 * Copia tutti gli esercizi da una seduta a un'altra (per funzione "Prepara
 * prossima seduta" che arriverà nello step successivo). Non copia feedback.
 */
function copiaEserciziDa({ daSedutaId, aSedutaId }) {
  if (!daSedutaId || !aSedutaId || daSedutaId === aSedutaId) {
    const e = new Error('Sedute non valide'); e.code = 'validation'; throw e;
  }
  const db = getDb();
  const sorg = db.prepare('SELECT id FROM sedute WHERE id = ?').get(daSedutaId);
  const dest = db.prepare('SELECT id FROM sedute WHERE id = ?').get(aSedutaId);
  if (!sorg || !dest) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }

  const tx = db.transaction(() => {
    const esercizi = db.prepare(`
      SELECT ordine, nome, serie, ripetizioni, carico, recupero, note
      FROM esercizi WHERE seduta_id = ?
      ORDER BY ordine ASC, id ASC
    `).all(daSedutaId);

    // Pulisci esercizi destinazione
    db.prepare('DELETE FROM esercizi WHERE seduta_id = ?').run(aSedutaId);

    const ins = db.prepare(`
      INSERT INTO esercizi (seduta_id, ordine, nome, serie, ripetizioni, carico, recupero, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ex of esercizi) {
      ins.run(aSedutaId, ex.ordine, ex.nome, ex.serie, ex.ripetizioni, ex.carico, ex.recupero, ex.note);
    }
    return esercizi.length;
  });

  return tx();
}

module.exports = {
  STATI,
  listSeduteBlocco,
  getSeduta,
  getProssimaSedutaCliente,
  setStatoSeduta,
  setProssima,
  copiaEserciziDa,
};

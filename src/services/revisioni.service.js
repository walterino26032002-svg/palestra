'use strict';

/**
 * Revisione coach delle sedute COMPLETATE + "Prepara prossima seduta".
 *
 * - Lo stato di revisione vive in feedback_seduta.revisionato_il (+ note_coach).
 *   Una seduta COMPLETATA puo' non avere ancora una riga feedback_seduta
 *   (completata senza feedback): LEFT JOIN + revisionato_il IS NULL copre tutto.
 * - "Prepara prossima seduta" (CLAUDE.md §6.3):
 *     origine = seduta COMPLETATA;
 *     destinazione = primo slot BOZZA futuro dello STESSO blocco
 *       (ordine indice_settimana, indice_seduta);
 *     copia esercizi (NON feedback);
 *     destinazione -> PROSSIMA;
 *     eventuale precedente PROSSIMA del cliente -> BOZZA
 *       (SALTATA solo su marcatura esplicita del coach);
 *     nessun movimento ingressi.
 */

const { getDb } = require('../db/connection');
const seduteService = require('./sedute.service');
const eserciziService = require('./esercizi.service');
const { listFeedbackEserciziSeduta, getFeedbackSeduta } = require('./feedback.service');

/** Elenco sedute COMPLETATE. Di default solo quelle non ancora revisionate. */
function listDaRevisionare({ includeRevisionate = false, limit = 200 } = {}) {
  const db = getDb();
  const filtroRevisione = includeRevisionate ? '' : 'AND fs.revisionato_il IS NULL';
  return db.prepare(`
    SELECT s.id              AS seduta_id,
           s.cliente_id,
           s.blocco_id,
           s.indice_settimana,
           s.indice_seduta,
           s.titolo,
           s.aggiornata_il,
           c.nome            AS cliente_nome,
           c.cognome         AS cliente_cognome,
           b.nome            AS blocco_nome,
           fs.commento,
           fs.voto,
           fs.inviato_il,
           fs.revisionato_il,
           fs.note_coach
    FROM sedute s
    JOIN clienti c ON c.id = s.cliente_id
    JOIN blocchi b ON b.id = s.blocco_id
    LEFT JOIN feedback_seduta fs
           ON fs.seduta_id = s.id AND fs.cliente_id = s.cliente_id
    WHERE s.stato = 'COMPLETATA'
      ${filtroRevisione}
    ORDER BY COALESCE(fs.inviato_il, s.aggiornata_il) ASC, s.id ASC
    LIMIT ?
  `).all(limit);
}

/** Conteggio sedute COMPLETATE non ancora revisionate (badge dashboard). */
function countDaRevisionare() {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM sedute s
    LEFT JOIN feedback_seduta fs
           ON fs.seduta_id = s.id AND fs.cliente_id = s.cliente_id
    WHERE s.stato = 'COMPLETATA'
      AND fs.revisionato_il IS NULL
  `).get();
  return row ? row.n : 0;
}

/** Trova il primo slot BOZZA successivo (stesso blocco) alla seduta di origine. */
function findProssimoSlotBozza(seduta) {
  const db = getDb();
  return db.prepare(`
    SELECT id, indice_settimana, indice_seduta
    FROM sedute
    WHERE blocco_id = ?
      AND stato = 'BOZZA'
      AND ( indice_settimana > ?
            OR (indice_settimana = ? AND indice_seduta > ?) )
    ORDER BY indice_settimana ASC, indice_seduta ASC, id ASC
    LIMIT 1
  `).get(seduta.blocco_id, seduta.indice_settimana, seduta.indice_settimana, seduta.indice_seduta) || null;
}

/** Dettaglio per la pagina revisione: seduta + esercizi + feedback. */
function getDettaglioRevisione(sedutaId) {
  const seduta = seduteService.getSeduta(sedutaId);
  if (!seduta) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }
  if (seduta.stato !== 'COMPLETATA') {
    const e = new Error('Solo le sedute COMPLETATE sono revisionabili'); e.code = 'invalid_state'; throw e;
  }
  const db = getDb();
  const cliente = db.prepare(
    'SELECT id, nome, cognome, email, attivo FROM clienti WHERE id = ?'
  ).get(seduta.cliente_id);

  const esercizi = eserciziService.listEserciziSeduta(sedutaId);

  const feedbackEsercizi = listFeedbackEserciziSeduta(seduta.cliente_id, sedutaId);

  const feedbackSeduta = getFeedbackSeduta(seduta.cliente_id, sedutaId);

  const puoPreparareProssima = !!findProssimoSlotBozza(seduta);

  return {
    seduta,
    cliente,
    esercizi,
    feedback_esercizi: feedbackEsercizi,
    feedback_seduta: feedbackSeduta,
    puo_preparare_prossima: puoPreparareProssima,
  };
}

/**
 * Salva la revisione coach: imposta note_coach + revisionato_il = now.
 * Fa upsert: se non esiste la riga feedback_seduta la crea (seduta completata
 * senza feedback cliente).
 */
function salvaRevisione(sedutaId, { note_coach } = {}) {
  const seduta = seduteService.getSeduta(sedutaId);
  if (!seduta) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }
  if (seduta.stato !== 'COMPLETATA') {
    const e = new Error('Solo le sedute COMPLETATE sono revisionabili'); e.code = 'invalid_state'; throw e;
  }
  const db = getDb();
  const note = (note_coach == null || note_coach === '') ? null : String(note_coach);
  db.prepare(`
    INSERT INTO feedback_seduta (seduta_id, cliente_id, note_coach, revisionato_il)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(seduta_id, cliente_id) DO UPDATE SET
      note_coach = excluded.note_coach,
      revisionato_il = datetime('now')
  `).run(sedutaId, seduta.cliente_id, note);

  return db.prepare(`
    SELECT id, seduta_id, cliente_id, commento, voto, inviato_il, revisionato_il, note_coach
    FROM feedback_seduta WHERE seduta_id = ? AND cliente_id = ?
  `).get(sedutaId, seduta.cliente_id);
}

/**
 * Prepara la prossima seduta a partire da una seduta COMPLETATA.
 * @returns {{ nuova_seduta_id, copiati, origine_id }}
 */
function preparaProssimaSeduta(sedutaId) {
  const origine = seduteService.getSeduta(sedutaId);
  if (!origine) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }
  if (origine.stato !== 'COMPLETATA') {
    const e = new Error('La prossima seduta si prepara da una seduta COMPLETATA'); e.code = 'invalid_state'; throw e;
  }

  const dest = findProssimoSlotBozza(origine);
  if (!dest) {
    const e = new Error('Nessuno slot BOZZA disponibile dopo questa seduta nel blocco'); e.code = 'no_slot'; throw e;
  }

  const db = getDb();
  const clienteId = origine.cliente_id;

  const tx = db.transaction(() => {
    // 1) copia esercizi origine -> destinazione (svuota destinazione, no feedback)
    const copiati = seduteService.copiaEserciziDa({ daSedutaId: origine.id, aSedutaId: dest.id });

    // 2) precedente PROSSIMA del cliente (se esiste e NON e' la destinazione) -> BOZZA
    //    SALTATA si usa solo quando il coach marca esplicitamente una seduta.
    db.prepare(`
      UPDATE sedute SET stato = 'BOZZA', aggiornata_il = datetime('now')
      WHERE cliente_id = ? AND stato = 'PROSSIMA' AND id != ?
    `).run(clienteId, dest.id);

    // 3) destinazione -> PROSSIMA
    db.prepare(`
      UPDATE sedute SET stato = 'PROSSIMA', aggiornata_il = datetime('now')
      WHERE id = ?
    `).run(dest.id);

    return copiati;
  });

  const copiati = tx();
  return { nuova_seduta_id: dest.id, copiati, origine_id: origine.id };
}

module.exports = {
  listDaRevisionare,
  countDaRevisionare,
  findProssimoSlotBozza,
  getDettaglioRevisione,
  salvaRevisione,
  preparaProssimaSeduta,
};

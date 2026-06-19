'use strict';

const { getDb } = require('../db/connection');

/** Letture condivise feedback esercizi/seduta (usate da clienteWorkout e revisioni). */

function listFeedbackEserciziSeduta(clienteId, sedutaId) {
  return getDb().prepare(`
    SELECT fe.id, fe.esercizio_id, fe.cliente_id, fe.carico_effettivo, fe.reps_effettive,
           fe.difficolta, fe.note, fe.stato, fe.aggiornato_il
    FROM feedback_esercizi fe
    JOIN esercizi e ON e.id = fe.esercizio_id
    WHERE fe.cliente_id = ? AND e.seduta_id = ?
    ORDER BY e.ordine ASC, e.id ASC
  `).all(clienteId, sedutaId);
}

function getFeedbackSeduta(clienteId, sedutaId) {
  return getDb().prepare(`
    SELECT id, seduta_id, cliente_id, commento, voto, inviato_il, revisionato_il, note_coach
    FROM feedback_seduta WHERE cliente_id = ? AND seduta_id = ?
  `).get(clienteId, sedutaId) || null;
}

module.exports = { listFeedbackEserciziSeduta, getFeedbackSeduta };

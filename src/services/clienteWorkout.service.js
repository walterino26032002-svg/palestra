'use strict';

const { getDb } = require('../db/connection');
const checkinService = require('./checkin.service');
const seduteService = require('./sedute.service');
const eserciziService = require('./esercizi.service');
const clientiService = require('./clienti.service');
const movimentiService = require('./movimenti.service');
const abbonamenti = require('./abbonamenti.service');
const {
  listFeedbackEserciziSeduta: listFeedbackForSeduta,
  getFeedbackSeduta,
} = require('./feedback.service');

function todayISO() {
  return checkinService.todayISO();
}

function getClienteContext(clienteId) {
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) {
    const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e;
  }
  const presenza = checkinService.findPresenzaOggi(clienteId);
  const prossima = seduteService.getProssimaSedutaCliente(clienteId);
  const saldo = movimentiService.getSaldo(clienteId);
  const badge = movimentiService.getBadge({ cliente, saldo });
  const mensile = abbonamenti.getAbbonamentoMensileAttivoOggi(clienteId);
  return {
    cliente,
    saldo_ingressi: saldo,
    badge_label: badge.label,
    badge_tone: badge.tone,
    checked_in_today: !!presenza,
    presenza_oggi: presenza,
    prossima_seduta: prossima,
    allenamento_sbloccato: !!(presenza && prossima),
    mensile_attivo: mensile ? { data_fine: mensile.data_fine, tipo_nome: mensile.tipo_nome } : null,
  };
}

function assertClienteOwnership(clienteId, sedutaId) {
  const seduta = seduteService.getSeduta(sedutaId);
  if (!seduta || seduta.cliente_id !== clienteId) {
    const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e;
  }
  return seduta;
}

function getAllenamento(clienteId) {
  const ctx = getClienteContext(clienteId);
  if (!ctx.checked_in_today) {
    const e = new Error('Check-in richiesto per sbloccare l\'allenamento'); e.code = 'checkin_required'; throw e;
  }
  if (!ctx.prossima_seduta) {
    const e = new Error('Nessuna seduta PROSSIMA disponibile'); e.code = 'no_workout'; throw e;
  }
  const seduta = assertClienteOwnership(clienteId, ctx.prossima_seduta.id);
  const esercizi = eserciziService.listEserciziSeduta(seduta.id);
  const feedback = listFeedbackForSeduta(clienteId, seduta.id);
  const feedbackSeduta = getFeedbackSeduta(clienteId, seduta.id);
  return {
    ...ctx,
    seduta,
    esercizi,
    feedback,
    feedback_seduta: feedbackSeduta,
  };
}

function getFeedbackEsercizio(clienteId, esercizioId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, esercizio_id, cliente_id, carico_effettivo, reps_effettive, difficolta, note, stato, aggiornato_il
    FROM feedback_esercizi
    WHERE cliente_id = ? AND esercizio_id = ?
  `).get(clienteId, esercizioId) || null;
}

function upsertFeedbackEsercizio(clienteId, esercizioId, data = {}) {
  const esercizio = eserciziService.getEsercizio(esercizioId);
  if (!esercizio) {
    const e = new Error('Esercizio non trovato'); e.code = 'not_found'; throw e;
  }
  const seduta = assertClienteOwnership(clienteId, esercizio.seduta_id);
  if (seduta.stato !== 'PROSSIMA') {
    const e = new Error('Feedback disponibile solo per la seduta PROSSIMA'); e.code = 'invalid_state'; throw e;
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO feedback_esercizi (esercizio_id, cliente_id, carico_effettivo, reps_effettive, difficolta, note, stato, aggiornato_il)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(esercizio_id, cliente_id) DO UPDATE SET
      carico_effettivo = excluded.carico_effettivo,
      reps_effettive = excluded.reps_effettive,
      difficolta = excluded.difficolta,
      note = excluded.note,
      stato = COALESCE(excluded.stato, feedback_esercizi.stato),
      aggiornato_il = datetime('now')
  `).run(
    esercizioId,
    clienteId,
    data.carico_effettivo ?? data.carico ?? null,
    data.reps_effettive ?? data.reps ?? null,
    data.difficolta === undefined || data.difficolta === '' ? null : parseInt(data.difficolta, 10),
    data.note ?? null,
    data.stato ?? null,
  );
  return getFeedbackEsercizio(clienteId, esercizioId);
}

function upsertFeedbackSeduta(clienteId, sedutaId, data = {}) {
  const seduta = assertClienteOwnership(clienteId, sedutaId);
  if (seduta.stato !== 'PROSSIMA' && seduta.stato !== 'COMPLETATA') {
    const e = new Error('Feedback seduta non disponibile'); e.code = 'invalid_state'; throw e;
  }
  // D4: blocca modifiche se il coach ha già revisionato
  const db = getDb();
  const esistente = db.prepare('SELECT revisionato_il FROM feedback_seduta WHERE seduta_id = ? AND cliente_id = ?').get(sedutaId, clienteId);
  if (esistente && esistente.revisionato_il) {
    const e = new Error('Allenamento già revisionato dal coach'); e.code = 'invalid_state'; throw e;
  }
  db.prepare(`
    INSERT INTO feedback_seduta (seduta_id, cliente_id, commento, voto, inviato_il, revisionato_il, note_coach)
    VALUES (?, ?, ?, ?, COALESCE((SELECT inviato_il FROM feedback_seduta WHERE seduta_id = ? AND cliente_id = ?), datetime('now')), ?, ?)
    ON CONFLICT(seduta_id, cliente_id) DO UPDATE SET
      commento = excluded.commento,
      voto = excluded.voto,
      inviato_il = COALESCE(feedback_seduta.inviato_il, datetime('now')),
      note_coach = COALESCE(excluded.note_coach, feedback_seduta.note_coach)
  `).run(
    sedutaId,
    clienteId,
    data.commento ?? null,
    data.voto === undefined || data.voto === '' ? null : parseInt(data.voto, 10),
    sedutaId,
    clienteId,
    data.revisionato_il ?? null,
    data.note_coach ?? null,
  );
  return getFeedbackSeduta(clienteId, sedutaId);
}

function completaSeduta(clienteId, sedutaId, data = {}) {
  const seduta = assertClienteOwnership(clienteId, sedutaId);
  if (!checkinService.findPresenzaOggi(clienteId)) {
    const e = new Error('Check-in richiesto per completare l\'allenamento'); e.code = 'checkin_required'; throw e;
  }
  if (seduta.stato !== 'PROSSIMA') {
    const e = new Error('La seduta non e\' piu PROSSIMA'); e.code = 'invalid_state'; throw e;
  }
  const db = getDb();
  const tx = db.transaction(() => {
    upsertFeedbackSeduta(clienteId, sedutaId, data);
    seduteService.setStatoSeduta(sedutaId, 'COMPLETATA');
  });
  tx();
  return {
    seduta: seduteService.getSeduta(sedutaId),
    feedback_seduta: getFeedbackSeduta(clienteId, sedutaId),
  };
}

module.exports = {
  todayISO,
  getClienteContext,
  getAllenamento,
  getFeedbackEsercizio,
  upsertFeedbackEsercizio,
  getFeedbackSeduta,
  upsertFeedbackSeduta,
  completaSeduta,
  assertClienteOwnership,
  listFeedbackForSeduta,
};

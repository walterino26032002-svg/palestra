'use strict';

/**
 * Check-in NFC — orchestratore della logica 5 casi (vedi CLAUDE.md §7).
 *
 * Casi:
 *  A) tessera sconosciuta         -> evento, avviso, ok=false (motivo tessera_sconosciuta)
 *  B) tessera esistente ma inattiva -> evento, avviso, ok=false (motivo tessera_disattivata)
 *  C) cliente non attivo          -> evento, avviso, ok=false (motivo cliente_non_attivo)
 *  D) cliente attivo, primo NFC del giorno
 *                                  -> presenza + (se non mensile attivo) movimento -1,
 *                                     eventuale seduta PROSSIMA, avviso se manca la seduta. ok=true.
 *  E) cliente attivo, NFC ripetuto stesso giorno
 *                                  -> solo evento. ok=true, already_checked_today=true.
 *
 * Regola fondamentale: il calendario NON decide l'allenamento.
 * La seduta PROSSIMA è l'unica fonte di verità per l'allenamento.
 *
 * STEP10 — mensile attivo: se cliente ha abbonamento mensile attivo oggi,
 * il check-in procede normalmente (presenza) ma NON scala ingressi (-1).
 */

const { getDb } = require('../db/connection');
const nfc = require('./nfc.service');
const movimenti = require('./movimenti.service');
const bacheca = require('./bacheca.service');
const seduteService = require('./sedute.service');
const abbonamenti = require('./abbonamenti.service');

function normalizeUid(uid) {
  return String(uid || '').trim().toUpperCase();
}

function todayISO() {
  // 'YYYY-MM-DD' locale
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function findProssimaSeduta(clienteId) {
  return seduteService.getProssimaSedutaCliente(clienteId);
}

function findPresenzaOggi(clienteId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, entrata_il FROM presenze
    WHERE cliente_id = ? AND data = ?
  `).get(clienteId, todayISO()) || null;
}

function registraPresenza(clienteId) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO presenze (cliente_id, data, entrata_il)
    VALUES (?, ?, datetime('now'))
  `).run(clienteId, todayISO());
  return info.lastInsertRowid;
}

/**
 * Elabora una lettura NFC.
 * @param {object} input
 * @param {string} input.uid       - codice tessera
 * @param {string} [input.sorgente] - 'simulatore', 'endpoint', ...
 * @returns {object} risposta standard (vedi CLAUDE.md §7.2)
 */
function elaboraCheckin({ uid, sorgente = 'endpoint' }) {
  const rispostaBase = {
    ok: false,
    motivo: null,
    saldo_ingressi: 0,
    prossima_seduta_id: null,
    allenamento_sbloccato: false,
    already_checked_today: false,
    cliente_id: null,
    tessera_uid: uid || null,
  };

  if (!uid || !String(uid).trim()) {
    return { ...rispostaBase, ok: false, motivo: 'richiesta_non_valida' };
  }
  const tesseraUid = normalizeUid(uid);

  // ----- Lookup tessera -----
  const tessera = nfc.findByUid(tesseraUid);

  // CASO A — sconosciuta (include tessere orfane con cliente_id = NULL)
  if (!tessera || tessera.cliente_id === null || tessera.cliente_id === undefined) {
    nfc.insertEvento({ tesseraUid, clienteId: null, sorgente, esito: 'unknown_card' });
    bacheca.creaAvviso({
      tipo: bacheca.TIPI.TESSERA_SCONOSCIUTA,
      messaggio: `Lettura NFC tessera sconosciuta: ${tesseraUid}`,
    });
    return { ...rispostaBase, ok: false, motivo: 'tessera_sconosciuta' };
  }

  // CASO B — disattivata
  if (!tessera.attiva) {
    nfc.insertEvento({ tesseraUid, clienteId: tessera.cliente_id, sorgente, esito: 'inactive_card' });
    bacheca.creaAvviso({
      tipo: bacheca.TIPI.TESSERA_DISATTIVATA,
      clienteId: tessera.cliente_id,
      messaggio: `Tessera ${tesseraUid} disattivata — ignorata.`,
    });
    return { ...rispostaBase, ok: false, motivo: 'tessera_disattivata', cliente_id: tessera.cliente_id };
  }

  const clienteId = tessera.cliente_id;
  const clienteAttivo = !!tessera.cli_attivo;

  // CASO C — cliente non attivo
  if (!clienteAttivo) {
    nfc.insertEvento({ tesseraUid, clienteId, sorgente, esito: 'inactive_client' });
    bacheca.creaAvviso({
      tipo: bacheca.TIPI.CLIENTE_NON_ATTIVO,
      clienteId,
      messaggio: `NFC da cliente non attivo: ${tessera.cli_cognome || ''} ${tessera.cli_nome || ''} (${tesseraUid})`.trim(),
    });
    return {
      ...rispostaBase,
      ok: false,
      motivo: 'cliente_non_attivo',
      cliente_id: clienteId,
      saldo_ingressi: movimenti.getSaldo(clienteId),
    };
  }

  const presenzaOggi = findPresenzaOggi(clienteId);

  // CASO E — già presente oggi
  if (presenzaOggi) {
    nfc.insertEvento({ tesseraUid, clienteId, sorgente, esito: 'already_checked_in' });
    const prossima = findProssimaSeduta(clienteId);
    return {
      ...rispostaBase,
      ok: true,
      motivo: 'gia_presente',
      already_checked_today: true,
      cliente_id: clienteId,
      saldo_ingressi: movimenti.getSaldo(clienteId),
      prossima_seduta_id: prossima ? prossima.id : null,
      allenamento_sbloccato: !!prossima,
    };
  }

  // CASO D — primo NFC del giorno
  // Controlla mensile attivo: se attivo, non scala ingressi
  const mensileAttivo = abbonamenti.getAbbonamentoMensileAttivoOggi(clienteId);

  const db = getDb();
  let alreadyIn = false;
  try {
    const tx = db.transaction(() => {
      registraPresenza(clienteId);
      if (!mensileAttivo) {
        movimenti.insertMovimento({
          clienteId,
          delta: -1,
          motivo: 'checkin',
          riferimentoId: null,
          adminId: null,
        });
      }
    });
    tx();
  } catch (e) {
    // UNIQUE constraint su presenze(cliente_id, data) violato da doppio check-in concorrente
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || (e.message && e.message.includes('UNIQUE constraint'))) {
      alreadyIn = true;
    } else {
      throw e;
    }
  }

  if (alreadyIn) {
    nfc.insertEvento({ tesseraUid, clienteId, sorgente, esito: 'already_checked_in' });
    const prossima2 = findProssimaSeduta(clienteId);
    return {
      ...rispostaBase,
      ok: true,
      motivo: 'gia_presente',
      already_checked_today: true,
      cliente_id: clienteId,
      saldo_ingressi: movimenti.getSaldo(clienteId),
      prossima_seduta_id: prossima2 ? prossima2.id : null,
      allenamento_sbloccato: !!prossima2,
    };
  }

  nfc.insertEvento({ tesseraUid, clienteId, sorgente, esito: 'ok' });

  const prossima = findProssimaSeduta(clienteId);
  if (!prossima) {
    // D1: evita avvisi seduta_mancante duplicati per stesso cliente/data
    const db2 = getDb();
    const avvisoOggi = db2.prepare(`
      SELECT id FROM avvisi_bacheca
      WHERE tipo = 'seduta_mancante' AND cliente_id = ? AND DATE(creato_il) = ?
    `).get(clienteId, todayISO());
    if (!avvisoOggi) {
      bacheca.creaAvviso({
        tipo: bacheca.TIPI.SEDUTA_MANCANTE,
        clienteId,
        messaggio: `Cliente ${tessera.cli_cognome} ${tessera.cli_nome} ha fatto check-in ma non ha una seduta PROSSIMA.`,
      });
    }
  }

  return {
    ...rispostaBase,
    ok: true,
    motivo: prossima ? 'ok' : 'ok_senza_seduta',
    cliente_id: clienteId,
    saldo_ingressi: movimenti.getSaldo(clienteId),
    prossima_seduta_id: prossima ? prossima.id : null,
    allenamento_sbloccato: !!prossima,
  };
}

module.exports = {
  elaboraCheckin,
  todayISO,
  findProssimaSeduta,
  findPresenzaOggi,
};

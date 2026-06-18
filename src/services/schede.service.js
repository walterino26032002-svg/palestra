'use strict';

/**
 * Servizio schede (vista aggregata cliente).
 * - Lista blocchi del cliente.
 * - Conta sedute per stato.
 * - Determina se il cliente è "Senza scheda" (nessun blocco).
 * - Recupera la seduta PROSSIMA (se esiste) per il dettaglio cliente.
 */

const blocchiService = require('./blocchi.service');
const seduteService  = require('./sedute.service');

function hasScheda(clienteId) {
  const blocchi = blocchiService.listBlocchiCliente(clienteId);
  return blocchi.length > 0;
}

function riepilogoCliente(clienteId) {
  const blocchi = blocchiService.listBlocchiCliente(clienteId);
  const prossima = seduteService.getProssimaSedutaCliente(clienteId);
  let totaleSedute = 0;
  let completate = 0;
  for (const b of blocchi) {
    totaleSedute += b.sedute_totali || 0;
    completate   += b.sedute_completate || 0;
  }
  return {
    ha_scheda: blocchi.length > 0,
    blocchi_count: blocchi.length,
    blocchi_archiviati: blocchi.filter((b) => b.archiviato).length,
    sedute_totali: totaleSedute,
    sedute_completate: completate,
    prossima_seduta: prossima,
    blocchi: blocchi,
  };
}

module.exports = {
  hasScheda,
  riepilogoCliente,
};

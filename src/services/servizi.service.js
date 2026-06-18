'use strict';

/**
 * Servizi / Listino.
 */

const { getDb } = require('../db/connection');

function listServizi({ soloAttivi = false } = {}) {
  const db = getDb();
  const where = soloAttivi ? 'WHERE attivo = 1' : '';
  return db.prepare(`
    SELECT id, nome, descrizione, ingressi, prezzo_cent, attivo, creato_il
    FROM servizi
    ${where}
    ORDER BY attivo DESC, nome ASC
  `).all();
}

function getServizio(id) {
  const db = getDb();
  return db.prepare(`
    SELECT id, nome, descrizione, ingressi, prezzo_cent, attivo, creato_il
    FROM servizi WHERE id = ?
  `).get(id);
}

function createServizio({ nome, descrizione, ingressi, prezzoCent, attivo = 1 }) {
  if (!nome || !String(nome).trim()) {
    const e = new Error('Nome obbligatorio'); e.code = 'validation'; throw e;
  }
  const ingr = Number.isFinite(+ingressi) ? Math.max(0, parseInt(ingressi, 10)) : 1;
  const prezzo = Number.isFinite(+prezzoCent) ? Math.max(0, parseInt(prezzoCent, 10)) : 0;
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO servizi (nome, descrizione, ingressi, prezzo_cent, attivo)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(nome).trim(),
    descrizione ? String(descrizione).trim() : null,
    ingr,
    prezzo,
    attivo ? 1 : 0
  );
  return info.lastInsertRowid;
}

function updateServizio(id, { nome, descrizione, ingressi, prezzoCent, attivo }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM servizi WHERE id = ?').get(id);
  if (!existing) {
    const e = new Error('Servizio non trovato'); e.code = 'not_found'; throw e;
  }
  db.prepare(`
    UPDATE servizi
       SET nome        = COALESCE(?, nome),
           descrizione = ?,
           ingressi    = COALESCE(?, ingressi),
           prezzo_cent = COALESCE(?, prezzo_cent),
           attivo      = COALESCE(?, attivo)
     WHERE id = ?
  `).run(
    nome ?? null,
    descrizione ?? null,
    ingressi === undefined ? null : Math.max(0, parseInt(ingressi, 10)),
    prezzoCent === undefined ? null : Math.max(0, parseInt(prezzoCent, 10)),
    attivo === undefined ? null : (attivo ? 1 : 0),
    id
  );
  return true;
}

function toggleAttivo(id) {
  const db = getDb();
  const row = db.prepare('SELECT attivo FROM servizi WHERE id = ?').get(id);
  if (!row) {
    const e = new Error('Servizio non trovato'); e.code = 'not_found'; throw e;
  }
  const nuovo = row.attivo ? 0 : 1;
  db.prepare('UPDATE servizi SET attivo = ? WHERE id = ?').run(nuovo, id);
  return !!nuovo;
}

module.exports = {
  listServizi,
  getServizio,
  createServizio,
  updateServizio,
  toggleAttivo,
};

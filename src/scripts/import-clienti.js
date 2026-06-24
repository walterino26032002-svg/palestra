'use strict';
/**
 * Import clienti da Excel.
 * Usage:
 *   node src/scripts/import-clienti.js import/ELENCO_IMPORT.xlsx          # dry-run
 *   node src/scripts/import-clienti.js import/ELENCO_IMPORT.xlsx --apply  # esegue
 */

const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));

const XLSX = require('xlsx');
const { getDb } = require('../db/connection');
require('../db/migrator').up();

const apply = process.argv.includes('--apply');
const filePath = process.argv.find(a => a.endsWith('.xlsx'));
if (!filePath) { console.error('Manca il path del file .xlsx'); process.exit(1); }

// ── Utility ──────────────────────────────────────────────────────────────────
function norm(s) { return String(s || '').trim(); }
function normUp(s) { return norm(s).toUpperCase(); }

function excelDateToISO(n) {
  // Excel serial date (number) → YYYY-MM-DD
  if (!n || typeof n !== 'number') return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().substring(0, 10);
}

function parseDate(v) {
  if (!v || v === '') return null;
  if (typeof v === 'number') return excelDateToISO(v);
  const s = String(v).trim();
  if (!s) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function mapStato(s) {
  const v = normUp(s);
  if (v === 'PAGATO' || v === '') return 'PAGATO';
  if (v === 'DA_RISCUOTERE' || v === 'DA_SALDARE') return 'DA_SALDARE';
  return null; // invalid
}

function normUsername(s) {
  return norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
}

function generaUsername(nome, cognome, db) {
  const n = normUsername(nome), c = normUsername(cognome);
  if (!n || !c) return null;
  const check = db.prepare('SELECT id FROM clienti WHERE username = ?');
  let candidate = `${n}.${c}`;
  let i = 2;
  while (check.get(candidate)) { candidate = `${n}.${c}${i++}`; }
  return candidate;
}

// ── Servizi da Excel (Abbonamenti_costi) ─────────────────────────────────────
// Mappa: NOME_TIPO → { ingressi, prezzoCent, modalita }
const SERVICES = {
  'COACHING AVANZATO 12 INGRESSI':       { ingressi: 12, prezzoCent: 8000,  modalita: 'INGRESSI' },
  'COACHING AVANZATO FAMILY 14 INGRESSI':{ ingressi: 14, prezzoCent: 8000,  modalita: 'INGRESSI' },
  'MENSILE 100':                          { ingressi: 0,  prezzoCent: 10000, modalita: 'MENSILE'  },
  'MENSILE 65':                           { ingressi: 0,  prezzoCent: 6500,  modalita: 'MENSILE'  },
  'INGRESSO SINGOLO ISCRITTO':            { ingressi: 1,  prezzoCent: 800,   modalita: 'INGRESSI' },
  'INGRESSO SINGOLO NON ISCRITTO':        { ingressi: 1,  prezzoCent: 1200,  modalita: 'INGRESSI' },
};

function getOrCreateServizio(db, nomeRaw) {
  const nome = normUp(nomeRaw);
  const def = SERVICES[nome];
  if (!def) return null; // non riconosciuto
  const existing = db.prepare("SELECT id FROM servizi WHERE UPPER(TRIM(nome)) = ?").get(nome);
  if (existing) return { id: existing.id, ...def };
  const info = db.prepare(
    "INSERT INTO servizi (nome, ingressi, prezzo_cent, attivo, modalita) VALUES (?, ?, ?, 1, ?)"
  ).run(norm(nomeRaw), def.ingressi, def.prezzoCent, def.modalita);
  return { id: info.lastInsertRowid, ...def };
}

// ── Core import ───────────────────────────────────────────────────────────────
function runImport(filePath, apply) {
  const db = getDb();
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Import_clienti'];
  if (!ws) { console.error('Foglio Import_clienti non trovato'); process.exit(1); }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const anno = new Date().getFullYear();
  const stats = { lette: rows.length, create: 0, esistenti: 0, movimenti: 0, mensili: 0, assicurazioni: 0, saltate: 0, warnings: [], errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // Excel row (1=header, data starts at 2)
    const imp = normUp(r.importare);

    if (!imp || imp === 'NO') { stats.saltate++; continue; }
    if (imp !== 'SI' && imp !== 'SI_CREARE SOLAMENTE UTENTE') {
      stats.warnings.push(`Riga ${rowNum}: importare="${r.importare}" sconosciuto — saltata`);
      stats.saltate++; continue;
    }

    const nome = norm(r.nome), cognome = norm(r.cognome);
    if (!nome || !cognome) { stats.warnings.push(`Riga ${rowNum}: nome/cognome mancante — saltata`); stats.saltate++; continue; }

    const statoRaw = norm(r.stato_pagamento);
    const stato = mapStato(statoRaw);
    if (stato === null) { stats.errors.push(`Riga ${rowNum}: stato_pagamento="${statoRaw}" non valido — saltata`); stats.saltate++; continue; }

    const tipoAbb = normUp(r.tipo_abbonamento);
    const assicurazione = normUp(r['ASSICURAZIONE ANNUALE']) === 'SI';
    const doAbbonamento = (imp === 'SI') && tipoAbb;
    const ingressiResidui = parseInt(r.ingressi_residui, 10) || 0;

    if (apply) {
      const tx = db.transaction(() => {
        // 1. Trova o crea cliente
        let clienteId;
        const existing = db.prepare(
          "SELECT id FROM clienti WHERE UPPER(TRIM(nome)) = UPPER(?) AND UPPER(TRIM(cognome)) = UPPER(?)"
        ).get(nome, cognome);

        if (existing) {
          clienteId = existing.id;
          stats.esistenti++;
        } else {
          const info = db.prepare(
            "INSERT INTO clienti (nome, cognome, note, attivo) VALUES (?, ?, ?, 1)"
          ).run(nome, cognome, norm(r.note) || null);
          clienteId = info.lastInsertRowid;
          const uname = generaUsername(nome, cognome, db);
          if (uname) db.prepare('UPDATE clienti SET username = ? WHERE id = ?').run(uname, clienteId);
          stats.create++;
        }

        // 2. Abbonamento/pacchetto (solo se importare = SI)
        if (doAbbonamento) {
          const srv = getOrCreateServizio(db, tipoAbb);
          if (!srv) {
            stats.warnings.push(`Riga ${rowNum}: tipo_abbonamento="${tipoAbb}" non riconosciuto — pacchetto saltato`);
          } else if (srv.modalita === 'INGRESSI') {
            if (ingressiResidui > 0) {
              db.prepare(
                "INSERT INTO movimenti_ingressi (cliente_id, delta, motivo, creato_il) VALUES (?, ?, 'import', datetime('now'))"
              ).run(clienteId, ingressiResidui);
              stats.movimenti++;
            }
          } else if (srv.modalita === 'MENSILE') {
            const di = parseDate(r.data_inizio);
            const df = parseDate(r.data_fine);
            if (!di || !df) {
              stats.warnings.push(`Riga ${rowNum}: date mensile mancanti — abbonamento mensile saltato`);
            } else {
              db.prepare(
                "INSERT OR IGNORE INTO abbonamenti_mensili_cliente (cliente_id, tipo_abbonamento_id, data_inizio, data_fine, stato_pagamento) VALUES (?, ?, ?, ?, ?)"
              ).run(clienteId, srv.id, di, df, stato);
              stats.mensili++;
            }
          }
        }

        // 3. Assicurazione annuale
        if (assicurazione) {
          const statoAss = stato; // eredita dallo stato pagamento della riga
          try {
            db.prepare(
              "INSERT OR IGNORE INTO assicurazioni_annuali_cliente (cliente_id, anno, data_inizio, data_fine, stato_pagamento) VALUES (?, ?, ?, ?, ?)"
            ).run(clienteId, anno, `${anno}-01-01`, `${anno}-12-31`, statoAss);
            stats.assicurazioni++;
          } catch (_) {}
        }
      });
      try { tx(); } catch (e) { stats.errors.push(`Riga ${rowNum}: ${e.message}`); }

    } else {
      // Dry-run: solo conta e valida
      const srv = doAbbonamento ? SERVICES[tipoAbb] : null;
      if (doAbbonamento && !srv) {
        stats.warnings.push(`Riga ${rowNum}: tipo_abbonamento="${tipoAbb}" non in SERVICES — warning`);
      }
      const existing = db.prepare(
        "SELECT id FROM clienti WHERE UPPER(TRIM(nome)) = UPPER(?) AND UPPER(TRIM(cognome)) = UPPER(?)"
      ).get(nome, cognome);
      if (existing) stats.esistenti++; else stats.create++;
      if (doAbbonamento && srv) { if (srv.modalita === 'INGRESSI') stats.movimenti++; else stats.mensili++; }
      if (assicurazione) stats.assicurazioni++;
    }
  }

  return stats;
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n=== Import clienti — ${apply ? 'APPLY' : 'DRY-RUN'} ===`);
console.log(`File: ${filePath}\n`);
const s = runImport(filePath, apply);
console.log(`Righe lette:         ${s.lette}`);
console.log(`Saltate (NO/vuoto):  ${s.saltate}`);
console.log(`Clienti da creare:   ${s.create}`);
console.log(`Clienti già esist.:  ${s.esistenti}`);
console.log(`Movimenti ingressi:  ${s.movimenti}`);
console.log(`Mensili:             ${s.mensili}`);
console.log(`Assicurazioni:       ${s.assicurazioni}`);
if (s.warnings.length) { console.log(`\nWarning (${s.warnings.length}):`); s.warnings.forEach(w => console.log('  ⚠', w)); }
if (s.errors.length)   { console.log(`\nErrori (${s.errors.length}):`);   s.errors.forEach(e => console.log('  ✗', e)); }
if (!apply) console.log('\n[Dry-run completato. Usa --apply per importare davvero.]');
else console.log('\n[Import completato.]');

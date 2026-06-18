'use strict';

/**
 * Export PDF (pdfkit) e XLSX (exceljs).
 *
 * Riusa i service di dominio esistenti (clienti, schede, blocchi, sedute,
 * esercizi, pagamenti, movimenti, revisioni). Aggiunge solo 3 query di SOLA
 * LETTURA mancanti (presenze cliente, pagamenti globali, movimenti globali).
 *
 * I builder PDF/XLSX scrivono direttamente sullo stream di risposta HTTP:
 *   - PDF:  doc.pipe(res); ... doc.end();
 *   - XLSX: await workbook.xlsx.write(res); res.end();
 *
 * Nessuna modifica al dominio: niente nuovi movimenti, niente cambi di stato.
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const { getDb } = require('../db/connection');
const clientiService = require('./clienti.service');
const schedeService = require('./schede.service');
const blocchiService = require('./blocchi.service');
const seduteService = require('./sedute.service');
const eserciziService = require('./esercizi.service');
const pagamentiService = require('./pagamenti.service');
const movimentiService = require('./movimenti.service');

// =====================================================================
// Helpers formattazione
// =====================================================================
function eur(cent) {
  return (Number(cent || 0) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function dt(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x';
}

// =====================================================================
// Query read-only mancanti (no logica di dominio)
// =====================================================================
function listPresenzeCliente(clienteId, { limit = 500 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT id, cliente_id, data, entrata_il
    FROM presenze WHERE cliente_id = ?
    ORDER BY data DESC, id DESC
    LIMIT ?
  `).all(clienteId, limit);
}

function listPagamentiTutti({ limit = 5000 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT p.id, p.cliente_id, c.cognome AS cliente_cognome, c.nome AS cliente_nome,
           p.servizio_id, s.nome AS servizio_nome, s.ingressi AS servizio_ingressi,
           p.importo_cent, p.metodo, p.note, p.pagato_il
    FROM pagamenti p
    LEFT JOIN clienti c ON c.id = p.cliente_id
    LEFT JOIN servizi s ON s.id = p.servizio_id
    ORDER BY p.id DESC
    LIMIT ?
  `).all(limit);
}

function listMovimentiTutti({ limit = 5000 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT m.id, m.cliente_id, c.cognome AS cliente_cognome, c.nome AS cliente_nome,
           m.delta, m.motivo, m.riferimento_id, m.creato_il
    FROM movimenti_ingressi m
    LEFT JOIN clienti c ON c.id = m.cliente_id
    ORDER BY m.id DESC
    LIMIT ?
  `).all(limit);
}

// Feedback di una seduta (per PDF/XLSX seduta), senza vincolo di stato.
function feedbackSeduta(clienteId, sedutaId) {
  const db = getDb();
  const esercizi = db.prepare(`
    SELECT fe.esercizio_id, fe.carico_effettivo, fe.reps_effettive, fe.difficolta, fe.note
    FROM feedback_esercizi fe
    JOIN esercizi e ON e.id = fe.esercizio_id
    WHERE fe.cliente_id = ? AND e.seduta_id = ?
    ORDER BY e.ordine ASC, e.id ASC
  `).all(clienteId, sedutaId);
  const seduta = db.prepare(`
    SELECT commento, voto, inviato_il, revisionato_il, note_coach
    FROM feedback_seduta WHERE cliente_id = ? AND seduta_id = ?
  `).get(clienteId, sedutaId) || null;
  return { esercizi, seduta };
}

// =====================================================================
// PDF — helper di disegno
// =====================================================================
function pdfHeader(doc, titolo, sottotitolo) {
  doc.fontSize(18).fillColor('#111').text(titolo, { continued: false });
  if (sottotitolo) doc.moveDown(0.2).fontSize(10).fillColor('#666').text(sottotitolo);
  doc.moveDown(0.3).fontSize(8).fillColor('#999')
    .text(`Generato il ${dt(new Date().toISOString())}`);
  doc.moveTo(doc.x, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#ddd').stroke();
  doc.moveDown(0.8).fillColor('#111');
}

function pdfSezione(doc, titolo) {
  doc.moveDown(0.6).fontSize(13).fillColor('#111').text(titolo);
  doc.moveDown(0.2).fontSize(10).fillColor('#222');
}

function pdfRiga(doc, label, value) {
  doc.fontSize(10).fillColor('#555').text(`${label}: `, { continued: true })
    .fillColor('#111').text(String(value == null ? '—' : value));
}

// =====================================================================
// PDF: scheda cliente (blocchi -> sedute -> esercizi)
// =====================================================================
function streamSchedaPdf(res, clienteId) {
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) { const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e; }
  const riepilogo = schedeService.riepilogoCliente(clienteId);

  const filename = `scheda-${slug(cliente.cognome)}-${slug(cliente.nome)}-${nowStamp()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  pdfHeader(doc, `Scheda allenamento — ${cliente.cognome} ${cliente.nome}`, `Cliente #${cliente.id}`);
  pdfRiga(doc, 'Stato', cliente.attivo ? 'Attivo' : 'Non attivo');
  pdfRiga(doc, 'Badge', cliente.badge_label);
  pdfRiga(doc, 'Saldo ingressi', cliente.saldo_ingressi);
  if (riepilogo.prossima_seduta) {
    pdfRiga(doc, 'Seduta PROSSIMA',
      `#${riepilogo.prossima_seduta.id} (Sett. ${riepilogo.prossima_seduta.indice_settimana} · Seduta ${riepilogo.prossima_seduta.indice_seduta})`);
  } else {
    pdfRiga(doc, 'Seduta PROSSIMA', 'nessuna');
  }

  const blocchi = blocchiService.listBlocchiCliente(clienteId);
  if (!blocchi.length) {
    pdfSezione(doc, 'Blocchi');
    doc.fillColor('#666').text('Nessun blocco.');
  }
  for (const b of blocchi) {
    pdfSezione(doc, `Blocco: ${b.nome}${b.archiviato ? ' (archiviato)' : ''}`);
    doc.fontSize(9).fillColor('#666').text(
      `Dal ${b.data_inizio} · ${b.sedute_totali} sedute · ${b.sedute_completate} completate · ${b.sedute_saltate || 0} saltate`);
    doc.moveDown(0.3);

    const sedute = seduteService.listSeduteBlocco(b.id);
    for (const s of sedute) {
      doc.fontSize(10).fillColor('#111').text(
        `Sett. ${s.indice_settimana} · Seduta ${s.indice_seduta} — ${s.stato}${s.titolo ? ' — ' + s.titolo : ''}`);
      const esercizi = eserciziService.listEserciziSeduta(s.id);
      if (!esercizi.length) {
        doc.fontSize(9).fillColor('#999').text('   (nessun esercizio)');
      }
      for (const ex of esercizi) {
        const dettagli = [
          ex.serie != null ? `${ex.serie} serie` : null,
          ex.ripetizioni ? `x ${ex.ripetizioni}` : null,
          ex.carico ? `@ ${ex.carico}` : null,
          ex.recupero ? `rec ${ex.recupero}` : null,
        ].filter(Boolean).join(' ');
        doc.fontSize(9).fillColor('#333').text(`   • ${ex.nome}${dettagli ? ' — ' + dettagli : ''}${ex.note ? ' (' + ex.note + ')' : ''}`);
      }
      doc.moveDown(0.2);
    }
  }

  doc.end();
}

// =====================================================================
// PDF: seduta singola (con feedback cliente + note coach se presenti)
// =====================================================================
function streamSedutaPdf(res, sedutaId) {
  const seduta = seduteService.getSeduta(sedutaId);
  if (!seduta) { const e = new Error('Seduta non trovata'); e.code = 'not_found'; throw e; }
  const cliente = clientiService.getCliente(seduta.cliente_id);
  const esercizi = eserciziService.listEserciziSeduta(sedutaId);
  const fb = feedbackSeduta(seduta.cliente_id, sedutaId);
  const fbByEx = {};
  for (const f of fb.esercizi) fbByEx[f.esercizio_id] = f;

  const filename = `seduta-${sedutaId}-${nowStamp()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  pdfHeader(doc, `Seduta #${seduta.id}`,
    cliente ? `${cliente.cognome} ${cliente.nome} · ${seduta.blocco_nome}` : seduta.blocco_nome);
  pdfRiga(doc, 'Settimana / Seduta', `${seduta.indice_settimana} / ${seduta.indice_seduta}`);
  pdfRiga(doc, 'Stato', seduta.stato);
  if (seduta.titolo) pdfRiga(doc, 'Titolo', seduta.titolo);

  pdfSezione(doc, 'Esercizi');
  if (!esercizi.length) doc.fillColor('#666').text('Nessun esercizio.');
  for (const ex of esercizi) {
    const target = [
      ex.serie != null ? `${ex.serie} serie` : null,
      ex.ripetizioni ? `x ${ex.ripetizioni}` : null,
      ex.carico ? `@ ${ex.carico}` : null,
      ex.recupero ? `rec ${ex.recupero}` : null,
    ].filter(Boolean).join(' ');
    doc.fontSize(10).fillColor('#111').text(`• ${ex.nome}${target ? ' — ' + target : ''}`);
    if (ex.note) doc.fontSize(9).fillColor('#666').text(`   note: ${ex.note}`);
    const f = fbByEx[ex.id];
    if (f) {
      const ffb = [
        f.carico_effettivo != null ? `carico ${f.carico_effettivo}` : null,
        f.reps_effettive != null ? `reps ${f.reps_effettive}` : null,
        f.difficolta != null ? `difficoltà ${f.difficolta}/5` : null,
        f.note ? `note: ${f.note}` : null,
      ].filter(Boolean).join(' · ');
      if (ffb) doc.fontSize(9).fillColor('#0a6').text(`   feedback cliente: ${ffb}`);
    }
  }

  if (fb.seduta) {
    pdfSezione(doc, 'Feedback seduta (cliente)');
    pdfRiga(doc, 'Voto', fb.seduta.voto != null ? `${fb.seduta.voto}/5` : '—');
    pdfRiga(doc, 'Commento', fb.seduta.commento || '—');
    pdfRiga(doc, 'Inviato', dt(fb.seduta.inviato_il) || '—');
    if (fb.seduta.note_coach || fb.seduta.revisionato_il) {
      pdfSezione(doc, 'Revisione coach');
      pdfRiga(doc, 'Revisionato il', dt(fb.seduta.revisionato_il) || '—');
      pdfRiga(doc, 'Note coach', fb.seduta.note_coach || '—');
    }
  }

  doc.end();
}

// =====================================================================
// PDF: report cliente (anagrafica + saldo + pagamenti + movimenti + presenze + sedute)
// =====================================================================
function streamReportPdf(res, clienteId) {
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) { const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e; }
  const riepilogo = schedeService.riepilogoCliente(clienteId);
  const pagamenti = pagamentiService.listPagamentiCliente(clienteId, { limit: 200 });
  const movimenti = movimentiService.getMovimenti(clienteId, { limit: 200 });
  const presenze = listPresenzeCliente(clienteId);

  const filename = `report-${slug(cliente.cognome)}-${slug(cliente.nome)}-${nowStamp()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  pdfHeader(doc, `Report cliente — ${cliente.cognome} ${cliente.nome}`, `Cliente #${cliente.id}`);

  pdfSezione(doc, 'Anagrafica');
  pdfRiga(doc, 'Nome', `${cliente.cognome} ${cliente.nome}`);
  pdfRiga(doc, 'Email', cliente.email || '—');
  pdfRiga(doc, 'Telefono', cliente.telefono || '—');
  pdfRiga(doc, 'Stato', cliente.attivo ? 'Attivo' : 'Non attivo');
  pdfRiga(doc, 'Badge', cliente.badge_label);
  pdfRiga(doc, 'Saldo ingressi', cliente.saldo_ingressi);

  pdfSezione(doc, 'Stato scheda');
  pdfRiga(doc, 'Ha scheda', riepilogo.ha_scheda ? 'sì' : 'no');
  pdfRiga(doc, 'Blocchi', `${riepilogo.blocchi_count} (${riepilogo.blocchi_archiviati} archiviati)`);
  pdfRiga(doc, 'Sedute', `${riepilogo.sedute_totali} (${riepilogo.sedute_completate} completate)`);
  pdfRiga(doc, 'Seduta PROSSIMA', riepilogo.prossima_seduta
    ? `#${riepilogo.prossima_seduta.id}` : 'nessuna');

  pdfSezione(doc, 'Pagamenti');
  if (!pagamenti.length) doc.fillColor('#666').text('Nessun pagamento.');
  for (const p of pagamenti) {
    doc.fontSize(9).fillColor('#333').text(
      `${dt(p.pagato_il)} — ${p.servizio_nome || '—'} — ${eur(p.importo_cent)}${p.metodo ? ' (' + p.metodo + ')' : ''}`);
  }

  pdfSezione(doc, 'Movimenti ingressi');
  if (!movimenti.length) doc.fillColor('#666').text('Nessun movimento.');
  for (const m of movimenti) {
    doc.fontSize(9).fillColor('#333').text(
      `${dt(m.creato_il)} — ${m.delta > 0 ? '+' : ''}${m.delta} — ${m.motivo}`);
  }

  pdfSezione(doc, 'Presenze');
  if (!presenze.length) doc.fillColor('#666').text('Nessuna presenza.');
  for (const pr of presenze) {
    doc.fontSize(9).fillColor('#333').text(`${pr.data} — ${dt(pr.entrata_il)}`);
  }

  doc.end();
}

// =====================================================================
// XLSX — helpers
// =====================================================================
function setHeaderXlsx(res, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

function addSheet(wb, nome, columns, rows) {
  const ws = wb.addWorksheet(nome);
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return ws;
}

// =====================================================================
// XLSX: scheda cliente
// =====================================================================
async function streamSchedaXlsx(res, clienteId) {
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) { const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e; }

  const wb = new ExcelJS.Workbook();

  addSheet(wb, 'Cliente', [
    { header: 'Campo', key: 'k', width: 22 },
    { header: 'Valore', key: 'v', width: 40 },
  ], [
    { k: 'ID', v: cliente.id },
    { k: 'Cognome', v: cliente.cognome },
    { k: 'Nome', v: cliente.nome },
    { k: 'Email', v: cliente.email || '' },
    { k: 'Telefono', v: cliente.telefono || '' },
    { k: 'Stato', v: cliente.attivo ? 'Attivo' : 'Non attivo' },
    { k: 'Badge', v: cliente.badge_label },
    { k: 'Saldo ingressi', v: cliente.saldo_ingressi },
  ]);

  const blocchi = blocchiService.listBlocchiCliente(clienteId);
  const seduteRows = [];
  const eserciziRows = [];
  const feedbackRows = [];
  for (const b of blocchi) {
    const sedute = seduteService.listSeduteBlocco(b.id);
    for (const s of sedute) {
      seduteRows.push({
        blocco: b.nome, settimana: s.indice_settimana, seduta: s.indice_seduta,
        stato: s.stato, titolo: s.titolo || '', esercizi: s.esercizi_count || 0,
      });
      const esercizi = eserciziService.listEserciziSeduta(s.id);
      for (const ex of esercizi) {
        eserciziRows.push({
          blocco: b.nome, settimana: s.indice_settimana, seduta: s.indice_seduta,
          ordine: ex.ordine, nome: ex.nome, serie: ex.serie, ripetizioni: ex.ripetizioni || '',
          carico: ex.carico || '', recupero: ex.recupero || '', note: ex.note || '',
        });
      }
      const fb = feedbackSeduta(clienteId, s.id);
      for (const f of fb.esercizi) {
        feedbackRows.push({
          settimana: s.indice_settimana, seduta: s.indice_seduta, esercizio_id: f.esercizio_id,
          carico_effettivo: f.carico_effettivo, reps_effettive: f.reps_effettive,
          difficolta: f.difficolta, note: f.note || '',
        });
      }
    }
  }

  addSheet(wb, 'Sedute', [
    { header: 'Blocco', key: 'blocco', width: 22 },
    { header: 'Settimana', key: 'settimana', width: 10 },
    { header: 'Seduta', key: 'seduta', width: 8 },
    { header: 'Stato', key: 'stato', width: 14 },
    { header: 'Titolo', key: 'titolo', width: 26 },
    { header: 'N. esercizi', key: 'esercizi', width: 10 },
  ], seduteRows);

  addSheet(wb, 'Esercizi', [
    { header: 'Blocco', key: 'blocco', width: 20 },
    { header: 'Settimana', key: 'settimana', width: 10 },
    { header: 'Seduta', key: 'seduta', width: 8 },
    { header: 'Ordine', key: 'ordine', width: 8 },
    { header: 'Nome', key: 'nome', width: 26 },
    { header: 'Serie', key: 'serie', width: 8 },
    { header: 'Ripetizioni', key: 'ripetizioni', width: 12 },
    { header: 'Carico', key: 'carico', width: 12 },
    { header: 'Recupero', key: 'recupero', width: 12 },
    { header: 'Note', key: 'note', width: 30 },
  ], eserciziRows);

  if (feedbackRows.length) {
    addSheet(wb, 'Feedback', [
      { header: 'Settimana', key: 'settimana', width: 10 },
      { header: 'Seduta', key: 'seduta', width: 8 },
      { header: 'Esercizio ID', key: 'esercizio_id', width: 12 },
      { header: 'Carico eff.', key: 'carico_effettivo', width: 14 },
      { header: 'Reps eff.', key: 'reps_effettive', width: 14 },
      { header: 'Difficoltà', key: 'difficolta', width: 10 },
      { header: 'Note', key: 'note', width: 30 },
    ], feedbackRows);
  }

  setHeaderXlsx(res, `scheda-${slug(cliente.cognome)}-${slug(cliente.nome)}-${nowStamp()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// =====================================================================
// XLSX: report cliente
// =====================================================================
async function streamReportXlsx(res, clienteId) {
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) { const e = new Error('Cliente non trovato'); e.code = 'not_found'; throw e; }
  const riepilogo = schedeService.riepilogoCliente(clienteId);
  const pagamenti = pagamentiService.listPagamentiCliente(clienteId, { limit: 1000 });
  const movimenti = movimentiService.getMovimenti(clienteId, { limit: 1000 });
  const presenze = listPresenzeCliente(clienteId);

  const wb = new ExcelJS.Workbook();

  addSheet(wb, 'Anagrafica', [
    { header: 'Campo', key: 'k', width: 22 },
    { header: 'Valore', key: 'v', width: 40 },
  ], [
    { k: 'ID', v: cliente.id },
    { k: 'Cognome', v: cliente.cognome },
    { k: 'Nome', v: cliente.nome },
    { k: 'Email', v: cliente.email || '' },
    { k: 'Telefono', v: cliente.telefono || '' },
    { k: 'Stato', v: cliente.attivo ? 'Attivo' : 'Non attivo' },
    { k: 'Badge', v: cliente.badge_label },
    { k: 'Saldo ingressi', v: cliente.saldo_ingressi },
    { k: 'Ha scheda', v: riepilogo.ha_scheda ? 'sì' : 'no' },
    { k: 'Sedute totali', v: riepilogo.sedute_totali },
    { k: 'Sedute completate', v: riepilogo.sedute_completate },
  ]);

  addSheet(wb, 'Pagamenti', [
    { header: 'Data', key: 'data', width: 18 },
    { header: 'Servizio', key: 'servizio', width: 24 },
    { header: 'Ingressi', key: 'ingressi', width: 10 },
    { header: 'Importo (€)', key: 'importo', width: 14 },
    { header: 'Metodo', key: 'metodo', width: 14 },
    { header: 'Note', key: 'note', width: 30 },
  ], pagamenti.map((p) => ({
    data: dt(p.pagato_il), servizio: p.servizio_nome || '', ingressi: p.servizio_ingressi ?? '',
    importo: Number(p.importo_cent || 0) / 100, metodo: p.metodo || '', note: p.note || '',
  })));

  addSheet(wb, 'Movimenti', [
    { header: 'Data', key: 'data', width: 18 },
    { header: 'Delta', key: 'delta', width: 8 },
    { header: 'Motivo', key: 'motivo', width: 16 },
    { header: 'Riferimento', key: 'rif', width: 12 },
  ], movimenti.map((m) => ({
    data: dt(m.creato_il), delta: m.delta, motivo: m.motivo, rif: m.riferimento_id ?? '',
  })));

  addSheet(wb, 'Presenze', [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Entrata', key: 'entrata', width: 20 },
  ], presenze.map((pr) => ({ data: pr.data, entrata: dt(pr.entrata_il) })));

  const seduteRows = [];
  for (const b of blocchiService.listBlocchiCliente(clienteId)) {
    for (const s of seduteService.listSeduteBlocco(b.id)) {
      seduteRows.push({
        blocco: b.nome, settimana: s.indice_settimana, seduta: s.indice_seduta,
        stato: s.stato, titolo: s.titolo || '',
      });
    }
  }
  addSheet(wb, 'Sedute', [
    { header: 'Blocco', key: 'blocco', width: 22 },
    { header: 'Settimana', key: 'settimana', width: 10 },
    { header: 'Seduta', key: 'seduta', width: 8 },
    { header: 'Stato', key: 'stato', width: 14 },
    { header: 'Titolo', key: 'titolo', width: 26 },
  ], seduteRows);

  setHeaderXlsx(res, `report-${slug(cliente.cognome)}-${slug(cliente.nome)}-${nowStamp()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// =====================================================================
// XLSX globali
// =====================================================================
async function streamClientiXlsx(res) {
  const clienti = clientiService.listClienti({});
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Clienti', [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Cognome', key: 'cognome', width: 20 },
    { header: 'Nome', key: 'nome', width: 20 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Telefono', key: 'telefono', width: 16 },
    { header: 'Attivo', key: 'attivo', width: 8 },
    { header: 'Saldo', key: 'saldo', width: 8 },
    { header: 'Badge', key: 'badge', width: 18 },
  ], clienti.map((c) => ({
    id: c.id, cognome: c.cognome, nome: c.nome, email: c.email || '', telefono: c.telefono || '',
    attivo: c.attivo ? 'sì' : 'no', saldo: c.saldo_ingressi, badge: c.badge_label,
  })));
  setHeaderXlsx(res, `clienti-${nowStamp()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

async function streamPagamentiXlsx(res) {
  const pagamenti = listPagamentiTutti();
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Pagamenti', [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Data', key: 'data', width: 18 },
    { header: 'Servizio', key: 'servizio', width: 24 },
    { header: 'Ingressi', key: 'ingressi', width: 10 },
    { header: 'Importo (€)', key: 'importo', width: 14 },
    { header: 'Metodo', key: 'metodo', width: 14 },
  ], pagamenti.map((p) => ({
    id: p.id, cliente: `${p.cliente_cognome || ''} ${p.cliente_nome || ''}`.trim(),
    data: dt(p.pagato_il), servizio: p.servizio_nome || '', ingressi: p.servizio_ingressi ?? '',
    importo: Number(p.importo_cent || 0) / 100, metodo: p.metodo || '',
  })));
  setHeaderXlsx(res, `pagamenti-${nowStamp()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

async function streamMovimentiXlsx(res) {
  const movimenti = listMovimentiTutti();
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Movimenti', [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Data', key: 'data', width: 18 },
    { header: 'Delta', key: 'delta', width: 8 },
    { header: 'Motivo', key: 'motivo', width: 16 },
    { header: 'Riferimento', key: 'rif', width: 12 },
  ], movimenti.map((m) => ({
    id: m.id, cliente: `${m.cliente_cognome || ''} ${m.cliente_nome || ''}`.trim(),
    data: dt(m.creato_il), delta: m.delta, motivo: m.motivo, rif: m.riferimento_id ?? '',
  })));
  setHeaderXlsx(res, `movimenti-${nowStamp()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = {
  // PDF
  streamSchedaPdf,
  streamSedutaPdf,
  streamReportPdf,
  // XLSX cliente
  streamSchedaXlsx,
  streamReportXlsx,
  // XLSX globali
  streamClientiXlsx,
  streamPagamentiXlsx,
  streamMovimentiXlsx,
  // query read-only (riusabili/test)
  listPresenzeCliente,
  listPagamentiTutti,
  listMovimentiTutti,
};

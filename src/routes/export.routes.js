'use strict';

/**
 * Route export PDF/XLSX (admin). Montate sotto /admin (requireAdmin).
 *
 *  Pagina indice:
 *   GET /admin/export
 *  Stampa HTML:
 *   GET /admin/clienti/:id/scheda/stampa
 *  PDF:
 *   GET /admin/clienti/:id/scheda/pdf
 *   GET /admin/clienti/:id/report/pdf
 *   GET /admin/sedute/:id/pdf
 *  XLSX cliente:
 *   GET /admin/clienti/:id/scheda/xlsx
 *   GET /admin/clienti/:id/report/xlsx
 *  XLSX globali:
 *   GET /admin/export/clienti.xlsx
 *   GET /admin/export/pagamenti.xlsx
 *   GET /admin/export/movimenti.xlsx
 */

const express = require('express');
const exportService = require('../services/export.service');
const { adminLayout } = require('../views/adminLayout');
const clientiService   = require('../services/clienti.service');
const blocchiService   = require('../services/blocchi.service');
const seduteService    = require('../services/sedute.service');
const eserciziService  = require('../services/esercizi.service');

const router = express.Router();

// Wrapper: gestisce errori dei builder export in modo uniforme.
function handleExport(res, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      r.catch((e) => exportError(res, e));
    }
  } catch (e) {
    exportError(res, e);
  }
}

function exportError(res, e) {
  if (res.headersSent) { try { res.end(); } catch (_) {} return; }
  const status = e.code === 'not_found' ? 404 : 500;
  res.status(status).json({ ok: false, error: e.code || 'export_error', message: e.message });
}

// =====================================================================
// Pagina indice export
// =====================================================================
router.get('/export', (req, res) => {
  const body = `
    <header class="page-head">
      <p class="eyebrow">Sistema</p>
      <h1>Export e stampe</h1>
      <p class="muted">Genera file XLSX e PDF da scaricare. Per stampare, apri il PDF e usa la stampa del browser. Nessuna stampa automatica al check-in.</p>
    </header>

    <section class="card section-gap">
      <h2>Export globali (XLSX)</h2>
      <p class="muted small" style="margin-top:4px">Esporta l'intero archivio in formato Excel.</p>
      <div class="export-grid">
        <a class="export-tile" href="/admin/export/clienti.xlsx">
          <span class="export-fmt">XLSX</span>
          <span class="export-name">Clienti</span>
          <span class="muted small">Anagrafica e stato di tutti i clienti</span>
          <span class="export-cta">Scarica →</span>
        </a>
        <a class="export-tile" href="/admin/export/pagamenti.xlsx">
          <span class="export-fmt">XLSX</span>
          <span class="export-name">Pagamenti</span>
          <span class="muted small">Storico pagamenti registrati</span>
          <span class="export-cta">Scarica →</span>
        </a>
        <a class="export-tile" href="/admin/export/movimenti.xlsx">
          <span class="export-fmt">XLSX</span>
          <span class="export-name">Movimenti</span>
          <span class="muted small">Storico ingressi e uscite</span>
          <span class="export-cta">Scarica →</span>
        </a>
      </div>
    </section>

    <section class="card section-gap">
      <h2>Export per cliente</h2>
      <p class="muted small" style="margin-top:4px">Apri il <a href="/admin/clienti">dettaglio di un cliente</a> per i bottoni PDF/XLSX di scheda e report. Dall'editor o dalla revisione di una seduta è disponibile il PDF della seduta.</p>
    </section>
  `;
  res.send(adminLayout({
    title: 'Export',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Bacheca', href: '/admin' }, { label: 'Export' }],
  }));
});

// =====================================================================
// XLSX globali
// =====================================================================
router.get('/export/clienti.xlsx', (req, res) => {
  handleExport(res, () => exportService.streamClientiXlsx(res));
});
router.get('/export/pagamenti.xlsx', (req, res) => {
  handleExport(res, () => exportService.streamPagamentiXlsx(res));
});
router.get('/export/movimenti.xlsx', (req, res) => {
  handleExport(res, () => exportService.streamMovimentiXlsx(res));
});

// =====================================================================
// =====================================================================
// STAMPA HTML A4 landscape — solo seduta PROSSIMA compilabile
// =====================================================================
router.get('/clienti/:id(\\d+)/scheda/stampa', (req, res) => {
  const clienteId = parseInt(req.params.id, 10);
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) return res.status(404).send('Cliente non trovato');

  const dataPrint = new Date().toLocaleDateString('it-IT');

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Trova la seduta PROSSIMA usando il service già esistente
  const prossima = seduteService.getProssimaSedutaCliente(clienteId);

  const noSedutaHtml = `<p style="font-size:11px;color:#555;margin-top:20px">
    Nessuna seduta pronta da stampare.<br>
    <span style="color:#888">Prepara una seduta prima di stampare la scheda.</span>
  </p>`;

  let tableHtml = noSedutaHtml;
  let sessionLabel = '';

  if (prossima) {
    const esercizi = eserciziService.listEserciziSeduta(prossima.id);
    sessionLabel = `Settimana ${esc(prossima.indice_settimana)} &middot; Seduta ${esc(prossima.indice_seduta)}${prossima.titolo ? ' &mdash; ' + esc(prossima.titolo) : ''}`;
    tableHtml = `
    <section class="pw-session">
      <table class="pw-table">
        <thead>
          <tr>
            <th class="pw-col-num">#</th>
            <th class="pw-col-name">Esercizio</th>
            <th class="pw-col-sm">Serie</th>
            <th class="pw-col-sm">Reps</th>
            <th class="pw-col-sm">RPE</th>
            <th class="pw-col-md">Carico previsto</th>
            <th class="pw-col-sm">Rec.</th>
            <th class="pw-col-note">Note coach</th>
            <th class="pw-col-fill">Carico usato</th>
            <th class="pw-col-fill">Reps fatte</th>
            <th class="pw-col-sm">RIR/RPE</th>
            <th class="pw-col-note">Note cliente</th>
          </tr>
        </thead>
        <tbody>
          ${esercizi.length ? esercizi.map((ex, i) => `
          <tr>
            <td class="pw-col-num pw-center">${String(i + 1).padStart(2, '0')}</td>
            <td class="pw-col-name"><strong>${esc(ex.nome)}</strong></td>
            <td class="pw-col-sm pw-center">${esc(ex.serie ?? '')}</td>
            <td class="pw-col-sm pw-center">${esc(ex.ripetizioni ?? '')}</td>
            <td class="pw-col-sm pw-center">${esc(ex.rpe ?? '')}</td>
            <td class="pw-col-md">${esc(ex.carico ?? '')}</td>
            <td class="pw-col-sm pw-center">${esc(ex.recupero ?? '')}</td>
            <td class="pw-col-note pw-small">${esc(ex.note ?? '')}</td>
            <td class="pw-col-fill pw-writeable"></td>
            <td class="pw-col-fill pw-writeable"></td>
            <td class="pw-col-sm pw-writeable"></td>
            <td class="pw-col-note pw-writeable"></td>
          </tr>`).join('') : '<tr><td colspan="12" style="color:#999;text-align:center;padding:10px">Nessun esercizio.</td></tr>'}
        </tbody>
      </table>
    </section>`;
  }

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Scheda allenamento &mdash; ${esc(cliente.cognome)} ${esc(cliente.nome)}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #111; background: #fff; }
@media screen { body { max-width: 277mm; margin: 10mm auto; padding: 8mm; } }

/* header */
.pw-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #111; padding-bottom: 5px; margin-bottom: 10px; }
.pw-header-left h1 { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.pw-header-left p  { font-size: 9px; color: #555; margin-top: 2px; }
.pw-header-right   { font-size: 8.5px; color: #777; text-align: right; }

/* session */
.pw-session { margin-bottom: 10px; break-inside: avoid; }
.pw-session-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #333; margin-bottom: 4px; }

/* table */
.pw-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.pw-table th { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #555; border: 0.5px solid #bbb; padding: 3px 4px; background: #f5f5f5; }
.pw-table td { font-size: 9.5px; border: 0.5px solid #ccc; padding: 5px 4px; vertical-align: top; height: 22px; word-wrap: break-word; }
.pw-table tbody tr:nth-child(even) td { background: #fafafa; }
.pw-writeable { background: #fff !important; }

/* col widths */
.pw-col-num  { width: 24px; }
.pw-col-name { width: 120px; }
.pw-col-sm   { width: 38px; }
.pw-col-md   { width: 58px; }
.pw-col-fill { width: 55px; }
.pw-col-note { width: 90px; }
.pw-small    { font-size: 8.5px; color: #444; }
.pw-center   { text-align: center; }

/* print overrides */
@media print {
  body { margin: 0; padding: 0; }
  .pw-session { break-inside: avoid; page-break-inside: avoid; }
  .pw-table tr { break-inside: avoid; page-break-inside: avoid; }
}
</style>
</head>
<body>
<header class="pw-header">
  <div class="pw-header-left">
    <h1>Scheda allenamento</h1>
    <p>${esc(cliente.cognome)} ${esc(cliente.nome)}${sessionLabel ? ' &nbsp;&mdash;&nbsp; ' + sessionLabel : ''}</p>
  </div>
  <div class="pw-header-right">Data: ${dataPrint}</div>
</header>
${tableHtml}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// STAMPA HTML seduta singola — stesso stile A4 landscape
router.get('/sedute/:id(\\d+)/stampa', (req, res) => {
  const sedutaId = parseInt(req.params.id, 10);
  const seduta   = seduteService.getSeduta(sedutaId);
  if (!seduta) return res.status(404).send('Seduta non trovata');
  const cliente  = clientiService.getCliente(seduta.cliente_id);
  const esercizi = eserciziService.listEserciziSeduta(sedutaId);
  const dataPrint = new Date().toLocaleDateString('it-IT');

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  const nomeCliente = cliente ? `${esc(cliente.cognome)} ${esc(cliente.nome)}` : '';
  const sessionLabel = `Settimana ${esc(seduta.indice_settimana)} &middot; Seduta ${esc(seduta.indice_seduta)}${seduta.titolo ? ' &mdash; ' + esc(seduta.titolo) : ''}`;

  const tableHtml = `<section class="pw-session"><table class="pw-table"><thead><tr>
    <th class="pw-col-num">#</th><th class="pw-col-name">Esercizio</th>
    <th class="pw-col-sm">Serie</th><th class="pw-col-sm">Reps</th>
    <th class="pw-col-sm">RPE</th>
    <th class="pw-col-md">Carico previsto</th><th class="pw-col-sm">Rec.</th>
    <th class="pw-col-note">Note coach</th><th class="pw-col-fill">Carico usato</th>
    <th class="pw-col-fill">Reps fatte</th><th class="pw-col-sm">RIR/RPE</th>
    <th class="pw-col-note">Note cliente</th>
  </tr></thead><tbody>${esercizi.length ? esercizi.map((ex,i)=>`<tr>
    <td class="pw-col-num pw-center">${String(i+1).padStart(2,'0')}</td>
    <td class="pw-col-name"><strong>${esc(ex.nome)}</strong></td>
    <td class="pw-col-sm pw-center">${esc(ex.serie??'')}</td>
    <td class="pw-col-sm pw-center">${esc(ex.ripetizioni??'')}</td>
    <td class="pw-col-sm pw-center">${esc(ex.rpe??'')}</td>
    <td class="pw-col-md">${esc(ex.carico??'')}</td>
    <td class="pw-col-sm pw-center">${esc(ex.recupero??'')}</td>
    <td class="pw-col-note pw-small">${esc(ex.note??'')}</td>
    <td class="pw-col-fill pw-writeable"></td><td class="pw-col-fill pw-writeable"></td>
    <td class="pw-col-sm pw-writeable"></td><td class="pw-col-note pw-writeable"></td>
  </tr>`).join('') : '<tr><td colspan="12" style="text-align:center;color:#999;padding:10px">Nessun esercizio.</td></tr>'}
  </tbody></table></section>`;

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Scheda allenamento &mdash; ${nomeCliente}</title>
<style>@page{size:A4 landscape;margin:10mm}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;color:#111;background:#fff}
@media screen{body{max-width:277mm;margin:10mm auto;padding:8mm}}
.pw-header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #111;padding-bottom:5px;margin-bottom:10px}
.pw-header-left h1{font-size:13px;font-weight:700}.pw-header-left p{font-size:9px;color:#555;margin-top:2px}
.pw-header-right{font-size:8.5px;color:#777;text-align:right}
.pw-table{width:100%;border-collapse:collapse;table-layout:fixed}
.pw-table th{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;border:0.5px solid #bbb;padding:3px 4px;background:#f5f5f5}
.pw-table td{font-size:9.5px;border:0.5px solid #ccc;padding:5px 4px;vertical-align:top;height:22px;word-wrap:break-word}
.pw-table tbody tr:nth-child(even) td{background:#fafafa}.pw-writeable{background:#fff!important}
.pw-col-num{width:24px}.pw-col-name{width:120px}.pw-col-sm{width:38px}.pw-col-md{width:58px}.pw-col-fill{width:55px}.pw-col-note{width:90px}
.pw-small{font-size:8.5px;color:#444}.pw-center{text-align:center}
@media print{body{margin:0;padding:0}.pw-table tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>
<header class="pw-header">
  <div class="pw-header-left"><h1>Scheda allenamento</h1><p>${nomeCliente} &nbsp;&mdash;&nbsp; ${sessionLabel}</p></div>
  <div class="pw-header-right">Data: ${dataPrint}</div>
</header>
${tableHtml}
</body></html>`);
});



// =====================================================================
// PDF (route backend intatte)
// =====================================================================
router.get('/clienti/:id(\\d+)/scheda/pdf', (req, res) => {
  handleExport(res, () => exportService.streamSchedaPdf(res, parseInt(req.params.id, 10)));
});
router.get('/clienti/:id(\\d+)/report/pdf', (req, res) => {
  handleExport(res, () => exportService.streamReportPdf(res, parseInt(req.params.id, 10)));
});
router.get('/sedute/:id(\\d+)/pdf', (req, res) => {
  handleExport(res, () => exportService.streamSedutaPdf(res, parseInt(req.params.id, 10)));
});

// =====================================================================
// XLSX per cliente
// =====================================================================
router.get('/clienti/:id(\\d+)/scheda/xlsx', (req, res) => {
  handleExport(res, () => exportService.streamSchedaXlsx(res, parseInt(req.params.id, 10)));
});
router.get('/clienti/:id(\\d+)/report/xlsx', (req, res) => {
  handleExport(res, () => exportService.streamReportXlsx(res, parseInt(req.params.id, 10)));
});

module.exports = router;

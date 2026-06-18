'use strict';

/**
 * Route export PDF/XLSX (admin). Montate sotto /admin (requireAdmin).
 *
 *  Pagina indice:
 *   GET /admin/export
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
const { adminLayout, escapeHtml } = require('../views/adminLayout');

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
    <h1>Export / Stampe</h1>
    <p class="muted">Genera file PDF e XLSX. I file vengono scaricati dal browser; per stampare basta aprire il PDF e usare la stampa del browser. Nessuna stampa automatica al check-in.</p>

    <section class="card">
      <h2>Export globali (XLSX)</h2>
      <div class="filter-bar">
        <a class="btn btn-primary" href="/admin/export/clienti.xlsx">Clienti XLSX</a>
        <a class="btn btn-primary" href="/admin/export/pagamenti.xlsx">Pagamenti XLSX</a>
        <a class="btn btn-primary" href="/admin/export/movimenti.xlsx">Movimenti XLSX</a>
      </div>
    </section>

    <section class="card">
      <h2>Export per cliente</h2>
      <p class="muted small">Apri il <a href="/admin/clienti">dettaglio di un cliente</a> per i bottoni PDF/XLSX di scheda e report. Dall'editor o dalla revisione di una seduta è disponibile il PDF della seduta.</p>
    </section>

    <section class="card">
      <h2>Stampa manuale</h2>
      <p class="muted small">La stampa è sempre manuale: scarica o apri il PDF e usa la funzione di stampa del browser (Ctrl+P). Il sistema non stampa nulla automaticamente.</p>
    </section>
  `;
  res.send(adminLayout({
    title: 'Export',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Export' }],
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
// PDF
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

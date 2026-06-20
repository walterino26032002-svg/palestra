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
const { adminLayout } = require('../views/adminLayout');

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

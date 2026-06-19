'use strict';

/**
 * Route admin per backup/restore locale. Montate sotto /admin (requireAdmin).
 *
 *   GET  /admin/backup                      - pagina con lista backup + log + azioni
 *   POST /admin/backup/crea                 - crea backup manuale
 *   GET  /admin/backup/download/:filename   - download di un backup (filename validato)
 *   POST /admin/backup/restore              - restore (con backup d'emergenza pre_restore)
 *   GET  /admin/api/backup                  - JSON: lista backup + log
 *
 * Tutto passa per backup.service che valida i filename (anti path-traversal).
 */

const fs = require('fs');
const express = require('express');

const backupService = require('../services/backup.service');
const { adminLayout } = require('../views/adminLayout');

const router = express.Router();

const { escapeHtml, wantsHtml, alertBlock, backWithMsg, fmtDateTimeFull } = require('../utils/helpers');

function fmtSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// -------------------------------------------------------------
// GET /admin/backup — pagina lista backup + log + azioni
// -------------------------------------------------------------
router.get('/backup', (req, res) => {
  const backups = backupService.listBackup();
  let log = [];
  try { log = backupService.listBackupLog({ limit: 30 }); } catch (_) {}

  if (!wantsHtml(req)) {
    return res.json({ ok: true, backups, log });
  }

  const backupRows = backups.map((b) => `
    <tr>
      <td><code>${escapeHtml(b.filename)}</code></td>
      <td class="num">${fmtSize(b.size)}</td>
      <td class="hide-mobile">${escapeHtml(fmtDateTimeFull(b.modificato_il))}</td>
      <td class="col-right nowrap">
        <a class="btn small" href="/admin/backup/download/${encodeURIComponent(b.filename)}">Scarica</a>
        <form method="POST" action="/admin/backup/restore" style="display:inline"
              onsubmit="return confirm('Ripristinare questo backup? Verrà prima creato un backup di emergenza dello stato attuale.');">
          <input type="hidden" name="filename" value="${escapeHtml(b.filename)}">
          <button type="submit" class="btn btn-danger small">Ripristina</button>
        </form>
      </td>
    </tr>`).join('') || `<tr><td colspan="4" class="muted">Nessun backup presente.</td></tr>`;

  const backupCards = backups.map((b) => `
    <div class="row-card">
      <div class="rc-top">
        <span class="t"><code>${escapeHtml(b.filename)}</code></span>
        <span class="muted small">${fmtSize(b.size)}</span>
      </div>
      <div class="rc-meta"><span>${escapeHtml(fmtDateTimeFull(b.modificato_il))}</span></div>
      <div class="rc-act">
        <a class="btn small" href="/admin/backup/download/${encodeURIComponent(b.filename)}">Scarica</a>
        <form method="POST" action="/admin/backup/restore" style="display:inline"
              onsubmit="return confirm('Ripristinare questo backup? Verrà prima creato un backup di emergenza dello stato attuale.');">
          <input type="hidden" name="filename" value="${escapeHtml(b.filename)}">
          <button type="submit" class="btn btn-danger small">Ripristina</button>
        </form>
      </div>
    </div>`).join('') || `<div class="empty-state"><h3>Nessun backup</h3><p class="muted">Usa "Crea backup ora" per generarne uno.</p></div>`;

  const logRows = log.map((l) => `
    <tr>
      <td class="muted num">#${l.id}</td>
      <td>${escapeHtml(fmtDateTimeFull(l.creato_il))}</td>
      <td>${escapeHtml(l.tipo)}</td>
      <td>${l.esito === 'ok' ? '<span class="badge badge-ok">OK</span>' : '<span class="badge badge-danger">Errore</span>'}</td>
      <td class="hide-mobile"><code>${escapeHtml(l.percorso)}</code></td>
      <td class="muted small">${escapeHtml(l.messaggio || '')}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="muted">Nessun evento.</td></tr>`;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Sistema</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>Backup</h1>
        <form method="POST" action="/admin/backup/crea" style="display:inline">
          <button type="submit" class="btn btn-primary">Crea backup ora</button>
        </form>
      </div>
      <p class="muted">Backup locali del database. Il ripristino crea sempre prima un backup di emergenza e verifica l'integrità.</p>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <div class="alert alert-warn">
      <strong>Conserva i backup fuori dal dispositivo.</strong> I file sono salvati in <code>backups/</code>.
      Copiali periodicamente su un disco esterno o USB: la sola SD card del Raspberry non è sufficiente.
    </div>

    <h2 class="section-gap">Backup disponibili</h2>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>File</th><th>Dimensione</th><th>Data</th><th class="col-right">Azioni</th></tr></thead>
        <tbody>${backupRows}</tbody>
      </table>
    </div>
    <div class="card-list">${backupCards}</div>

    <h2 class="section-gap">Log backup</h2>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>ID</th><th>Quando</th><th>Tipo</th><th>Esito</th><th>File</th><th>Note</th></tr></thead>
        <tbody>${logRows}</tbody>
      </table>
    </div>
  `;
  res.send(adminLayout({
    title: 'Backup',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Backup' }],
  }));
});

// -------------------------------------------------------------
// POST /admin/backup/crea — crea backup manuale
// -------------------------------------------------------------
router.post('/backup/crea', async (req, res) => {
  try {
    const r = await backupService.creaBackup('manual');
    if (!wantsHtml(req)) return res.json({ ok: true, backup: r });
    return backWithMsg(res, '/admin/backup', `Backup creato: ${r.filename}`, 'ok');
  } catch (e) {
    console.error(e);
    if (!wantsHtml(req)) return res.status(500).json({ ok: false, error: e.code || 'backup_failed', message: e.message });
    return backWithMsg(res, '/admin/backup', 'Errore creazione backup.', 'err');
  }
});

// -------------------------------------------------------------
// GET /admin/backup/download/:filename — download backup validato
// -------------------------------------------------------------
router.get('/backup/download/:filename', (req, res) => {
  let full;
  try {
    full = backupService.safeBackupPath(req.params.filename);
  } catch (e) {
    if (!wantsHtml(req)) return res.status(400).json({ ok: false, error: 'invalid_filename', message: e.message });
    return backWithMsg(res, '/admin/backup', 'Filename non valido.', 'err');
  }
  if (!fs.existsSync(full)) {
    if (!wantsHtml(req)) return res.status(404).json({ ok: false, error: 'not_found' });
    return backWithMsg(res, '/admin/backup', 'Backup inesistente.', 'err');
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  fs.createReadStream(full).pipe(res);
});

// -------------------------------------------------------------
// POST /admin/backup/restore — restore con backup d'emergenza
// -------------------------------------------------------------
router.post('/backup/restore', express.urlencoded({ extended: false }), express.json(), async (req, res) => {
  const filename = (req.body && (req.body.filename || req.body.file)) || '';
  try {
    const r = await backupService.restoreBackup(filename);
    if (!wantsHtml(req)) return res.json({ ok: true, ...r });
    return backWithMsg(res, '/admin/backup',
      `Restore completato (${r.restored}). Backup emergenza: ${r.pre_restore}.`, 'ok');
  } catch (e) {
    const known = ['invalid_filename', 'not_found', 'restore_failed', 'restore_integrity'];
    if (known.includes(e.code)) {
      if (!wantsHtml(req)) return res.status(400).json({ ok: false, error: e.code, message: e.message });
      return backWithMsg(res, '/admin/backup', e.message, 'err');
    }
    console.error(e);
    if (!wantsHtml(req)) return res.status(500).json({ ok: false, error: 'server_error', message: e.message });
    return backWithMsg(res, '/admin/backup', 'Errore restore.', 'err');
  }
});

// -------------------------------------------------------------
// GET /admin/api/backup — JSON lista + log
// -------------------------------------------------------------
router.get('/api/backup', (req, res) => {
  let log = [];
  try { log = backupService.listBackupLog({ limit: 100 }); } catch (_) {}
  res.json({ ok: true, backups: backupService.listBackup(), log });
});

module.exports = router;

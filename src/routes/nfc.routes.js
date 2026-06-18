'use strict';

/**
 * Route NFC (admin) + bacheca.
 * - /admin/nfc, /admin/nfc/nuova, /admin/nfc, /admin/nfc/:id/toggle-attiva, /admin/nfc/simulatore
 * - /admin/bacheca, /admin/bacheca/:id/letto, /admin/bacheca/segna-tutti-letti
 * - POST /api/nfc/check            (endpoint pubblico per lettore NFC o simulatore)
 */

const express = require('express');
const path = require('path');

const nfcService = require('../services/nfc.service');
const bachecaService = require('../services/bacheca.service');
const clientiService = require('../services/clienti.service');
const checkinService = require('../services/checkin.service');
const { adminLayout } = require('../views/adminLayout');

const router = express.Router();
const apiRouter = express.Router();

// Helpers
function wantsHtml(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 19);
}

function fmtDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function alertBlock(kind, msg) {
  if (!msg) return '';
  return `<div class="alert alert-${escapeHtml(kind)}">${escapeHtml(msg)}</div>`;
}

function backWithMsg(res, base, msg, kind = 'ok') {
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(303, `${base}${sep}${kind}=${encodeURIComponent(msg)}`);
}

// =====================================================================
// POST /api/nfc/check  (pubblico: usabile da lettore o da simulatore)
// =====================================================================
// Accetta { uid } oppure { codice }.
apiRouter.post('/check', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  const body = req.body || {};
  const uid = body.uid || body.codice || body.code || null;
  const sorgente = body.sorgente || 'endpoint';
  const result = checkinService.elaboraCheckin({ uid, sorgente });
  res.status(result.ok ? 200 : 400).json(result);
});

// GET /api/nfc/check — solo diagnostica
apiRouter.get('/check', (req, res) => {
  res.json({ ok: true, info: 'POST { uid | codice } per simulare una lettura NFC.' });
});

// =====================================================================
// /admin/nfc — lista tessere
// =====================================================================
router.get('/nfc', (req, res) => {
  const q = req.query.q || '';
  const tessere = nfcService.listTessere({ q });
  const rows = tessere.map((t) => {
    const cliente = t.cliente_id
      ? `<a href="/admin/clienti/${t.cliente_id}">${escapeHtml(t.cliente_cognome)} ${escapeHtml(t.cliente_nome)}</a>${t.cliente_attivo ? '' : ' <span class="badge badge-danger">non attivo</span>'}`
      : '<span class="muted">—</span>';
    return `<tr>
      <td>${t.id}</td>
      <td><code>${escapeHtml(t.tessera_uid)}</code></td>
      <td>${cliente}</td>
      <td>${t.attiva ? '<span class="badge badge-ok">attiva</span>' : '<span class="badge badge-danger">disattivata</span>'}</td>
      <td>${fmtDate(t.assegnata_il)}</td>
      <td>
        <form method="POST" action="/admin/nfc/${t.id}/toggle-attiva" style="display:inline">
          <button type="submit" class="btn btn-ghost">${t.attiva ? 'Disattiva' : 'Riattiva'}</button>
        </form>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">Nessuna tessera.</td></tr>`;

  const body = `
    <div class="row-between">
      <h1>Tessere NFC</h1>
      <div>
        <a class="btn" href="/admin/nfc/simulatore">Simulatore</a>
        <a class="btn btn-primary" href="/admin/nfc/nuova">+ Nuova tessera</a>
      </div>
    </div>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <form method="GET" action="/admin/nfc" class="filter-bar">
      <input type="text" name="q" placeholder="Cerca per UID, cognome, nome" value="${escapeHtml(q)}">
      <button type="submit" class="btn">Cerca</button>
    </form>
    <table class="table">
      <thead><tr><th>ID</th><th>UID</th><th>Cliente</th><th>Stato</th><th>Assegnata</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  res.send(adminLayout({
    title: 'Tessere NFC',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'NFC' }],
  }));
});

// GET /admin/nfc/nuova
router.get('/nfc/nuova', (req, res) => {
  const clienti = clientiService.listClienti();
  const options = clienti.map((c) =>
    `<option value="${c.id}">${escapeHtml(c.cognome)} ${escapeHtml(c.nome)} — ${escapeHtml(c.badge_label)} (saldo ${c.saldo_ingressi})</option>`
  ).join('');

  const body = `
    <h1>Nuova tessera NFC</h1>
    ${alertBlock('error', req.query.err)}
    <form method="POST" action="/admin/nfc" class="card form-stacked">
      <label>UID tessera *
        <input name="tessera_uid" required placeholder="es. AA:BB:CC:DD">
      </label>
      <label>Cliente *
        <select name="cliente_id" required>
          <option value="">— seleziona —</option>
          ${options}
        </select>
      </label>
      <div>
        <button type="submit" class="btn btn-primary">Assegna tessera</button>
        <a class="btn" href="/admin/nfc">Annulla</a>
      </div>
    </form>
  `;
  res.send(adminLayout({
    title: 'Nuova tessera NFC',
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'NFC', href: '/admin/nfc' },
      { label: 'Nuova' },
    ],
  }));
});

// POST /admin/nfc
router.post('/nfc', express.urlencoded({ extended: false }), (req, res) => {
  const { tessera_uid, cliente_id } = req.body || {};
  try {
    nfcService.creaOAssegna({
      tesseraUid: tessera_uid,
      clienteId: parseInt(cliente_id, 10),
    });
    return backWithMsg(res, '/admin/nfc', 'Tessera assegnata.', 'ok');
  } catch (e) {
    if (e.code === 'validation') return backWithMsg(res, '/admin/nfc/nuova', e.message, 'err');
    if (e.code === 'not_found') return backWithMsg(res, '/admin/nfc/nuova', e.message, 'err');
    console.error(e);
    return backWithMsg(res, '/admin/nfc/nuova', 'Errore assegnazione tessera.', 'err');
  }
});

// POST /admin/nfc/:id/toggle-attiva
router.post('/nfc/:id(\\d+)/toggle-attiva', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const nuovo = nfcService.toggleAttiva(id);
    return backWithMsg(res, '/admin/nfc',
      nuovo ? 'Tessera attivata.' : 'Tessera disattivata.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/nfc', 'Errore.', 'err');
  }
});

// GET /admin/nfc/simulatore
router.get('/nfc/simulatore', (req, res) => {
  const tessere = nfcService.listTessere();
  const tessereOptions = tessere.map((t) =>
    `<option value="${escapeHtml(t.tessera_uid)}">${escapeHtml(t.tessera_uid)} — ${escapeHtml(t.cliente_cognome || '?')} ${escapeHtml(t.cliente_nome || '')}</option>`
  ).join('');

  const body = `
    <h1>Simulatore NFC</h1>
    <p class="muted">Inserisci un UID o seleziona una tessera esistente per simulare una lettura come se provenisse dal lettore.</p>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <div class="card form-stacked">
      <label>UID tessera
        <input id="uid" name="uid" placeholder="es. AA:BB:CC:DD" autofocus>
      </label>
      <label>Oppure seleziona una tessera esistente
        <select id="uidSelect">
          <option value="">—</option>
          ${tessereOptions}
        </select>
      </label>
      <label>Sorgente (per logging)
        <input id="sorgente" value="simulatore">
      </label>
      <div>
        <button type="button" class="btn btn-primary" id="btnCheck">Simula check-in</button>
        <a class="btn" href="/admin/bacheca">Vai alla bacheca</a>
      </div>
    </div>

    <h2 style="margin-top:20px">Risultato</h2>
    <pre class="card" id="risultato" style="white-space:pre-wrap;min-height:60px">— nessuna lettura —</pre>

    <script>
      (function () {
        const sel = document.getElementById('uidSelect');
        const inp = document.getElementById('uid');
        if (sel) sel.addEventListener('change', () => { if (sel.value) inp.value = sel.value; });
        document.getElementById('btnCheck').addEventListener('click', async () => {
          const out = document.getElementById('risultato');
          const uid = inp.value.trim();
          if (!uid) { out.textContent = 'Inserisci un UID.'; return; }
          out.textContent = 'Invio...';
          try {
            const r = await fetch('/api/nfc/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ uid, sorgente: document.getElementById('sorgente').value || 'simulatore' }),
            });
            const j = await r.json();
            out.textContent = 'HTTP ' + r.status + String.fromCharCode(10) + JSON.stringify(j, null, 2);
          } catch (e) {
            out.textContent = 'Errore: ' + e.message;
          }
        });
      })();
    </script>
  `;
  res.send(adminLayout({
    title: 'Simulatore NFC',
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'NFC', href: '/admin/nfc' },
      { label: 'Simulatore' },
    ],
  }));
});

// =====================================================================
// /admin/bacheca
// =====================================================================
router.get('/bacheca', (req, res) => {
  const soloNonLetti = req.query.non_letti === '1';
  const avvisi = bachecaService.listAvvisi({ soloNonLetti, limit: 200 });
  const totNonLetti = bachecaService.countNonLetti();

  const tipoBadge = (tipo) => {
    const map = {
      tessera_sconosciuta: 'danger',
      tessera_disattivata: 'warn',
      cliente_non_attivo:  'danger',
      seduta_mancante:     'warn',
    };
    const t = map[tipo] || 'muted';
    const label = (tipo || '').replace(/_/g, ' ');
    return `<span class="badge badge-${t}">${escapeHtml(label)}</span>`;
  };

  const rows = avvisi.map((a) => `
    <tr>
      <td>${a.id}</td>
      <td>${fmtDateTime(a.creato_il)}</td>
      <td>${tipoBadge(a.tipo)}</td>
      <td>${a.cliente_id ? `<a href="/admin/clienti/${a.cliente_id}">${escapeHtml(a.cliente_cognome || '')} ${escapeHtml(a.cliente_nome || '')}</a>` : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(a.messaggio)}</td>
      <td>${a.letto ? '<span class="badge badge-muted">letto</span>' : '<span class="badge badge-warn">non letto</span>'}</td>
      <td>
        ${a.letto ? '' : `<form method="POST" action="/admin/bacheca/${a.id}/letto" style="display:inline">
            <button type="submit" class="btn btn-ghost">Segna letto</button>
          </form>`}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="muted">Nessun avviso.</td></tr>`;

  const body = `
    <div class="row-between">
      <h1>Bacheca <span class="muted small">(${totNonLetti} non letti)</span></h1>
      <form method="POST" action="/admin/bacheca/segna-tutti-letti" style="display:inline">
        <button type="submit" class="btn">Segna tutti come letti</button>
      </form>
    </div>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <div class="filter-bar">
      <a class="btn ${soloNonLetti ? 'btn-primary' : ''}" href="?non_letti=1">Solo non letti</a>
      <a class="btn ${!soloNonLetti ? 'btn-primary' : ''}" href="?non_letti=0">Tutti</a>
    </div>
    <table class="table">
      <thead><tr><th>ID</th><th>Quando</th><th>Tipo</th><th>Cliente</th><th>Messaggio</th><th>Stato</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  res.send(adminLayout({
    title: 'Bacheca',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Bacheca' }],
  }));
});

// POST /admin/bacheca/:id/letto
router.post('/bacheca/:id(\\d+)/letto', (req, res) => {
  const id = parseInt(req.params.id, 10);
  bachecaService.segnaLetto(id);
  return res.redirect(303, '/admin/bacheca');
});

// POST /admin/bacheca/segna-tutti-letti
router.post('/bacheca/segna-tutti-letti', (req, res) => {
  const n = bachecaService.segnaTuttiLetti();
  return backWithMsg(res, '/admin/bacheca', `${n} avvisi segnati come letti.`, 'ok');
});

// =====================================================================
// API JSON di supporto
// =====================================================================
router.get('/api/nfc/tessere', (req, res) => {
  res.json({ ok: true, tessere: nfcService.listTessere({ q: req.query.q || '' }) });
});
router.get('/api/bacheca', (req, res) => {
  res.json({ ok: true, avvisi: bachecaService.listAvvisi({ soloNonLetti: req.query.non_letti === '1' }) });
});
router.get('/api/nfc/eventi', (req, res) => {
  res.json({ ok: true, eventi: nfcService.listEventi({ limit: 50 }) });
});

module.exports = router;
module.exports.apiRouter = apiRouter;

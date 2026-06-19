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

const { escapeHtml, alertBlock, backWithMsg, fmtDateShort, fmtDateTimeFull } = require('../utils/helpers');

// Contatori per i badge della navbar (revisioni da fare + avvisi non letti)
function buildCounts() {
  const counts = {};
  try {
    const r = require('../services/revisioni.service').countDaRevisionare();
    if (r > 0) counts['/admin/revisioni'] = r;
  } catch (_) {}
  try {
    const n = bachecaService.countNonLetti();
    if (n > 0) counts['/admin/bacheca'] = n;
  } catch (_) {}
  return counts;
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
  const totali = tessere.length;
  const attiveCount = tessere.filter((t) => t.attiva).length;
  const assegnateCount = tessere.filter((t) => t.cliente_id).length;

  const statoBadgeT = (t) => t.attiva
    ? '<span class="badge badge-ok">Attiva</span>'
    : '<span class="badge badge-muted">Disattivata</span>';

  const rows = tessere.map((t) => {
    const cliente = t.cliente_id
      ? `<a href="/admin/clienti/${t.cliente_id}">${escapeHtml(t.cliente_cognome)} ${escapeHtml(t.cliente_nome)}</a>${t.cliente_attivo ? '' : ' <span class="badge badge-danger">non attivo</span>'}`
      : '<span class="muted">—</span>';
    return `<tr>
      <td class="muted num">#${t.id}</td>
      <td><code>${escapeHtml(t.tessera_uid)}</code></td>
      <td>${cliente}</td>
      <td>${statoBadgeT(t)}</td>
      <td class="hide-mobile">${fmtDateShort(t.assegnata_il)}</td>
      <td class="col-right">
        <form method="POST" action="/admin/nfc/${t.id}/toggle-attiva" style="display:inline">
          <button type="submit" class="btn btn-ghost small">${t.attiva ? 'Disattiva' : 'Riattiva'}</button>
        </form>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">Nessuna tessera.</td></tr>`;

  const cards = tessere.map((t) => {
    const cliente = t.cliente_id
      ? `<a href="/admin/clienti/${t.cliente_id}">${escapeHtml(t.cliente_cognome)} ${escapeHtml(t.cliente_nome)}</a>`
      : '<span class="muted">non assegnata</span>';
    return `<div class="row-card">
      <div class="rc-top">
        <span class="t"><code>${escapeHtml(t.tessera_uid)}</code></span>
        ${statoBadgeT(t)}
      </div>
      <div class="rc-meta">
        <span>Cliente: ${cliente}</span>
        <span>Assegnata: <b>${fmtDateShort(t.assegnata_il) || '—'}</b></span>
      </div>
      <div class="rc-act">
        <form method="POST" action="/admin/nfc/${t.id}/toggle-attiva" style="display:inline">
          <button type="submit" class="btn btn-ghost small">${t.attiva ? 'Disattiva' : 'Riattiva'}</button>
        </form>
      </div>
    </div>`;
  }).join('') || `<div class="empty-state"><h3>Nessuna tessera</h3><p class="muted">Assegna la prima tessera con "Nuova tessera".</p></div>`;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Operatività</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>Tessere NFC</h1>
        <div class="toolbar">
          <a class="btn" href="/admin/nfc/simulatore">Simulatore</a>
          <a class="btn btn-primary" href="/admin/nfc/nuova">+ Nuova tessera</a>
        </div>
      </div>
      <p class="muted">Associazione tessera ↔ cliente. Una tessera disattivata non sblocca il check-in.</p>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="svc-stats">
      <div class="svc-stat"><p class="eyebrow">Attive</p><div class="v">${attiveCount}</div></div>
      <div class="svc-stat"><p class="eyebrow">Totali</p><div class="v">${totali}</div></div>
      <div class="svc-stat"><p class="eyebrow">Assegnate</p><div class="v">${assegnateCount}</div></div>
    </section>

    <form method="GET" action="/admin/nfc" class="filter-bar">
      <input type="text" name="q" placeholder="Cerca per UID, cognome, nome" value="${escapeHtml(q)}">
      <button type="submit" class="btn">Cerca</button>
    </form>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>ID</th><th>UID</th><th>Cliente</th><th>Stato</th><th>Assegnata</th><th class="col-right">Azioni</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>
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
    <header class="page-head">
      <p class="eyebrow">Operatività</p>
      <h1>Simulatore NFC</h1>
      <p class="muted">Simula una lettura come se provenisse dal lettore: inserisci un UID o scegli una tessera esistente.</p>
    </header>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="grid grid-2">
      <div class="card form-stacked">
        <h2>Lettura</h2>
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
        <div class="toolbar">
          <button type="button" class="btn btn-primary" id="btnCheck">Simula check-in</button>
          <a class="btn" href="/admin/bacheca">Vai alla bacheca</a>
        </div>
      </div>

      <div class="card">
        <h2>Esito check-in</h2>
        <div id="esito" class="sim-result sim-empty">
          <p class="muted">Nessuna lettura ancora effettuata.</p>
        </div>
        <details style="margin-top:12px">
          <summary class="muted small">Dettaglio tecnico (JSON)</summary>
          <pre id="risultato" style="white-space:pre-wrap;margin-top:8px">—</pre>
        </details>
      </div>
    </section>

    <script>
      (function () {
        const sel = document.getElementById('uidSelect');
        const inp = document.getElementById('uid');
        const esito = document.getElementById('esito');
        const raw = document.getElementById('risultato');
        if (sel) sel.addEventListener('change', () => { if (sel.value) inp.value = sel.value; });

        function esc(s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        // Mappa i codici motivo tecnici in testi leggibili.
        const MOTIVO_LABEL = {
          ok: 'Primo check-in del giorno',
          ok_senza_seduta: 'Check-in registrato, nessuna seduta impostata',
          gia_presente: 'Tessera già passata oggi',
          tessera_sconosciuta: 'Tessera non riconosciuta',
          tessera_disattivata: 'Tessera disattivata',
          cliente_non_attivo: 'Cliente non attivo',
          richiesta_non_valida: 'Richiesta non valida',
        };

        function render(j) {
          const ok = !!j.ok;
          const gia = j.already_checked_today === true || j.motivo === 'gia_presente';
          const sbloccato = j.allenamento_sbloccato === true;

          // Stato complessivo della card
          esito.className = 'sim-result ' + (ok ? (gia ? 'sim-warn' : 'sim-ok') : 'sim-err');

          // 1) Passaggio tessera
          var tesseraBadge, tesseraTesto;
          if (!ok) {
            tesseraBadge = '<span class="badge badge-danger">Non valido</span>';
            tesseraTesto = 'Il passaggio non è stato accettato.';
          } else if (gia) {
            tesseraBadge = '<span class="badge badge-warn">Già presente oggi</span>';
            tesseraTesto = 'Check-in già registrato oggi: nessun nuovo ingresso scalato.';
          } else {
            tesseraBadge = '<span class="badge badge-ok">Registrato</span>';
            tesseraTesto = 'Check-in registrato: ingresso del giorno conteggiato.';
          }

          // 2) Allenamento (indipendente dal passaggio tessera)
          var allBadge, allTesto;
          if (sbloccato) {
            allBadge = '<span class="badge badge-ok">Allenamento sbloccato</span>';
            allTesto = 'Il cliente può iniziare la seduta.';
          } else if (j.prossima_seduta_id == null) {
            allBadge = '<span class="badge badge-muted">Nessuna seduta disponibile</span>';
            allTesto = gia
              ? 'Nessuna nuova seduta sbloccata. Nessuna seduta PROSSIMA impostata.'
              : 'Allenamento non disponibile: nessuna seduta PROSSIMA impostata.';
          } else {
            allBadge = '<span class="badge badge-muted">Allenamento non disponibile</span>';
            allTesto = gia
              ? 'Nessuna nuova seduta sbloccata.'
              : 'Seduta PROSSIMA presente ma non ancora disponibile.';
          }

          const motivoLabel = MOTIVO_LABEL[j.motivo] || (ok ? 'Check-in accettato' : 'Check-in rifiutato');

          // Dati di contesto (solo se presenti)
          const dati = [];
          if (j.tessera_uid) dati.push(['Tessera', esc(j.tessera_uid)]);
          if (j.cliente_id != null) dati.push(['Cliente', '#' + esc(j.cliente_id)]);
          if (j.saldo_ingressi != null) dati.push(['Saldo ingressi', esc(j.saldo_ingressi)]);
          if (j.prossima_seduta_id != null) dati.push(['Seduta PROSSIMA', '#' + esc(j.prossima_seduta_id)]);
          const datiHtml = dati.length
            ? '<div class="sim-extra">' + dati.map(function (r) {
                return '<div class="sim-row"><span class="muted small">' + r[0] + '</span><b>' + r[1] + '</b></div>';
              }).join('') + '</div>'
            : '';

          esito.innerHTML =
            '<div class="sim-line"><span class="muted small">Passaggio tessera</span>' +
              '<div class="sim-line-val">' + tesseraBadge + '<span class="sim-note">' + tesseraTesto + '</span></div></div>' +
            '<div class="sim-line"><span class="muted small">Allenamento</span>' +
              '<div class="sim-line-val">' + allBadge + '<span class="sim-note">' + allTesto + '</span></div></div>' +
            '<div class="sim-line"><span class="muted small">Motivo</span>' +
              '<div class="sim-line-val"><b>' + esc(motivoLabel) + '</b></div></div>' +
            datiHtml;
        }

        document.getElementById('btnCheck').addEventListener('click', async () => {
          const uid = inp.value.trim();
          if (!uid) {
            esito.className = 'sim-result sim-err';
            esito.innerHTML = '<p>Inserisci un UID.</p>';
            return;
          }
          esito.className = 'sim-result sim-empty';
          esito.innerHTML = '<p class="muted">Invio in corso…</p>';
          try {
            const r = await fetch('/api/nfc/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ uid, sorgente: document.getElementById('sorgente').value || 'simulatore' }),
            });
            const j = await r.json();
            raw.textContent = 'HTTP ' + r.status + String.fromCharCode(10) + JSON.stringify(j, null, 2);
            render(j);
          } catch (e) {
            esito.className = 'sim-result sim-err';
            esito.innerHTML = '<p>Errore: ' + esc(e.message) + '</p>';
            raw.textContent = String(e);
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

  const clienteCell = (a) => a.cliente_id
    ? `<a href="/admin/clienti/${a.cliente_id}">${escapeHtml(a.cliente_cognome || '')} ${escapeHtml(a.cliente_nome || '')}</a>`
    : '<span class="muted">—</span>';

  const statoCell = (a) => a.letto
    ? '<span class="badge badge-muted">Letto</span>'
    : '<span class="badge badge-warn">Da gestire</span>';

  const segnaForm = (a) => a.letto ? '' : `<form method="POST" action="/admin/bacheca/${a.id}/letto" style="display:inline">
      <button type="submit" class="btn small btn-ghost">Segna letto</button>
    </form>`;

  const rows = avvisi.map((a) => `
    <tr>
      <td class="muted num">#${a.id}</td>
      <td class="muted">${fmtDateTimeFull(a.creato_il)}</td>
      <td>${tipoBadge(a.tipo)}</td>
      <td>${clienteCell(a)}</td>
      <td>${escapeHtml(a.messaggio)}</td>
      <td>${statoCell(a)}</td>
      <td class="col-right">${segnaForm(a)}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="muted">Nessun avviso. Quando arriva un check-in anomalo comparirà qui.</td></tr>`;

  const cards = avvisi.map((a) => `
    <div class="row-card">
      <div class="rc-top">
        <span class="t">${tipoBadge(a.tipo)}</span>
        ${statoCell(a)}
      </div>
      <p style="margin:8px 0 0">${escapeHtml(a.messaggio)}</p>
      <div class="rc-meta">
        <span>${fmtDateTimeFull(a.creato_il)}</span>
        ${a.cliente_id ? `<span>${clienteCell(a)}</span>` : ''}
      </div>
      ${a.letto ? '' : `<div class="rc-act">${segnaForm(a)}</div>`}
    </div>
  `).join('') || `<div class="empty-state"><h3>Nessun avviso</h3><p class="muted">Quando arriva un check-in anomalo comparirà qui.</p></div>`;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Operatività</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>Avvisi e bacheca</h1>
        <div class="toolbar">
          <form method="POST" action="/admin/bacheca/segna-tutti-letti" style="display:inline">
            <button type="submit" class="btn">Segna tutti come letti</button>
          </form>
        </div>
      </div>
      <p class="muted">Eventi recenti e segnalazioni da gestire. ${totNonLetti > 0 ? `<strong>${totNonLetti}</strong> da gestire.` : 'Tutto in ordine.'}</p>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <div class="filter-bar">
      <a class="btn ${soloNonLetti ? 'btn-primary' : ''}" href="?non_letti=1">Solo da gestire</a>
      <a class="btn ${!soloNonLetti ? 'btn-primary' : ''}" href="?non_letti=0">Tutti</a>
    </div>

    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>ID</th><th>Quando</th><th>Tipo</th><th>Cliente</th><th>Messaggio</th><th>Stato</th><th class="col-right">Azioni</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>
  `;
  res.send(adminLayout({
    title: 'Avvisi e bacheca',
    user: req.admin,
    active: '/admin/bacheca',
    counts: buildCounts(),
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Avvisi' }],
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

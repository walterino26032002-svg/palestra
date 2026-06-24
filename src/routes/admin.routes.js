'use strict';

/**
 * Route admin: clienti, servizi, pagamenti.
 * Tutte protette da requireAdmin (vedi server.js).
 *
 * Convenzione risposte:
 *   - Form HTML:   redirect 303 con ?ok=... o ?err=... per feedback inline.
 *   - API JSON:    { ok: true, ... } oppure 4xx con { ok: false, error }.
 */

const express = require('express');
const path = require('path');

const clientiService = require('../services/clienti.service');
const serviziService = require('../services/servizi.service');
const pagamentiService = require('../services/pagamenti.service');
const movimentiService = require('../services/movimenti.service');
const schedeService = require('../services/schede.service');
const abbonamenti = require('../services/abbonamenti.service');
const assicurazioni = require('../services/assicurazioni.service');

const router = express.Router();

const { adminLayout } = require('../views/adminLayout');
const { escapeHtml, alertBlock, backWithMsg, fmtDateTime } = require('../utils/helpers');
const { buildAdminCounts } = require('../utils/adminCounts');
const { getDb } = require('../db/connection');
const bcrypt = require('bcrypt');

function fmtEurFromCent(cent) {
  const n = Number(cent || 0) / 100;
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Normalizza una parola per username: minuscolo, no accenti, solo alfanumerici. */
function cleanPart(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Genera username unico nel DB: base = nome.cognome.
 * Se occupato da altro cliente → nome.cognome2, nome.cognome3, …
 * @param {string} nome @param {string} cognome @param {number} excludeId - id del cliente da escludere dal controllo
 */
function generaUsernameUnico(nome, cognome, excludeId) {
  const n = cleanPart(nome), c = cleanPart(cognome);
  if (!n || !c) return null;
  const db = getDb();
  const check = db.prepare('SELECT id FROM clienti WHERE username = ? AND id != ?');
  let candidate = `${n}.${c}`;
  let i = 2;
  while (check.get(candidate, excludeId || 0)) {
    candidate = `${n}.${c}${i++}`;
  }
  return candidate;
}

// -------------------------------------------------------------
// HEALTH HTML placeholder route (niente duplicato con /health JSON)
// -------------------------------------------------------------

// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------
router.get('/', (req, res) => {
  const counts = buildAdminCounts();
  const daRevisionare = counts['/admin/revisioni'] || 0;
  const nonLetti = counts['/admin/bacheca'] || 0;

  const db = getDb();
  const annoC = assicurazioni.currentYear();

  // Pagamenti aperti: clienti distinti con almeno un pagamento o mensile DA_SALDARE
  let pagAperti = 0;
  try {
    const set = new Set([
      ...db.prepare("SELECT DISTINCT cliente_id FROM pagamenti WHERE stato_pagamento='DA_SALDARE'").all().map(r => r.cliente_id),
      ...db.prepare("SELECT DISTINCT cliente_id FROM abbonamenti_mensili_cliente WHERE stato_pagamento='DA_SALDARE'").all().map(r => r.cliente_id),
    ]);
    pagAperti = set.size;
  } catch (_) {}

  // Assicurazioni non in regola: clienti attivi senza record PAGATO per l'anno corrente
  let assNonInRegola = 0;
  try {
    const totaleAttivi = db.prepare("SELECT COUNT(*) AS n FROM clienti WHERE attivo=1").get().n;
    const coperti = db.prepare("SELECT COUNT(*) AS n FROM assicurazioni_annuali_cliente WHERE anno=? AND stato_pagamento='PAGATO'").get(annoC).n;
    assNonInRegola = Math.max(0, totaleAttivi - coperti);
  } catch (_) {}

  let checkinOggi = [];
  try {
    checkinOggi = db.prepare(`
      SELECT strftime('%H:%M', p.entrata_il, 'localtime') AS ora, c.nome, c.cognome
      FROM presenze p JOIN clienti c ON c.id = p.cliente_id
      WHERE p.data = date('now', 'localtime')
      ORDER BY p.entrata_il DESC LIMIT 5
    `).all();
  } catch (_) {}

  const nPresenze = checkinOggi.length;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Accademia · Élite Training Club</p>
      <h1>Bacheca</h1>
    </header>

    <div class="bacheca-cards">
      <a class="bacheca-card${daRevisionare > 0 ? ' bacheca-card--warn' : ' bacheca-card--ok'}" href="/admin/revisioni">
        <p class="bc-label">Revisioni</p>
        <p class="bc-value">${daRevisionare > 0 ? daRevisionare : '✓'}</p>
        <p class="bc-sub">${daRevisionare > 0 ? `${daRevisionare === 1 ? 'scheda' : 'schede'} da completare` : 'Tutto revisionato'}</p>
      </a>
      <a class="bacheca-card${pagAperti > 0 ? ' bacheca-card--warn' : ' bacheca-card--ok'}" href="/admin/clienti">
        <p class="bc-label">Pagamenti aperti</p>
        <p class="bc-value">${pagAperti > 0 ? pagAperti : '✓'}</p>
        <p class="bc-sub">${pagAperti > 0 ? `${pagAperti === 1 ? 'cliente' : 'clienti'} da saldare` : 'Tutto saldato'}</p>
      </a>
      <a class="bacheca-card${assNonInRegola > 0 ? ' bacheca-card--warn' : ' bacheca-card--ok'}" href="/admin/clienti">
        <p class="bc-label">Assicurazioni ${annoC}</p>
        <p class="bc-value">${assNonInRegola > 0 ? assNonInRegola : '✓'}</p>
        <p class="bc-sub">${assNonInRegola > 0 ? `${assNonInRegola === 1 ? 'cliente' : 'clienti'} da sistemare` : 'Tutti coperti'}</p>
      </a>
      <a class="bacheca-card bacheca-card--neutral" href="/admin/nfc">
        <p class="bc-label">Presenze oggi</p>
        <p class="bc-value">${nPresenze}</p>
        <p class="bc-sub">${nPresenze === 0 ? 'Nessun check-in ancora' : `${nPresenze === 1 ? 'presenza' : 'presenze'} oggi`}</p>
      </a>
    </div>

    <div class="card" style="margin-top:20px">
      <h2 class="section-title">Oggi in palestra</h2>
      ${checkinOggi.length === 0
        ? '<p class="muted">Nessun check-in registrato oggi.</p>'
        : `<ul style="margin:0 0 14px;padding-left:18px;line-height:2">
             ${checkinOggi.map(p => `<li><span class="muted small">${escapeHtml(p.ora)}</span> &nbsp;${escapeHtml(p.cognome)} ${escapeHtml(p.nome)}</li>`).join('')}
           </ul>
           <a class="muted small" href="/admin/nfc">Vai a NFC / Ingressi →</a>`}
    </div>

    ${nonLetti > 0 ? `
    <div class="card" style="margin-top:12px">
      <h2 class="section-title">Avvisi tecnici</h2>
      <p><strong>${nonLetti}</strong> ${nonLetti === 1 ? 'avviso' : 'avvisi'} non ${nonLetti === 1 ? 'letto' : 'letti'}.</p>
      <a class="btn btn-ghost small" href="/admin/bacheca">Apri avvisi</a>
    </div>` : ''}
  `;
  res.send(adminLayout({
    title: 'Bacheca operativa',
    user: req.admin,
    active: '/admin',
    counts,
    body,
    breadcrumb: [],
  }));
});

// =============================================================
// CLIENTI
// =============================================================

// Lista
router.get('/clienti', (req, res) => {
  const q = req.query.q || '';
  const clienti = clientiService.listClienti({ q });
  const attiviCount = clienti.filter((c) => c.attivo).length;

  // Badge pagamenti e assicurazione per lista
  const db = getDb();
  const annoC = assicurazioni.currentYear();
  const setDaSaldare = new Set([
    ...db.prepare("SELECT DISTINCT cliente_id FROM pagamenti WHERE stato_pagamento='DA_SALDARE'").all().map(r => r.cliente_id),
    ...db.prepare("SELECT DISTINCT cliente_id FROM abbonamenti_mensili_cliente WHERE stato_pagamento='DA_SALDARE'").all().map(r => r.cliente_id),
    ...db.prepare("SELECT DISTINCT cliente_id FROM assicurazioni_annuali_cliente WHERE anno=? AND stato_pagamento='DA_SALDARE'").all(annoC).map(r => r.cliente_id),
  ]);
  const mapAss = new Map(
    db.prepare("SELECT cliente_id, stato_pagamento FROM assicurazioni_annuali_cliente WHERE anno=?").all(annoC).map(r => [r.cliente_id, r.stato_pagamento])
  );

  const statoCliente = (c) => c.attivo
    ? '<span class="badge badge-ok">Attivo</span>'
    : '<span class="badge badge-muted">Disattivo</span>';

  const saldoCell = (c) => {
    const neg = Number(c.saldo_ingressi) < 0;
    return `<span class="num"${neg ? ' style="color:var(--danger)"' : ''}>${c.saldo_ingressi}</span>`;
  };

  const rows = clienti.map((c) => {
    const daSaldare = setDaSaldare.has(c.id);
    const assStato = mapAss.get(c.id);
    const assBadge = assStato === 'PAGATO'
      ? '<span class="badge badge-ok">Assicurazione OK</span>'
      : assStato === 'DA_SALDARE'
        ? '<span class="badge badge-warn">Assicurazione da saldare</span>'
        : '<span class="badge badge-muted">Assicurazione assente</span>';
    return `
    <tr>
      <td><a href="/admin/clienti/${c.id}"><strong>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</strong></a></td>
      <td class="muted">${escapeHtml(c.email || '—')}</td>
      <td class="muted">${escapeHtml(c.telefono || '—')}</td>
      <td class="col-right">${saldoCell(c)}</td>
      <td><span class="badge badge-${escapeHtml(c.badge_tone)}">${escapeHtml(c.badge_label)}</span></td>
      <td>${daSaldare ? '<span class="badge badge-warn">Da saldare</span>' : '<span class="badge badge-ok">Tutto saldato</span>'}</td>
      <td>${assBadge}</td>
      <td>${statoCliente(c)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="muted">Nessun cliente trovato. Aggiungine uno con "Nuovo cliente".</td></tr>`;

  const cards = clienti.map((c) => {
    const daSaldare = setDaSaldare.has(c.id);
    const assStato = mapAss.get(c.id);
    return `
    <a class="row-card" href="/admin/clienti/${c.id}" style="display:block">
      <div class="rc-top">
        <span class="t">${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</span>
        ${statoCliente(c)}
      </div>
      <div class="rc-meta">
        <span>Saldo <b>${c.saldo_ingressi}</b></span>
        <span><span class="badge badge-${escapeHtml(c.badge_tone)}">${escapeHtml(c.badge_label)}</span></span>
        <span>${daSaldare ? '<span class="badge badge-warn">Da saldare</span>' : '<span class="badge badge-ok">Saldato</span>'}</span>
        <span>${assStato === 'PAGATO' ? '<span class="badge badge-ok">Ass. OK</span>' : assStato === 'DA_SALDARE' ? '<span class="badge badge-warn">Ass. da saldare</span>' : '<span class="badge badge-muted">Ass. assente</span>'}</span>
      </div>
      ${c.email || c.telefono ? `<div class="rc-meta"><span class="muted small">${escapeHtml(c.email || c.telefono || '')}</span></div>` : ''}
    </a>`;
  }).join('') || `<div class="empty-state"><h3>Nessun cliente</h3><p class="muted">Aggiungine uno con "Nuovo cliente".</p></div>`;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Accademia</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>Clienti</h1>
        <div class="toolbar"><a class="btn btn-primary" href="/admin/clienti/nuovo">+ Nuovo cliente</a></div>
      </div>
      <p class="muted">Anagrafica, stato e saldo ingressi degli atleti dell'Accademia.</p>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="svc-stats">
      <div class="svc-stat"><p class="eyebrow">Clienti mostrati</p><div class="v">${clienti.length}</div></div>
      <div class="svc-stat"><p class="eyebrow">Attivi</p><div class="v">${attiviCount}</div></div>
      <div class="svc-stat"><p class="eyebrow">Non attivi</p><div class="v">${clienti.length - attiviCount}</div></div>
    </section>

    <form method="GET" action="/admin/clienti" class="filter-bar">
      <input type="text" name="q" placeholder="Cerca per nome, cognome, email, telefono" value="${escapeHtml(q)}">
      <button type="submit" class="btn">Cerca</button>
      ${q ? '<a class="btn btn-ghost" href="/admin/clienti">Azzera</a>' : ''}
    </form>

    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr>
          <th>Nome</th><th>Email</th><th>Telefono</th>
          <th class="col-right">Saldo</th><th>Badge</th><th>Pagamenti</th><th>Assicurazione</th><th>Stato</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>
  `;
  res.send(adminLayout({
    title: 'Clienti',
    user: req.admin,
    active: '/admin/clienti',
    body,
    breadcrumb: [
      { label: 'Bacheca', href: '/admin' },
      { label: 'Clienti' },
    ],
  }));
});

// Nuovo cliente (form)
router.get('/clienti/nuovo', (req, res) => {
  const body = renderClienteForm({ mode: 'create', cliente: {}, error: req.query.err });
  res.send(adminLayout({
    title: 'Nuovo cliente',
    user: req.admin,
    active: '/admin/clienti',
    body,
    breadcrumb: [
      { label: 'Bacheca', href: '/admin' },
      { label: 'Clienti', href: '/admin/clienti' },
      { label: 'Nuovo' },
    ],
  }));
});

// Crea cliente (POST)
router.post('/clienti', express.urlencoded({ extended: false }), (req, res) => {
  const { nome, cognome, email, telefono, note, password, attivo } = req.body || {};
  try {
    const id = clientiService.createCliente({
      nome,
      cognome,
      email,
      telefono,
      note,
      password: password || null,
      attivo: attivo === '0' ? 0 : 1,
    });
    const uname = generaUsernameUnico(nome, cognome, id);
    if (uname) getDb().prepare('UPDATE clienti SET username = ? WHERE id = ? AND (username IS NULL OR username = \'\')').run(uname, id);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Cliente creato.', 'ok');
  } catch (e) {
    if (e.code === 'validation') return backWithMsg(res, '/admin/clienti/nuovo', e.message, 'err');
    console.error(e);
    return backWithMsg(res, '/admin/clienti/nuovo', 'Errore creazione cliente.', 'err');
  }
});

// Dettaglio cliente
router.get('/clienti/:id(\\d+)', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cliente = clientiService.getCliente(id);
  if (!cliente) return backWithMsg(res, '/admin/clienti', 'Cliente non trovato.', 'err');

  const pagamenti = pagamentiService.listPagamentiCliente(id, { limit: 50 });
  const movimenti = movimentiService.getMovimenti(id, { limit: 50 });
  const servizi = serviziService.listServizi({ soloAttivi: true });
  const schedaRiepilogo = schedeService.riepilogoCliente(id);
  const mensiliCliente = abbonamenti.listAbbonamenti(id);
  const assCorrente = assicurazioni.getAssicurazioneCorrente(id);
  const annoCorrente = assicurazioni.currentYear();
  const mensileAttivoOra = abbonamenti.getAbbonamentoMensileAttivoOggi(id);

  const pagRows = pagamenti.map((p) => `
    <tr>
      <td class="muted">${fmtDateTime(p.pagato_il)}</td>
      <td>${escapeHtml(p.servizio_nome || '—')}</td>
      <td class="col-right num">${p.servizio_ingressi ?? '—'}</td>
      <td class="col-right num">${fmtEurFromCent(p.importo_cent)}</td>
      <td>${escapeHtml(p.metodo || '—')}</td>
      <td>${p.stato_pagamento === 'DA_SALDARE'
        ? `<span class="badge badge-warn">Da saldare</span>&nbsp;<form method="POST" action="/admin/pagamenti/${p.id}/pagato" style="display:inline"><button type="submit" class="btn btn-ghost small">Segna come pagato</button></form>`
        : '<span class="badge badge-ok">Pagato</span>'}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted">Nessun pagamento registrato.</td></tr>`;

  const fmtData = (v) => v ? String(v).substring(0, 10).split('-').reverse().join('/') : '—';
  const mensileRows = mensiliCliente.map((m) => `
    <tr>
      <td>${escapeHtml(m.tipo_nome || '—')}</td>
      <td>${fmtData(m.data_inizio)}</td>
      <td>${fmtData(m.data_fine)}</td>
      <td>${m.stato_pagamento === 'DA_SALDARE'
        ? `<span class="badge badge-warn">Da saldare</span>&nbsp;<form method="POST" action="/admin/abbonamenti-mensili/${m.id}/pagato" style="display:inline"><button type="submit" class="btn btn-ghost small">Segna come pagato</button></form>`
        : '<span class="badge badge-ok">Pagato</span>'}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="muted">Nessun abbonamento mensile.</td></tr>`;

  const movRows = movimenti.map((m) => `
    <tr>
      <td class="muted">${fmtDateTime(m.creato_il)}</td>
      <td class="col-right num"${m.delta < 0 ? ' style="color:var(--danger)"' : ''}>${m.delta > 0 ? '+' : ''}${m.delta}</td>
      <td>${escapeHtml(m.motivo)}</td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="muted">Nessun movimento ingressi.</td></tr>`;

  const serviziOptions = servizi.map((s) =>
    `<option value="${s.id}" data-modalita="${s.modalita || 'INGRESSI'}">${escapeHtml(s.nome)} — ${s.modalita === 'MENSILE' ? 'Mensile' : s.ingressi + ' ingr.'} (${fmtEurFromCent(s.prezzo_cent)})</option>`
  ).join('');

  const statoBadge = cliente.attivo
    ? '<span class="badge badge-ok">Attivo</span>'
    : '<span class="badge badge-muted">Non attivo</span>';

  const body = `
    <header class="page-head">
      <p class="eyebrow">Profilo cliente</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)} ${statoBadge}</h1>
        <div class="toolbar">
          <a class="btn" href="/admin/clienti">← Tutti i clienti</a>
        </div>
      </div>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    ${!schedaRiepilogo.prossima_seduta ? `
    <div class="card" style="border-color:var(--warn);margin-bottom:16px;padding:12px 16px">
      <span class="badge badge-warn">Nessuna seduta PROSSIMA</span>
      <span class="muted small" style="margin-left:10px">Il cliente non vedrà allenamento al check-in finché non ne imposti una.</span>
      <a class="btn small" href="/admin/clienti/${cliente.id}/scheda" style="margin-left:12px">Apri scheda →</a>
    </div>` : ''}

    <section class="svc-stats">
      <div class="svc-stat">
        <p class="eyebrow">Ingressi</p>
        <div class="v"${Number(cliente.saldo_ingressi) < 0 ? ' style="color:var(--danger)"' : ''}>${cliente.saldo_ingressi}</div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Abbonamento</p>
        <div style="margin-top:8px">${mensileAttivoOra
          ? `<span class="badge badge-ok">Mensile attivo fino al ${mensileAttivoOra.data_fine.split('-').reverse().join('/')}</span>`
          : '<span class="badge badge-muted">Nessun mensile attivo</span>'}</div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Scheda</p>
        <div style="margin-top:8px">${schedaRiepilogo.ha_scheda
          ? (schedaRiepilogo.prossima_seduta ? '<span class="badge badge-ok">Seduta pronta</span>' : '<span class="badge badge-warn">Nessuna PROSSIMA</span>')
          : '<span class="badge badge-warn">Senza scheda</span>'}</div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Pagamenti</p>
        <div style="margin-top:8px">${(() => {
          const n = pagamenti.filter(p => p.stato_pagamento === 'DA_SALDARE').length
            + mensiliCliente.filter(m => m.stato_pagamento === 'DA_SALDARE').length
            + (assCorrente && assCorrente.stato_pagamento === 'DA_SALDARE' ? 1 : 0);
          return n > 0
            ? `<span class="badge badge-warn">Da saldare (${n})</span>`
            : '<span class="badge badge-ok">Tutto saldato</span>';
        })()}</div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Assicurazione</p>
        <div style="margin-top:8px">${(() => {
          if (!assCorrente) return '<span class="badge badge-muted">Assente</span>';
          if (assCorrente.stato_pagamento === 'DA_SALDARE') return '<span class="badge badge-warn">Da saldare</span>';
          const fine = assCorrente.data_fine.split('-').reverse().join('/');
          return `<span class="badge badge-ok">Pagata fino al ${fine}</span>`;
        })()}</div>
      </div>
    </section>

    <section class="section-gap card">
      <h2>Scheda allenamento</h2>
      ${schedaRiepilogo.ha_scheda
        ? `<p class="muted small">Blocchi: <strong>${schedaRiepilogo.blocchi_count}</strong> (${schedaRiepilogo.blocchi_archiviati} archiviati)
               · Sedute: <strong>${schedaRiepilogo.sedute_totali}</strong>
               (${schedaRiepilogo.sedute_completate} completate)</p>
           ${schedaRiepilogo.prossima_seduta
             ? `<p>Seduta PROSSIMA: <a href="/admin/sedute/${schedaRiepilogo.prossima_seduta.id}">Settimana ${schedaRiepilogo.prossima_seduta.indice_settimana} · Seduta ${schedaRiepilogo.prossima_seduta.indice_seduta}</a></p>`
             : ''}
           <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Apri scheda completa</a>`
        : `<p><span class="badge badge-warn">Senza scheda</span></p><p class="muted small">Nessun blocco o seduta associata a questo cliente.</p>
           <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Crea blocco</a>`}
    </section>

    <section class="section-gap">
      <h2>Registra pagamento / Abbonamento</h2>
      <form method="POST" action="/admin/clienti/${cliente.id}/pagamenti" class="card form-inline" id="frmPagamento">
        <label>Servizio
          <select name="servizio_id" id="srvSelect" required>
            <option value="">— seleziona —</option>
            ${serviziOptions}
          </select>
        </label>
        <span class="ingressi-fields">
          <label>Importo (€) <input name="importo_eur" type="number" min="0" step="0.01" placeholder="es. 50.00 — lascia vuoto per usare il listino"></label>
        </span>
        <span class="mensile-fields" style="display:none">
          <label>Data inizio <input name="data_inizio" type="date"></label>
          <label>Data fine <input name="data_fine" type="date"></label>
        </span>
        <label>Stato pagamento
          <select name="stato_pagamento">
            <option value="PAGATO" selected>Pagato</option>
            <option value="DA_SALDARE">Da saldare</option>
          </select>
        </label>
        <label>Metodo <input name="metodo" placeholder="contanti, bonifico..."></label>
        <label>Note <input name="note"></label>
        <button type="submit" class="btn btn-primary">Registra</button>
      </form>
      <script>
        (function () {
          var sel = document.getElementById('srvSelect');
          var iF = document.querySelector('.ingressi-fields');
          var mF = document.querySelector('.mensile-fields');
          var frm = document.getElementById('frmPagamento');
          function toggle() {
            var opt = sel.options[sel.selectedIndex];
            var isMensile = opt && opt.getAttribute('data-modalita') === 'MENSILE';
            iF.style.display = isMensile ? 'none' : '';
            mF.style.display = isMensile ? '' : 'none';
            frm.action = isMensile
              ? '/admin/clienti/${cliente.id}/abbonamenti-mensili'
              : '/admin/clienti/${cliente.id}/pagamenti';
          }
          if (sel) sel.addEventListener('change', toggle);
        })();
      </script>
    </section>

    <section class="section-gap">
      <h2>Assicurazione annuale ${annoCorrente}</h2>
      ${(() => {
        if (!assCorrente) return `
          <p class="muted small" style="margin:8px 0">Nessuna assicurazione registrata per il ${annoCorrente}.</p>`;
        const tone = assCorrente.stato_pagamento === 'PAGATO' ? 'ok' : 'warn';
        const label = assCorrente.stato_pagamento === 'PAGATO' ? 'Pagata' : 'Da saldare';
        const fmtD = (v) => v ? String(v).split('-').reverse().join('/') : '—';
        return `
          <p style="margin:8px 0">
            <span class="badge badge-${escapeHtml(tone)}">${label}</span>
            <span class="muted small" style="margin-left:8px">valida dal ${fmtD(assCorrente.data_inizio)} al ${fmtD(assCorrente.data_fine)}</span>
            ${assCorrente.note ? `<span class="muted small" style="margin-left:8px">— ${escapeHtml(assCorrente.note)}</span>` : ''}
          </p>
          ${assCorrente.stato_pagamento === 'DA_SALDARE' ? `
          <form method="POST" action="/admin/clienti/${cliente.id}/assicurazione/${assCorrente.id}/pagata" style="display:inline;margin-top:8px">
            <button type="submit" class="btn btn-ghost small">Segna come pagata</button>
          </form>` : ''}`;
      })()}
      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-size:13px;padding:4px 0">Registra assicurazione anno corrente</summary>
        <form method="POST" action="/admin/clienti/${cliente.id}/assicurazione" class="card form-inline" style="margin-top:10px">
          <label>Anno <input name="anno" type="number" value="${annoCorrente}" min="2020" max="2100" style="width:90px"></label>
          <label>Stato
            <select name="stato_pagamento">
              <option value="PAGATO" selected>Pagata</option>
              <option value="DA_SALDARE">Da saldare</option>
            </select>
          </label>
          <label>Note <input name="note" placeholder="opzionale"></label>
          <button type="submit" class="btn btn-primary small">Registra</button>
        </form>
      </details>
    </section>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Storico pagamenti</summary>
      <div class="table-wrap" style="margin-top:10px">
        <table class="table">
          <thead><tr><th>Data</th><th>Servizio</th><th class="col-right">Ingressi</th><th class="col-right">Importo</th><th>Metodo</th><th>Stato</th></tr></thead>
          <tbody>${pagRows}</tbody>
        </table>
      </div>
    </details>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Abbonamenti mensili</summary>
      <div class="table-wrap" style="margin-top:10px">
        <table class="table">
          <thead><tr><th>Tipo</th><th>Dal</th><th>Al</th><th>Stato</th></tr></thead>
          <tbody>${mensileRows}</tbody>
        </table>
      </div>
    </details>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Movimenti ingressi</summary>
      <div class="table-wrap" style="margin-top:10px">
        <table class="table">
          <thead><tr><th>Data</th><th class="col-right">Δ</th><th>Motivo</th></tr></thead>
          <tbody>${movRows}</tbody>
        </table>
      </div>
    </details>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Anagrafica cliente · ${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)} · ${cliente.attivo ? 'Attivo' : 'Non attivo'}</summary>
      <div class="card" style="margin-top:10px">
        <form method="POST" action="/admin/clienti/${cliente.id}" class="form-stacked">
          <label>Nome <input name="nome" value="${escapeHtml(cliente.nome)}" required></label>
          <label>Cognome <input name="cognome" value="${escapeHtml(cliente.cognome)}" required></label>
          <label>Email <input name="email" type="email" value="${escapeHtml(cliente.email || '')}"></label>
          <label>Telefono <input name="telefono" value="${escapeHtml(cliente.telefono || '')}"></label>
          <label>Note <textarea name="note" rows="2">${escapeHtml(cliente.note || '')}</textarea></label>
          <label>Stato
            <select name="attivo">
              <option value="1" ${cliente.attivo ? 'selected' : ''}>Attivo</option>
              <option value="0" ${!cliente.attivo ? 'selected' : ''}>Non attivo</option>
            </select>
          </label>
          <div class="toolbar">
            <button type="submit" class="btn btn-primary">Salva anagrafica</button>
          </div>
        </form>
      </div>
    </details>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Accesso cliente${cliente.username ? ` · username: ${escapeHtml(cliente.username)}` : ''}</summary>
      <div class="card" style="margin-top:10px">
        <p class="muted small" style="margin-bottom:12px"><strong>Nome utente</strong><br>
          ${cliente.username
            ? `<code>${escapeHtml(cliente.username)}</code>`
            : (cleanPart(cliente.nome) && cleanPart(cliente.cognome)
              ? '<span class="muted">Da attivare — salva l\'anagrafica per generare il nome utente.</span>'
              : '<span class="muted">Non disponibile — compila Nome e Cognome in Anagrafica.</span>')}
        </p>
        <form method="POST" action="/admin/clienti/${cliente.id}/password" class="form-stacked">
          <label>Nuova password <input name="password" type="password" required></label>
          <div class="toolbar"><button type="submit" class="btn btn-primary">Imposta password</button></div>
        </form>
        <p class="muted small">La password non è visibile dopo il salvataggio. Puoi solo impostarne una nuova.</p>
      </div>
    </details>

    <details class="section-gap">
      <summary style="cursor:pointer;font-weight:600;padding:10px 0">Export e stampe</summary>
      <div class="toolbar" style="margin-top:10px">
        <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda/stampa" target="_blank">Stampa scheda</a>
        <a class="btn" href="/admin/clienti/${cliente.id}/scheda/xlsx">XLSX scheda</a>
        <a class="btn" href="/admin/clienti/${cliente.id}/report/xlsx">XLSX report</a>
      </div>
    </details>
  `;

  res.send(adminLayout({
    title: `${cliente.cognome} ${cliente.nome}`,
    user: req.admin,
    active: '/admin/clienti',
    body,
    breadcrumb: [
      { label: 'Bacheca', href: '/admin' },
      { label: 'Clienti', href: '/admin/clienti' },
      { label: `${cliente.cognome} ${cliente.nome}` },
    ],
  }));
});

// Modifica anagrafica cliente
router.post('/clienti/:id(\\d+)', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, cognome, email, telefono, note, attivo } = req.body || {};
  try {
    clientiService.updateCliente(id, {
      nome,
      cognome,
      email,
      telefono,
      note,
      attivo: attivo === undefined ? undefined : (attivo === '1' ? 1 : 0),
    });
    const uname = generaUsernameUnico(nome, cognome, id);
    if (uname) getDb().prepare('UPDATE clienti SET username = ? WHERE id = ? AND (username IS NULL OR username = \'\')').run(uname, id);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Anagrafica aggiornata.', 'ok');
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/clienti', 'Cliente non trovato.', 'err');
    console.error(e);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Errore aggiornamento.', 'err');
  }
});

// Cambia password cliente
router.post('/clienti/:id(\\d+)/password', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { password } = req.body || {};
  try {
    clientiService.setPassword(id, password);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Password aggiornata.', 'ok');
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/clienti', 'Cliente non trovato.', 'err');
    if (e.code === 'validation') return backWithMsg(res, `/admin/clienti/${id}`, e.message, 'err');
    console.error(e);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Errore aggiornamento password.', 'err');
  }
});

// Toggle attivo
router.post('/clienti/:id(\\d+)/toggle-attivo', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const nuovo = clientiService.toggleAttivo(id);
    return backWithMsg(res, `/admin/clienti/${id}`,
      nuovo ? 'Cliente attivato.' : 'Cliente disattivato.', 'ok');
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/clienti', 'Cliente non trovato.', 'err');
    console.error(e);
    return backWithMsg(res, '/admin/clienti', 'Errore.', 'err');
  }
});

// Registra pagamento per un cliente
router.post('/clienti/:id(\\d+)/pagamenti', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { servizio_id, importo_eur, metodo, note, stato_pagamento } = req.body || {};
  try {
    const result = pagamentiService.registraPagamento({
      clienteId: id,
      servizioId: parseInt(servizio_id, 10),
      importoCent: importo_eur ? Math.round(parseFloat(importo_eur) * 100) : undefined,
      metodo,
      note,
      adminId: req.admin && req.admin.id ? req.admin.id : null,
      statoPagamento: stato_pagamento || 'PAGATO',
    });
    const msg = `Pagamento registrato. Ingressi aggiunti: ${result.ingressi}. Nuovo saldo: ${result.nuovoSaldo}.`;
    return backWithMsg(res, `/admin/clienti/${id}`, msg, 'ok');
  } catch (e) {
    console.error(e);
    const msg = e.message || 'Errore registrazione pagamento.';
    return backWithMsg(res, `/admin/clienti/${id}`, msg, 'err');
  }
});

// Registra assicurazione annuale per un cliente
router.post('/clienti/:id(\\d+)/assicurazione', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { anno, stato_pagamento, note } = req.body || {};
  try {
    assicurazioni.creaAssicurazioneAnnuale({ clienteId: id, anno, statoPagamento: stato_pagamento, note });
    return backWithMsg(res, `/admin/clienti/${id}`, 'Assicurazione registrata.', 'ok');
  } catch (e) {
    const msg = e.message || 'Errore registrazione assicurazione.';
    return backWithMsg(res, `/admin/clienti/${id}`, msg, e.code === 'duplicate' ? 'ok' : 'err');
  }
});

// Segna assicurazione come pagata
router.post('/clienti/:id(\\d+)/assicurazione/:aid(\\d+)/pagata', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const aid = parseInt(req.params.aid, 10);
  try {
    assicurazioni.markAsPagata(aid);
    return backWithMsg(res, `/admin/clienti/${id}`, 'Assicurazione segnata come pagata.', 'ok');
  } catch (e) {
    return backWithMsg(res, `/admin/clienti/${id}`, e.message || 'Errore.', 'err');
  }
});

// Crea abbonamento mensile per un cliente
router.post('/clienti/:id(\\d+)/abbonamenti-mensili', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { servizio_id, data_inizio, data_fine, stato_pagamento, metodo, note } = req.body || {};
  try {
    abbonamenti.creaAbbonamento({
      clienteId: id,
      tipoAbbonamentoId: servizio_id ? parseInt(servizio_id, 10) : null,
      dataInizio: data_inizio,
      dataFine: data_fine,
      statoPagamento: stato_pagamento || 'PAGATO',
      note,
      adminId: req.admin && req.admin.id ? req.admin.id : null,
    });
    return backWithMsg(res, `/admin/clienti/${id}`, 'Abbonamento mensile registrato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, `/admin/clienti/${id}`, e.message || 'Errore.', 'err');
  }
});

// Segna pagamento ingressi come pagato
router.post('/pagamenti/:id(\\d+)/pagato', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pag = pagamentiService.getPagamento(id);
    pagamentiService.markAsPagato(id);
    return backWithMsg(res, `/admin/clienti/${pag ? pag.cliente_id : ''}`, 'Stato aggiornato a Pagato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/clienti', e.message || 'Errore.', 'err');
  }
});

// Segna abbonamento mensile come pagato
router.post('/abbonamenti-mensili/:id(\\d+)/pagato', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const db = getDb();
    const row = db.prepare('SELECT cliente_id FROM abbonamenti_mensili_cliente WHERE id = ?').get(id);
    abbonamenti.markAsPagato(id);
    return backWithMsg(res, `/admin/clienti/${row ? row.cliente_id : ''}`, 'Stato aggiornato a Pagato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/clienti', e.message || 'Errore.', 'err');
  }
});

// API JSON (per debug/script futuri)
router.get('/api/clienti', (req, res) => {
  const clienti = clientiService.listClienti({ q: req.query.q || '' });
  res.json({ ok: true, clienti });
});

router.get('/api/clienti/:id(\\d+)', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cliente = clientiService.getCliente(id);
  if (!cliente) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, cliente });
});

// =============================================================
// SERVIZI
// =============================================================

// Lista
router.get('/servizi', (req, res) => {
  const servizi = serviziService.listServizi();
  const attiviCount = servizi.filter((s) => s.attivo).length;
  const totali = servizi.length;
  const prezzoMedioCent = totali
    ? Math.round(servizi.reduce((sum, s) => sum + Number(s.prezzo_cent || 0), 0) / totali)
    : 0;

  const rows = servizi.map((s) => `
    <tr>
      <td class="muted num">#${s.id}</td>
      <td><strong>${escapeHtml(s.nome)}</strong></td>
      <td class="hide-mobile">${s.descrizione ? escapeHtml(s.descrizione) : '<span class="muted">—</span>'}</td>
      <td class="hide-mobile">${s.modalita === 'MENSILE' ? 'Mensile' : 'A ingressi'}</td>
      <td class="num">${s.modalita === 'MENSILE' ? '—' : s.ingressi}</td>
      <td class="num">${fmtEurFromCent(s.prezzo_cent)}</td>
      <td>${s.attivo ? '<span class="badge badge-ok">Attivo</span>' : '<span class="badge badge-muted">Disattivato</span>'}</td>
      <td class="col-right">
        <details>
          <summary class="btn btn-ghost small">Modifica</summary>
          <form method="POST" action="/admin/servizi/${s.id}" class="form-stacked" data-cents style="margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:6px;text-align:left">
            <label style="display:block;margin-bottom:8px">Nome <input name="nome" value="${escapeHtml(s.nome)}" required style="display:block;width:100%;margin-top:4px"></label>
            <label style="display:block;margin-bottom:8px">Descrizione <input name="descrizione" value="${escapeHtml(s.descrizione || '')}" placeholder="—" style="display:block;width:100%;margin-top:4px"></label>
            <label style="display:block;margin-bottom:8px">Modalità
              <select name="modalita" style="display:block;margin-top:4px">
                <option value="INGRESSI" ${(s.modalita || 'INGRESSI') === 'INGRESSI' ? 'selected' : ''}>A ingressi</option>
                <option value="MENSILE" ${s.modalita === 'MENSILE' ? 'selected' : ''}>Mensile</option>
              </select>
            </label>
            <label style="display:block;margin-bottom:8px">Ingressi <input name="ingressi" type="number" min="0" value="${s.ingressi}" style="width:80px;margin-top:4px"></label>
            <label style="display:block;margin-bottom:8px">Prezzo (€) <input type="number" min="0" step="0.01" value="${(Number(s.prezzo_cent || 0) / 100).toFixed(2)}" class="js-eur" style="width:100px;margin-top:4px"></label>
            <input type="hidden" name="prezzo_cent" value="${s.prezzo_cent}" class="js-cent">
            <button type="submit" class="btn small">Salva</button>
          </form>
        </details>
        <form method="POST" action="/admin/servizi/${s.id}/toggle-attivo" style="display:inline">
          <button type="submit" class="btn btn-ghost small">${s.attivo ? 'Disattiva' : 'Riattiva'}</button>
        </form>
      </td>
    </tr>
  `).join('');

  const cards = servizi.map((s) => `
    <div class="row-card">
      <div class="rc-top">
        <span class="t">${escapeHtml(s.nome)} <span class="muted small">#${s.id}</span></span>
        ${s.attivo ? '<span class="badge badge-ok">Attivo</span>' : '<span class="badge badge-muted">Disattivato</span>'}
      </div>
      ${s.descrizione ? `<p class="muted small" style="margin:6px 0 0">${escapeHtml(s.descrizione)}</p>` : ''}
      <div class="rc-meta">
        <span>Ingressi: <b>${s.ingressi}</b></span>
        <span>Prezzo: <b>${fmtEurFromCent(s.prezzo_cent)}</b></span>
      </div>
      <div class="rc-act">
        <a class="btn small" href="#srv-${s.id}">Modifica</a>
        <form method="POST" action="/admin/servizi/${s.id}/toggle-attivo" style="display:inline">
          <button type="submit" class="btn btn-ghost small">${s.attivo ? 'Disattiva' : 'Riattiva'}</button>
        </form>
      </div>
    </div>
  `).join('') || `<div class="empty-state"><h3>Nessun servizio</h3><p class="muted">Crea il primo servizio con il form qui sopra.</p></div>`;

  const body = `
    <header class="page-head">
      <p class="eyebrow">Operatività</p>
      <h1>Servizi e Listino</h1>
      <p class="muted">Gestisci i pacchetti di ingressi e i relativi prezzi. I prezzi sono mostrati in euro.</p>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="svc-stats">
      <div class="svc-stat"><p class="eyebrow">Servizi attivi</p><div class="v">${attiviCount}</div></div>
      <div class="svc-stat"><p class="eyebrow">Totali</p><div class="v">${totali}</div></div>
      <div class="svc-stat"><p class="eyebrow">Prezzo medio</p><div class="v">${fmtEurFromCent(prezzoMedioCent)}</div></div>
    </section>

    <section class="card section-gap">
      <h2>Nuovo servizio</h2>
      <form method="POST" action="/admin/servizi" class="create-block" data-cents>
        <div class="cb-grid">
          <label class="field">Nome <input name="nome" placeholder="es. Abbonamento 10 ingressi" required></label>
          <label class="field">Descrizione <input name="descrizione" placeholder="opzionale"></label>
          <label class="field">Modalità
            <select name="modalita" id="newSrvModalita">
              <option value="INGRESSI" selected>A ingressi</option>
              <option value="MENSILE">Mensile</option>
            </select>
          </label>
          <label class="field" id="newSrvIngressiField">Ingressi <input name="ingressi" type="number" min="0" value="1" required></label>
          <label class="field">Prezzo (€) <input type="number" min="0" step="0.01" value="0.00" class="js-eur" required></label>
          <label class="field">Stato
            <select name="attivo">
              <option value="1" selected>Attivo</option>
              <option value="0">Disattivato</option>
            </select>
          </label>
        </div>
        <input type="hidden" name="prezzo_cent" value="0" class="js-cent">
        <div class="cb-foot">
          <p class="hint">Il prezzo viene salvato internamente in centesimi.</p>
          <button type="submit" class="btn btn-primary">Crea servizio</button>
        </div>
      </form>
    </section>

    <h2 class="section-gap">Listino</h2>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>ID</th><th>Servizio</th><th>Descrizione</th><th>Modalità</th><th>Ingressi</th><th>Prezzo</th><th>Stato</th><th class="col-right">Azioni</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="muted">Nessun servizio.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>

    <script>
      document.querySelectorAll('form[data-cents]').forEach(function (form) {
        form.addEventListener('submit', function () {
          var eur = form.querySelector('.js-eur');
          var cent = form.querySelector('.js-cent');
          if (eur && cent) {
            var v = parseFloat(String(eur.value).replace(',', '.')) || 0;
            cent.value = Math.round(v * 100);
          }
        });
      });
      // Toggle ingressi field based on modalita in the create form
      var newMod = document.getElementById('newSrvModalita');
      var newIngField = document.getElementById('newSrvIngressiField');
      if (newMod && newIngField) {
        newMod.addEventListener('change', function () {
          newIngField.style.display = newMod.value === 'MENSILE' ? 'none' : '';
        });
      }
    </script>
  `;

  res.send(adminLayout({
    title: 'Servizi',
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Bacheca', href: '/admin' },
      { label: 'Servizi' },
    ],
  }));
});

// Crea servizio
router.post('/servizi', express.urlencoded({ extended: false }), (req, res) => {
  const { nome, descrizione, ingressi, prezzo_cent, attivo, modalita } = req.body || {};
  try {
    const id = serviziService.createServizio({
      nome,
      descrizione,
      ingressi: parseInt(ingressi, 10) || 0,
      prezzoCent: parseInt(prezzo_cent, 10),
      attivo: attivo === '0' ? 0 : 1,
      modalita: modalita || 'INGRESSI',
    });
    return backWithMsg(res, '/admin/servizi', `Servizio creato (#${id}).`, 'ok');
  } catch (e) {
    if (e.code === 'validation') return backWithMsg(res, '/admin/servizi', e.message, 'err');
    console.error(e);
    return backWithMsg(res, '/admin/servizi', 'Errore creazione servizio.', 'err');
  }
});

// Modifica servizio
router.post('/servizi/:id(\\d+)', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, descrizione, ingressi, prezzo_cent, attivo, modalita } = req.body || {};
  try {
    serviziService.updateServizio(id, {
      nome,
      descrizione,
      ingressi: ingressi === undefined ? undefined : parseInt(ingressi, 10),
      prezzoCent: prezzo_cent === undefined ? undefined : parseInt(prezzo_cent, 10),
      attivo: attivo === undefined ? undefined : (attivo === '1' ? 1 : 0),
      modalita: modalita || undefined,
    });
    return backWithMsg(res, '/admin/servizi', 'Servizio aggiornato.', 'ok');
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/servizi', 'Servizio non trovato.', 'err');
    console.error(e);
    return backWithMsg(res, '/admin/servizi', 'Errore aggiornamento.', 'err');
  }
});

// Toggle attivo servizio
router.post('/servizi/:id(\\d+)/toggle-attivo', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const nuovo = serviziService.toggleAttivo(id);
    return backWithMsg(res, '/admin/servizi',
      nuovo ? 'Servizio attivato.' : 'Servizio disattivato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/servizi', 'Errore.', 'err');
  }
});

// API JSON
router.get('/api/servizi', (req, res) => {
  res.json({ ok: true, servizi: serviziService.listServizi({ soloAttivi: req.query.attivi === '1' }) });
});

// -------------------------------------------------------------
// Helpers di render riusati
// -------------------------------------------------------------
function renderClienteForm({ mode, cliente, error }) {
  return `
    <h1>Nuovo cliente</h1>
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/admin/clienti" class="card form-stacked">
      <label>Nome * <input name="nome" required value="${escapeHtml(cliente.nome || '')}"></label>
      <label>Cognome * <input name="cognome" required value="${escapeHtml(cliente.cognome || '')}"></label>
      <label>Email <input name="email" type="email" value="${escapeHtml(cliente.email || '')}"></label>
      <label>Telefono <input name="telefono" value="${escapeHtml(cliente.telefono || '')}"></label>
      <label>Note <textarea name="note" rows="2"></textarea></label>
      <label>Password cliente <input name="password" type="text" placeholder="opzionale, min 4 caratteri"></label>
      <label>Stato
        <select name="attivo">
          <option value="1" selected>Attivo</option>
          <option value="0">Disattivo</option>
        </select>
      </label>
      <div>
        <button type="submit" class="btn btn-primary">Crea cliente</button>
        <a class="btn" href="/admin/clienti">Annulla</a>
      </div>
    </form>
  `;
}

// -------------------------------------------------------------
// SISTEMA — cambio password admin
// -------------------------------------------------------------
router.get('/sistema', (req, res) => {
  const body = `
    <header class="page-head">
      <p class="eyebrow">Impostazioni</p>
      <h1>Sistema</h1>
    </header>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <div class="card form-stacked" style="max-width:480px">
      <h2>Cambia password</h2>
      <form method="POST" action="/admin/sistema/password" autocomplete="off">
        <label>Password attuale
          <input name="password_attuale" type="password" required>
        </label>
        <label>Nuova password
          <input name="nuova_password" type="password" required minlength="8">
        </label>
        <label>Conferma nuova password
          <input name="conferma_password" type="password" required minlength="8">
        </label>
        <div><button type="submit" class="btn btn-primary">Aggiorna password</button></div>
      </form>
    </div>
  `;
  res.send(adminLayout({
    title: 'Sistema',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Bacheca', href: '/admin' }, { label: 'Export / Backup' }],
  }));
});

router.post('/sistema/password', express.urlencoded({ extended: false }), (req, res) => {
  const { password_attuale, nuova_password, conferma_password } = req.body || {};
  const back = (msg) => backWithMsg(res, '/admin/sistema', msg, 'err');

  if (!password_attuale || !nuova_password || !conferma_password) return back('Tutti i campi sono obbligatori.');
  if (nuova_password !== conferma_password) return back('Le password non coincidono.');
  if (nuova_password.length < 8) return back('La nuova password deve essere di almeno 8 caratteri.');

  const db = getDb();
  const admin = db.prepare('SELECT id, password_hash FROM admin WHERE id = ?').get(req.admin.id);
  if (!admin || !bcrypt.compareSync(password_attuale, admin.password_hash)) return back('Password attuale non corretta.');

  const hash = bcrypt.hashSync(nuova_password, 10);
  db.prepare("UPDATE admin SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, admin.id);
  return backWithMsg(res, '/admin/sistema', 'Password aggiornata.', 'ok');
});

module.exports = router;

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

const router = express.Router();

const { adminLayout } = require('../views/adminLayout');
const { escapeHtml, alertBlock, backWithMsg, fmtDateTime } = require('../utils/helpers');

function fmtEurFromCent(cent) {
  const n = Number(cent || 0) / 100;
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// -------------------------------------------------------------
// HEALTH HTML placeholder route (niente duplicato con /health JSON)
// -------------------------------------------------------------

// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------
router.get('/', (req, res) => {
  let nonLetti = 0;
  try { nonLetti = require('../services/bacheca.service').countNonLetti() || 0; } catch (_) {}

  let daRevisionare = 0;
  try { daRevisionare = require('../services/revisioni.service').countDaRevisionare() || 0; } catch (_) {}

  let clientiAttivi = 0;
  let clientiTot = 0;
  try {
    clientiTot = clientiService.listClienti({}).length;
    clientiAttivi = clientiService.listClienti({ soloAttivi: true }).length;
  } catch (_) {}

  const counts = {};
  if (daRevisionare > 0) counts['/admin/revisioni'] = daRevisionare;
  if (nonLetti > 0) counts['/admin/bacheca'] = nonLetti;

  const revisioniBadge = daRevisionare > 0
    ? ` <span class="badge badge-warn">${daRevisionare}</span>` : '';
  const avvisiBadge = nonLetti > 0
    ? ` <span class="badge badge-warn">${nonLetti}</span>` : '';

  const body = `
    <header class="page-head">
      <p class="eyebrow">Accademia · Élite Training Club</p>
      <h1>Bacheca operativa</h1>
      <p class="muted">Ciao ${escapeHtml(req.admin.username)}, ecco il centro di controllo dell'Accademia.</p>
    </header>

    <section class="kpi" aria-label="Riepilogo">
      <div class="k"><p class="eyebrow">Clienti attivi</p><div class="v">${clientiAttivi}</div></div>
      <div class="k"><p class="eyebrow">Clienti totali</p><div class="v">${clientiTot}</div></div>
      <div class="k"><p class="eyebrow">Da revisionare</p><div class="v">${daRevisionare}</div></div>
      <div class="k"><p class="eyebrow">Avvisi non letti</p><div class="v">${nonLetti}</div></div>
    </section>

    <section class="grid grid-3 section-gap">
      <a class="card card-link" href="/admin/clienti">
        <h3>Clienti <span class="arr">→</span></h3>
        <p>Anagrafica, stato, saldo ingressi e pagamenti.</p>
      </a>
      <a class="card card-link" href="/admin/servizi">
        <h3>Servizi <span class="arr">→</span></h3>
        <p>Pacchetti ingressi e listino prezzi.</p>
      </a>
      <a class="card card-link" href="/admin/schede">
        <h3>Schede <span class="arr">→</span></h3>
        <p>Programmi di allenamento: blocchi, sedute ed esercizi.</p>
      </a>
      <a class="card card-link" href="/admin/revisioni">
        <h3>Revisioni${revisioniBadge} <span class="arr">→</span></h3>
        <p>Allenamenti completati dai clienti, da rivedere.</p>
      </a>
      <a class="card card-link" href="/admin/nfc">
        <h3>Tessere <span class="arr">→</span></h3>
        <p>Assegna e gestisci le tessere NFC dei clienti.</p>
      </a>
      <a class="card card-link" href="/admin/nfc/simulatore">
        <h3>Prova check-in <span class="arr">→</span></h3>
        <p>Simula la lettura di una tessera dal browser.</p>
      </a>
      <a class="card card-link" href="/admin/bacheca">
        <h3>Avvisi${avvisiBadge} <span class="arr">→</span></h3>
        <p>Eventi recenti e segnalazioni da gestire.</p>
      </a>
      <a class="card card-link" href="/admin/export">
        <h3>Export e stampe <span class="arr">→</span></h3>
        <p>Genera PDF e XLSX; la stampa avviene dal PDF.</p>
      </a>
      <a class="card card-link" href="/admin/backup">
        <h3>Backup <span class="arr">→</span></h3>
        <p>Copie di sicurezza del database, manuali e automatiche.</p>
      </a>
    </section>
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

  const statoCliente = (c) => c.attivo
    ? '<span class="badge badge-ok">Attivo</span>'
    : '<span class="badge badge-muted">Disattivo</span>';

  const saldoCell = (c) => {
    const neg = Number(c.saldo_ingressi) < 0;
    return `<span class="num"${neg ? ' style="color:var(--danger)"' : ''}>${c.saldo_ingressi}</span>`;
  };

  const rows = clienti.map((c) => `
    <tr>
      <td class="muted num">#${c.id}</td>
      <td><a href="/admin/clienti/${c.id}"><strong>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</strong></a></td>
      <td class="muted">${escapeHtml(c.email || '—')}</td>
      <td class="muted">${escapeHtml(c.telefono || '—')}</td>
      <td class="col-right">${saldoCell(c)}</td>
      <td><span class="badge badge-${escapeHtml(c.badge_tone)}">${escapeHtml(c.badge_label)}</span></td>
      <td>${statoCliente(c)}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="muted">Nessun cliente trovato. Aggiungine uno con "Nuovo cliente".</td></tr>`;

  const cards = clienti.map((c) => `
    <a class="row-card" href="/admin/clienti/${c.id}" style="display:block">
      <div class="rc-top">
        <span class="t">${escapeHtml(c.cognome)} ${escapeHtml(c.nome)} <span class="muted small">#${c.id}</span></span>
        ${statoCliente(c)}
      </div>
      <div class="rc-meta">
        <span>Saldo <b>${c.saldo_ingressi}</b></span>
        <span><span class="badge badge-${escapeHtml(c.badge_tone)}">${escapeHtml(c.badge_label)}</span></span>
      </div>
      ${c.email || c.telefono ? `<div class="rc-meta"><span class="muted small">${escapeHtml(c.email || c.telefono || '')}</span></div>` : ''}
    </a>
  `).join('') || `<div class="empty-state"><h3>Nessun cliente</h3><p class="muted">Aggiungine uno con "Nuovo cliente".</p></div>`;

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
          <th>ID</th><th>Nome</th><th>Email</th><th>Telefono</th>
          <th class="col-right">Saldo</th><th>Badge</th><th>Stato</th>
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
      { label: 'Dashboard', href: '/admin' },
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
      { label: 'Dashboard', href: '/admin' },
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

  const pagRows = pagamenti.map((p) => `
    <tr>
      <td class="muted num">#${p.id}</td>
      <td class="muted">${fmtDateTime(p.pagato_il)}</td>
      <td>${escapeHtml(p.servizio_nome || '—')}</td>
      <td class="col-right num">${p.servizio_ingressi ?? '—'}</td>
      <td class="col-right num">${fmtEurFromCent(p.importo_cent)}</td>
      <td>${escapeHtml(p.metodo || '—')}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted">Nessun pagamento registrato.</td></tr>`;

  const movRows = movimenti.map((m) => `
    <tr>
      <td class="muted num">#${m.id}</td>
      <td class="muted">${fmtDateTime(m.creato_il)}</td>
      <td class="col-right num"${m.delta < 0 ? ' style="color:var(--danger)"' : ''}>${m.delta > 0 ? '+' : ''}${m.delta}</td>
      <td>${escapeHtml(m.motivo)}</td>
      <td class="col-right num">${m.riferimento_id ?? '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted">Nessun movimento ingressi.</td></tr>`;

  const serviziOptions = servizi.map((s) =>
    `<option value="${s.id}">${escapeHtml(s.nome)} — ${s.ingressi} ingr. (${fmtEurFromCent(s.prezzo_cent)})</option>`
  ).join('');

  const statoBadge = cliente.attivo
    ? '<span class="badge badge-ok">Attivo</span>'
    : '<span class="badge badge-muted">Non attivo</span>';

  const body = `
    <header class="page-head">
      <p class="eyebrow">Cliente #${cliente.id}</p>
      <div class="row-between" style="margin-bottom:0">
        <h1>${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)} ${statoBadge}</h1>
        <div class="toolbar">
          <a class="btn" href="/admin/clienti">← Tutti i clienti</a>
        </div>
      </div>
    </header>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <div class="toolbar" style="margin-bottom:18px">
      <a class="btn" href="/admin/clienti/${cliente.id}/scheda/pdf">PDF scheda</a>
      <a class="btn" href="/admin/clienti/${cliente.id}/scheda/xlsx">XLSX scheda</a>
      <a class="btn" href="/admin/clienti/${cliente.id}/report/pdf">PDF report</a>
      <a class="btn" href="/admin/clienti/${cliente.id}/report/xlsx">XLSX report</a>
    </div>

    <section class="svc-stats">
      <div class="svc-stat">
        <p class="eyebrow">Saldo ingressi</p>
        <div class="v"${Number(cliente.saldo_ingressi) < 0 ? ' style="color:var(--danger)"' : ''}>${cliente.saldo_ingressi}</div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Badge</p>
        <div style="margin-top:8px"><span class="badge badge-${escapeHtml(cliente.badge_tone)}">${escapeHtml(cliente.badge_label)}</span></div>
      </div>
      <div class="svc-stat">
        <p class="eyebrow">Scheda</p>
        <div style="margin-top:8px">${schedaRiepilogo.ha_scheda
          ? (schedaRiepilogo.prossima_seduta ? '<span class="badge badge-ok">Seduta pronta</span>' : '<span class="badge badge-warn">Nessuna PROSSIMA</span>')
          : '<span class="badge badge-warn">Senza scheda</span>'}</div>
      </div>
    </section>

    <section class="grid grid-2">
      <div class="card">
        <h2>Anagrafica</h2>
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
        <form method="POST" action="/admin/clienti/${cliente.id}/toggle-attivo" style="margin-top:12px">
          <button type="submit" class="btn">${cliente.attivo ? 'Disattiva cliente' : 'Attiva cliente'}</button>
        </form>
      </div>

      <div class="card">
        <h2>Scheda allenamento</h2>
        ${schedaRiepilogo.ha_scheda
          ? `<p class="muted small">Blocchi: <strong>${schedaRiepilogo.blocchi_count}</strong> (${schedaRiepilogo.blocchi_archiviati} archiviati)
                 · Sedute: <strong>${schedaRiepilogo.sedute_totali}</strong>
                 (${schedaRiepilogo.sedute_completate} completate)</p>
             ${schedaRiepilogo.prossima_seduta
               ? `<p>Seduta PROSSIMA: <a href="/admin/sedute/${schedaRiepilogo.prossima_seduta.id}">#${schedaRiepilogo.prossima_seduta.id} — Settimana ${schedaRiepilogo.prossima_seduta.indice_settimana} · Seduta ${schedaRiepilogo.prossima_seduta.indice_seduta}</a></p>`
               : `<p><span class="badge badge-warn">Nessuna seduta PROSSIMA</span></p><p class="muted small">Il cliente non vedrà allenamento al check-in finché non ne imposti una.</p>`}
             <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Apri scheda completa</a>`
          : `<p><span class="badge badge-warn">Senza scheda</span></p><p class="muted small">Nessun blocco o seduta associata a questo cliente.</p>
             <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Crea blocco 4×5</a>`}

        <h2 style="margin-top:24px">Password cliente</h2>
        <form method="POST" action="/admin/clienti/${cliente.id}/password" class="form-stacked">
          <label>Nuova password <input name="password" type="text" required></label>
          <div class="toolbar"><button type="submit" class="btn btn-primary">Imposta password</button></div>
        </form>
        <p class="muted small">Verrà salvata come hash bcrypt.</p>
      </div>
    </section>

    <section class="section-gap">
      <h2>Registra pagamento</h2>
      <form method="POST" action="/admin/clienti/${cliente.id}/pagamenti" class="card form-inline">
        <label>Servizio
          <select name="servizio_id" required>
            <option value="">— seleziona —</option>
            ${serviziOptions}
          </select>
        </label>
        <label>Importo (cent) <input name="importo_cent" type="number" min="0" placeholder="listino"></label>
        <label>Metodo <input name="metodo" placeholder="contanti, bonifico..."></label>
        <label>Note <input name="note"></label>
        <button type="submit" class="btn btn-primary">Registra pagamento</button>
      </form>
    </section>

    <section class="section-gap">
      <h2>Pagamenti</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>ID</th><th>Data</th><th>Servizio</th><th class="col-right">Ingressi</th><th class="col-right">Importo</th><th>Metodo</th></tr></thead>
          <tbody>${pagRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section-gap">
      <h2>Movimenti ingressi</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>ID</th><th>Data</th><th class="col-right">Δ</th><th>Motivo</th><th class="col-right">Rif.</th></tr></thead>
          <tbody>${movRows}</tbody>
        </table>
      </div>
    </section>
  `;

  res.send(adminLayout({
    title: `${cliente.cognome} ${cliente.nome}`,
    user: req.admin,
    active: '/admin/clienti',
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
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
  const { servizio_id, importo_cent, metodo, note } = req.body || {};
  try {
    const result = pagamentiService.registraPagamento({
      clienteId: id,
      servizioId: parseInt(servizio_id, 10),
      importoCent: importo_cent ? parseInt(importo_cent, 10) : undefined,
      metodo,
      note,
      adminId: req.admin && req.admin.id ? req.admin.id : null,
    });
    const msg = `Pagamento registrato. Ingressi aggiunti: ${result.ingressi}. Nuovo saldo: ${result.nuovoSaldo}.`;
    return backWithMsg(res, `/admin/clienti/${id}`, msg, 'ok');
  } catch (e) {
    console.error(e);
    const msg = e.message || 'Errore registrazione pagamento.';
    return backWithMsg(res, `/admin/clienti/${id}`, msg, 'err');
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
      <td>
        <form method="POST" action="/admin/servizi/${s.id}" class="svc-edit" data-cents>
          <input name="nome" value="${escapeHtml(s.nome)}" required aria-label="Nome">
          <input name="descrizione" value="${escapeHtml(s.descrizione || '')}" placeholder="—" aria-label="Descrizione">
          <input name="ingressi" type="number" min="0" value="${s.ingressi}" class="w-narrow" aria-label="Ingressi">
          <input type="number" min="0" step="0.01" value="${(Number(s.prezzo_cent || 0) / 100).toFixed(2)}" class="w-price js-eur" aria-label="Prezzo in euro">
          <input type="hidden" name="prezzo_cent" value="${s.prezzo_cent}" class="js-cent">
          <button type="submit" class="btn small">Salva</button>
        </form>
      </td>
      <td class="hide-mobile">${s.descrizione ? escapeHtml(s.descrizione) : '<span class="muted">—</span>'}</td>
      <td class="num">${s.ingressi}</td>
      <td class="num">${fmtEurFromCent(s.prezzo_cent)}</td>
      <td>${s.attivo ? '<span class="badge badge-ok">Attivo</span>' : '<span class="badge badge-muted">Disattivato</span>'}</td>
      <td class="col-right">
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
          <label class="field">Ingressi <input name="ingressi" type="number" min="0" value="1" required></label>
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
        <thead><tr><th>ID</th><th>Servizio</th><th>Descrizione</th><th>Ingressi</th><th>Prezzo</th><th>Stato</th><th class="col-right">Azioni</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">Nessun servizio.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>

    <script>
      // Converte il prezzo in euro (visibile) nel campo nascosto in centesimi prima dell'invio.
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
    </script>
  `;

  res.send(adminLayout({
    title: 'Servizi',
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Servizi' },
    ],
  }));
});

// Crea servizio
router.post('/servizi', express.urlencoded({ extended: false }), (req, res) => {
  const { nome, descrizione, ingressi, prezzo_cent, attivo } = req.body || {};
  try {
    const id = serviziService.createServizio({
      nome,
      descrizione,
      ingressi: parseInt(ingressi, 10),
      prezzoCent: parseInt(prezzo_cent, 10),
      attivo: attivo === '0' ? 0 : 1,
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
  const { nome, descrizione, ingressi, prezzo_cent, attivo } = req.body || {};
  try {
    serviziService.updateServizio(id, {
      nome,
      descrizione,
      ingressi: ingressi === undefined ? undefined : parseInt(ingressi, 10),
      prezzoCent: prezzo_cent === undefined ? undefined : parseInt(prezzo_cent, 10),
      attivo: attivo === undefined ? undefined : (attivo === '1' ? 1 : 0),
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

module.exports = router;

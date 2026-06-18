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

// -------------------------------------------------------------
// Helpers HTTP
// -------------------------------------------------------------
function wantsHtml(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtEurFromCent(cent) {
  const n = Number(cent || 0) / 100;
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function fmtDate(iso) {
  if (!iso) return '';
  // iso tipo 'YYYY-MM-DD HH:MM:SS' oppure ISO completo
  return iso.replace('T', ' ').slice(0, 16);
}

// Layout admin condiviso (STEP 9)
const { adminLayout } = require('../views/adminLayout');

function alertBlock(kind, msg) {
  if (!msg) return '';
  return `<div class="alert alert-${escapeHtml(kind)}">${escapeHtml(msg)}</div>`;
}

function backWithMsg(res, base, msg, kind = 'ok') {
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(303, `${base}${sep}${kind}=${encodeURIComponent(msg)}`);
}

// -------------------------------------------------------------
// HEALTH HTML placeholder route (niente duplicato con /health JSON)
// -------------------------------------------------------------

// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------
router.get('/', (req, res) => {
  let nonLettiBadge = '';
  try {
    const n = require('../services/bacheca.service').countNonLetti();
    if (n > 0) nonLettiBadge = ` <span class="badge badge-warn">${n} non letti</span>`;
  } catch (_) {}

  let revisioniBadge = '';
  try {
    const r = require('../services/revisioni.service').countDaRevisionare();
    if (r > 0) revisioniBadge = ` <span class="badge badge-warn">${r} da revisionare</span>`;
  } catch (_) {}

  const body = `
    <header class="page-head">
      <p class="eyebrow">Accademia · Élite Training Club</p>
      <h1>Bacheca operativa</h1>
      <p class="muted">Ciao ${escapeHtml(req.admin.username)}, ecco il centro di controllo dell'Accademia.</p>
    </header>
    <section class="grid grid-3">
      <a class="card card-link" href="/admin/clienti">
        <h2>Clienti</h2>
        <p class="muted small">Anagrafica, stato, saldo ingressi e pagamenti.</p>
      </a>
      <a class="card card-link" href="/admin/servizi">
        <h2>Servizi</h2>
        <p class="muted small">Pacchetti ingressi e listino prezzi.</p>
      </a>
      <a class="card card-link" href="/admin/nfc">
        <h2>Tessere</h2>
        <p class="muted small">Assegna e gestisci le tessere NFC dei clienti.</p>
      </a>
      <a class="card card-link" href="/admin/nfc/simulatore">
        <h2>Prova check-in</h2>
        <p class="muted small">Simula la lettura di una tessera dal browser.</p>
      </a>
      <a class="card card-link" href="/admin/bacheca">
        <h2>Avvisi${nonLettiBadge}</h2>
        <p class="muted small">Eventi recenti e segnalazioni da gestire.</p>
      </a>
      <a class="card card-link" href="/admin/schede">
        <h2>Schede</h2>
        <p class="muted small">Programmi di allenamento: blocchi, sedute ed esercizi.</p>
      </a>
      <a class="card card-link" href="/admin/revisioni">
        <h2>Revisioni${revisioniBadge}</h2>
        <p class="muted small">Allenamenti completati dai clienti, da rivedere.</p>
      </a>
      <a class="card card-link" href="/admin/export">
        <h2>Export e stampe</h2>
        <p class="muted small">Genera PDF e XLSX; la stampa avviene dal PDF.</p>
      </a>
      <a class="card card-link" href="/admin/backup">
        <h2>Backup</h2>
        <p class="muted small">Copie di sicurezza del database, manuali e automatiche.</p>
      </a>
    </section>
  `;
  res.send(adminLayout({
    title: 'Bacheca operativa',
    user: req.admin,
    active: '/admin',
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
  const rows = clienti.map((c) => `
    <tr>
      <td><a href="/admin/clienti/${c.id}">#${c.id}</a></td>
      <td>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</td>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(c.telefono || '')}</td>
      <td><strong>${c.saldo_ingressi}</strong></td>
      <td><span class="badge badge-${escapeHtml(c.badge_tone)}">${escapeHtml(c.badge_label)}</span></td>
      <td>${c.attivo ? '<span class="badge badge-ok">Attivo</span>' : '<span class="badge badge-danger">Disattivo</span>'}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="muted">Nessun cliente.</td></tr>`;

  const body = `
    <div class="page-header">
      <div class="page-head">
        <p class="eyebrow">Anagrafica</p>
        <h1>Clienti</h1>
        <p class="muted">Stato, saldo ingressi e pagamenti dei tesserati.</p>
      </div>
      <div class="toolbar">
        <a class="btn btn-primary" href="/admin/clienti/nuovo">+ Nuovo cliente</a>
      </div>
    </div>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <form method="GET" action="/admin/clienti" class="filter-bar">
      <input type="text" name="q" placeholder="Cerca per nome, cognome, email, telefono" value="${escapeHtml(q)}">
      <button type="submit" class="btn">Cerca</button>
    </form>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>ID</th><th>Nome</th><th>Email</th><th>Telefono</th>
          <th>Saldo</th><th>Badge</th><th>Stato</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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
      <td>${p.id}</td>
      <td>${fmtDate(p.pagato_il)}</td>
      <td>${escapeHtml(p.servizio_nome || '—')}</td>
      <td>${p.servizio_ingressi ?? '—'}</td>
      <td>${fmtEurFromCent(p.importo_cent)}</td>
      <td>${escapeHtml(p.metodo || '')}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted">Nessun pagamento.</td></tr>`;

  const movRows = movimenti.map((m) => `
    <tr>
      <td>${m.id}</td>
      <td>${fmtDate(m.creato_il)}</td>
      <td>${m.delta > 0 ? '+' : ''}${m.delta}</td>
      <td>${escapeHtml(m.motivo)}</td>
      <td>${m.riferimento_id ?? '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted">Nessun movimento.</td></tr>`;

  const serviziOptions = servizi.map((s) =>
    `<option value="${s.id}">${escapeHtml(s.nome)} — ${s.ingressi} ingr. (${fmtEurFromCent(s.prezzo_cent)})</option>`
  ).join('');

  const body = `
    <div class="page-header">
      <div class="page-head">
        <p class="eyebrow">Scheda cliente · #${cliente.id}</p>
        <h1>${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)}</h1>
      </div>
      <div class="toolbar">
        <a class="btn" href="/admin/clienti">← Tutti i clienti</a>
      </div>
    </div>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <div class="filter-bar">
      <a class="btn btn-subtle" href="/admin/clienti/${cliente.id}/scheda/pdf">PDF scheda</a>
      <a class="btn btn-subtle" href="/admin/clienti/${cliente.id}/scheda/xlsx">XLSX scheda</a>
      <a class="btn btn-subtle" href="/admin/clienti/${cliente.id}/report/pdf">PDF report cliente</a>
      <a class="btn btn-subtle" href="/admin/clienti/${cliente.id}/report/xlsx">XLSX report cliente</a>
    </div>

    <section class="grid grid-3">
      <div class="card">
        <h2>Stato</h2>
        <p>Saldo ingressi: <strong>${cliente.saldo_ingressi}</strong></p>
        <p>Badge: <span class="badge badge-${escapeHtml(cliente.badge_tone)}">${escapeHtml(cliente.badge_label)}</span></p>
        <p>Attivo: ${cliente.attivo ? '<span class="badge badge-ok">Sì</span>' : '<span class="badge badge-danger">No</span>'}</p>
        <form method="POST" action="/admin/clienti/${cliente.id}/toggle-attivo" style="display:inline">
          <button type="submit" class="btn">${cliente.attivo ? 'Disattiva' : 'Attiva'}</button>
        </form>
      </div>

      <div class="card">
        <h2>Anagrafica</h2>
        <form method="POST" action="/admin/clienti/${cliente.id}">
          <label>Nome <input name="nome" value="${escapeHtml(cliente.nome)}" required></label>
          <label>Cognome <input name="cognome" value="${escapeHtml(cliente.cognome)}" required></label>
          <label>Email <input name="email" type="email" value="${escapeHtml(cliente.email || '')}"></label>
          <label>Telefono <input name="telefono" value="${escapeHtml(cliente.telefono || '')}"></label>
          <label>Note <textarea name="note" rows="2">${escapeHtml(cliente.note || '')}</textarea></label>
          <label>Stato
            <select name="attivo">
              <option value="1" ${cliente.attivo ? 'selected' : ''}>Attivo</option>
              <option value="0" ${!cliente.attivo ? 'selected' : ''}>Disattivo</option>
            </select>
          </label>
          <button type="submit" class="btn btn-primary">Salva anagrafica</button>
        </form>
      </div>

      <div class="card">
        <h2>Scheda allenamento</h2>
        ${schedaRiepilogo.ha_scheda
          ? `<p>Blocchi: <strong>${schedaRiepilogo.blocchi_count}</strong> (${schedaRiepilogo.blocchi_archiviati} archiviati)
                 · Sedute: <strong>${schedaRiepilogo.sedute_totali}</strong>
                 (${schedaRiepilogo.sedute_completate} completate)</p>
             ${schedaRiepilogo.prossima_seduta
               ? `<p>Seduta PROSSIMA: <a href="/admin/sedute/${schedaRiepilogo.prossima_seduta.id}">#${schedaRiepilogo.prossima_seduta.id} — Settimana ${schedaRiepilogo.prossima_seduta.indice_settimana} · Seduta ${schedaRiepilogo.prossima_seduta.indice_seduta}</a></p>`
               : `<p><span class="badge badge-warn">Nessuna seduta PROSSIMA</span> Il cliente non vedrà allenamento al check-in finché non ne imposti una.</p>`}
             <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Apri scheda completa</a>`
          : `<p><span class="badge badge-warn">Senza scheda</span> Nessun blocco o seduta associata a questo cliente.</p>
             <a class="btn btn-primary" href="/admin/clienti/${cliente.id}/scheda">Crea blocco 4×5</a>`}
      </div>

      <div class="card">
        <h2>Password cliente</h2>
        <form method="POST" action="/admin/clienti/${cliente.id}/password">
          <label>Nuova password <input name="password" type="text" required></label>
          <button type="submit" class="btn btn-primary">Imposta password</button>
        </form>
        <p class="muted small">Verrà salvata come hash bcrypt.</p>
      </div>
    </section>

    <h2 class="section-gap">Registra pagamento</h2>
    <form method="POST" action="/admin/clienti/${cliente.id}/pagamenti" class="card form-inline">
      <label>Servizio
        <select name="servizio_id" required>
          <option value="">— seleziona —</option>
          ${serviziOptions}
        </select>
      </label>
      <label>Importo
        <span class="field-euro">
          <input type="text" inputmode="decimal" data-euro data-euro-target="importo_cent_pag" placeholder="listino">
        </span>
        <input type="hidden" name="importo_cent" id="importo_cent_pag">
      </label>
      <label>Metodo <input name="metodo" placeholder="contanti, bonifico..."></label>
      <label>Note <input name="note"></label>
      <button type="submit" class="btn btn-primary">Registra pagamento</button>
    </form>

    <h2 class="section-gap">Pagamenti</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>ID</th><th>Data</th><th>Servizio</th><th>Ingressi</th><th>Importo</th><th>Metodo</th></tr></thead>
        <tbody>${pagRows}</tbody>
      </table>
    </div>

    <h2 class="section-gap">Movimenti ingressi</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>ID</th><th>Data</th><th>Δ</th><th>Motivo</th><th>Rif.</th></tr></thead>
        <tbody>${movRows}</tbody>
      </table>
    </div>
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
  const rows = servizi.map((s) => `
    <tr>
      <td>${s.id}</td>
      <td>
        <form method="POST" action="/admin/servizi/${s.id}" class="inline-form">
          <input name="nome" value="${escapeHtml(s.nome)}" required>
          <input name="descrizione" value="${escapeHtml(s.descrizione || '')}" placeholder="descrizione">
          <input name="ingressi" type="number" min="0" value="${s.ingressi}" class="w-serie" aria-label="Ingressi">
          <span class="field-euro">
            <input type="text" inputmode="decimal" data-euro data-euro-target="srv_prezzo_${s.id}" class="w-carico" aria-label="Prezzo in euro">
          </span>
          <input type="hidden" name="prezzo_cent" id="srv_prezzo_${s.id}" value="${s.prezzo_cent}">
          <button type="submit" class="btn btn-sm">Salva</button>
        </form>
      </td>
      <td>${s.attivo ? '<span class="badge badge-ok">Attivo</span>' : '<span class="badge badge-danger">Disattivo</span>'}</td>
      <td>
        <form method="POST" action="/admin/servizi/${s.id}/toggle-attivo" style="display:inline">
          <button type="submit" class="btn btn-ghost">${s.attivo ? 'Disattiva' : 'Attiva'}</button>
        </form>
      </td>
    </tr>
  `).join('');

  const body = `
    <header class="page-head">
      <p class="eyebrow">Listino</p>
      <h1>Servizi</h1>
      <p class="muted">Pacchetti ingressi e prezzi. Gli importi sono in euro.</p>
    </header>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <h2>Nuovo servizio</h2>
    <form method="POST" action="/admin/servizi" class="card form-inline">
      <label>Nome <input name="nome" required></label>
      <label>Descrizione <input name="descrizione"></label>
      <label>Ingressi <input name="ingressi" type="number" min="0" value="1" required></label>
      <label>Prezzo
        <span class="field-euro">
          <input type="text" inputmode="decimal" data-euro data-euro-target="srv_prezzo_new" placeholder="0,00" required>
        </span>
        <input type="hidden" name="prezzo_cent" id="srv_prezzo_new" value="0">
      </label>
      <label>Stato
        <select name="attivo">
          <option value="1" selected>Attivo</option>
          <option value="0">Disattivo</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary">Crea servizio</button>
    </form>

    <h2 class="section-gap">Listino</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>ID</th><th>Servizio</th><th>Stato</th><th>Azioni</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">Nessun servizio.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  res.send(adminLayout({
    title: 'Servizi',
    user: req.admin,
    active: '/admin/servizi',
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

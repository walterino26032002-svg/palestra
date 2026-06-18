'use strict';

/**
 * Route schede allenamento lato admin.
 * Tutte protette da requireAdmin (montate in server.js sotto /admin).
 *
 * Endpoints:
 *   GET  /admin/clienti/:id/scheda                      - pagina principale
 *   POST /admin/clienti/:id/blocchi                     - crea blocco (default o custom)
 *   POST /admin/blocchi/:id                             - modifica blocco
 *   POST /admin/blocchi/:id/archivia                    - toggle archiviato
 *   GET  /admin/sedute/:id                              - editor seduta (stile Excel)
 *   POST /admin/sedute/:id/stato                        - cambia stato (BOZZA/PROSSIMA/COMPLETATA/SALTATA)
 *   POST /admin/sedute/:id/prossima                     - marca PROSSIMA (unicità)
 *   POST /admin/sedute/:id/esercizi                     - aggiungi esercizio
 *   POST /admin/sedute/:id/esercizi/copia-da            - copia esercizi da un'altra seduta
 *   POST /admin/esercizi/:id                            - modifica esercizio
 *   POST /admin/esercizi/:id/delete                     - elimina esercizio
 *   POST /admin/sedute/:id/esercizi/reorder             - riordina (accetta JSON)
 */

const express = require('express');

const clientiService    = require('../services/clienti.service');
const blocchiService    = require('../services/blocchi.service');
const seduteService     = require('../services/sedute.service');
const eserciziService   = require('../services/esercizi.service');
const schedeService     = require('../services/schede.service');
const revisioniService  = require('../services/revisioni.service');

const router = express.Router();

// =====================================================================
// Helpers
// =====================================================================
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function alertBlock(kind, msg) {
  if (!msg) return '';
  return `<div class="alert alert-${escapeHtml(kind)}">${escapeHtml(msg)}</div>`;
}

function backWithMsg(res, base, msg, kind = 'ok') {
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(303, `${base}${sep}${kind}=${encodeURIComponent(msg)}`);
}

function wantsHtml(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

const { adminLayout } = require('../views/adminLayout');

function statoBadge(stato) {
  const map = {
    BOZZA:      'muted',
    PROSSIMA:   'ok',
    COMPLETATA: 'ok',
    SALTATA:    'danger',
  };
  const tone = map[stato] || 'muted';
  return `<span class="badge badge-${tone}">${escapeHtml(stato)}</span>`;
}

// =====================================================================
// ELENCO SCHEDE (clienti con link alla rispettiva scheda)
// =====================================================================
router.get('/schede', (req, res) => {
  const q = req.query.q || '';
  const clienti = clientiService.listClienti({ q });
  const rows = clienti.map((c) => {
    const r = schedeService.riepilogoCliente(c.id);
    const prossima = r.prossima_seduta
      ? `<a href="/admin/sedute/${r.prossima_seduta.id}">#${r.prossima_seduta.id}</a>`
      : '<span class="muted">—</span>';
    return `<tr>
      <td><a href="/admin/clienti/${c.id}">#${c.id}</a></td>
      <td>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</td>
      <td>${r.ha_scheda ? `${r.blocchi_count} blocchi · ${r.sedute_totali} sedute` : '<span class="badge badge-warn">Senza scheda</span>'}</td>
      <td>${prossima}</td>
      <td><a class="btn" href="/admin/clienti/${c.id}/scheda">Apri scheda</a></td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">Nessun cliente.</td></tr>`;

  const body = `
    <h1>Schede allenamento</h1>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <form method="GET" action="/admin/schede" class="filter-bar">
      <input type="text" name="q" placeholder="Cerca cliente" value="${escapeHtml(q)}">
      <button type="submit" class="btn">Cerca</button>
    </form>
    <table class="table">
      <thead><tr><th>ID</th><th>Cliente</th><th>Scheda</th><th>PROSSIMA</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  res.send(adminLayout({
    title: 'Schede',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Schede' }],
  }));
});

// =====================================================================
// PAGINA SCHEDA CLIENTE
// =====================================================================
router.get('/clienti/:id(\\d+)/scheda', (req, res) => {
  const clienteId = parseInt(req.params.id, 10);
  const cliente = clientiService.getCliente(clienteId);
  if (!cliente) return backWithMsg(res, '/admin/clienti', 'Cliente non trovato.', 'err');

  const riepilogo = schedeService.riepilogoCliente(clienteId);

  const blocchiHtml = riepilogo.blocchi.length === 0
    ? `<div class="card muted">Nessun blocco. Clicca "Crea blocco 4 settimane" per iniziare (20 sedute BOZZA).</div>`
    : riepilogo.blocchi.map((b) => {
        const sedute = seduteService.listSeduteBlocco(b.id);
        const gruppi = {};
        for (const s of sedute) {
          const key = `Settimana ${s.indice_settimana}`;
          if (!gruppi[key]) gruppi[key] = [];
          gruppi[key].push(s);
        }
        const gridSettimane = Object.keys(gruppi).sort().map((sett) => `
          <div class="settimana">
            <h3 style="margin:8px 0">${escapeHtml(sett)}</h3>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
              ${gruppi[sett].map((s) => `
                <a class="card seduta-card" href="/admin/sedute/${s.id}">
                  <div><strong>Seduta ${s.indice_seduta}</strong></div>
                  <div>${statoBadge(s.stato)}</div>
                  <div class="muted small">${s.esercizi_count || 0} esercizi</div>
                  ${s.titolo ? `<div class="muted small">${escapeHtml(s.titolo)}</div>` : ''}
                </a>
              `).join('')}
            </div>
          </div>
        `).join('');

        return `
          <div class="card" style="margin-bottom:12px">
            <div class="row-between">
              <div>
                <h2 style="margin:0">${escapeHtml(b.nome)} <span class="muted small">(${b.sedute_totali} sedute)</span></h2>
                <p class="muted small">Dal ${escapeHtml(b.data_inizio)} · ${b.sedute_completate}/${b.sedute_totali} completate · ${b.sedute_saltate || 0} saltate${b.archiviato ? ' · <span class="badge badge-muted">archiviato</span>' : ''}</p>
              </div>
              <form method="POST" action="/admin/blocchi/${b.id}/archivia" style="display:inline">
                <button type="submit" class="btn btn-ghost">${b.archiviato ? 'Ripristina' : 'Archivia'}</button>
              </form>
            </div>
            ${gridSettimane}
          </div>
        `;
      }).join('');

  const prossimaBox = riepilogo.prossima_seduta
    ? `<div class="alert alert-ok">Seduta PROSSIMA: <strong>#${riepilogo.prossima_seduta.id}</strong> — <a href="/admin/sedute/${riepilogo.prossima_seduta.id}">apri editor</a></div>`
    : `<div class="alert alert-error">Nessuna seduta PROSSIMA. Il cliente NON vedrà allenamento al check-in finché non ne imposti una.</div>`;

  const body = `
    <div class="row-between">
      <h1>Scheda — ${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)} <span class="muted small">#${cliente.id}</span></h1>
      <div>
        <a class="btn" href="/admin/clienti/${cliente.id}">← Dettaglio cliente</a>
      </div>
    </div>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    ${prossimaBox}

    <h2>Crea blocco</h2>
    <form method="POST" action="/admin/clienti/${cliente.id}/blocchi" class="card form-inline">
      <label>Nome blocco <input name="nome" placeholder="es. Blocco Forza 1" required></label>
      <label>Data inizio <input name="data_inizio" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
      <label>Settimane <input name="settimane" type="number" min="1" value="4" required></label>
      <label>Sedute/sett. <input name="sedute_per_settimana" type="number" min="1" value="5" required></label>
      <button type="submit" class="btn btn-primary">Crea blocco (4×5 = 20 sedute BOZZA)</button>
    </form>

    <h2 style="margin-top:24px">Blocchi</h2>
    ${blocchiHtml}
  `;

  res.send(adminLayout({
    title: `Scheda — ${cliente.cognome} ${cliente.nome}`,
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Clienti', href: '/admin/clienti' },
      { label: `${cliente.cognome} ${cliente.nome}`, href: `/admin/clienti/${cliente.id}` },
      { label: 'Scheda' },
    ],
  }));
});

// POST /admin/clienti/:id/blocchi
router.post('/clienti/:id(\\d+)/blocchi', express.urlencoded({ extended: false }), (req, res) => {
  const clienteId = parseInt(req.params.id, 10);
  const { nome, data_inizio, settimane, sedute_per_settimana } = req.body || {};
  try {
    const id = blocchiService.createBlocco({
      clienteId,
      nome: nome || 'Blocco',
      dataInizio: data_inizio || null,
      settimane: parseInt(settimane, 10),
      sedutePerSettimana: parseInt(sedute_per_settimana, 10),
    });
    return backWithMsg(res, `/admin/clienti/${clienteId}/scheda`, `Blocco #${id} creato con 20 sedute BOZZA.`, 'ok');
  } catch (e) {
    if (e.code === 'validation' || e.code === 'not_found') {
      return backWithMsg(res, `/admin/clienti/${clienteId}/scheda`, e.message, 'err');
    }
    console.error(e);
    return backWithMsg(res, `/admin/clienti/${clienteId}/scheda`, 'Errore creazione blocco.', 'err');
  }
});

// POST /admin/blocchi/:id
router.post('/blocchi/:id(\\d+)', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, data_inizio, settimane, sedute_per_settimana, archiviato } = req.body || {};
  try {
    blocchiService.updateBlocco(id, {
      nome,
      dataInizio: data_inizio || null,
      settimane: settimane === undefined ? undefined : parseInt(settimane, 10),
      sedutePerSettimana: sedute_per_settimana === undefined ? undefined : parseInt(sedute_per_settimana, 10),
      archiviato: archiviato === undefined ? undefined : (archiviato === '1' ? 1 : 0),
    });
    // torna alla pagina della scheda del cliente associato al blocco
    const blocco = blocchiService.getBlocco(id);
    return backWithMsg(res, `/admin/clienti/${blocco.cliente_id}/scheda`, 'Blocco aggiornato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/clienti', 'Errore aggiornamento blocco.', 'err');
  }
});

// POST /admin/blocchi/:id/archivia
router.post('/blocchi/:id(\\d+)/archivia', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    blocchiService.toggleArchiviato(id);
    const blocco = blocchiService.getBlocco(id);
    return backWithMsg(res, `/admin/clienti/${blocco.cliente_id}/scheda`, 'Stato archivio aggiornato.', 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/clienti', 'Errore.', 'err');
  }
});

// =====================================================================
// EDITOR SEDUTA (stile Excel)
// =====================================================================
router.get('/sedute/:id(\\d+)', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const seduta = seduteService.getSeduta(id);
  if (!seduta) return backWithMsg(res, '/admin/clienti', 'Seduta non trovata.', 'err');
  const cliente = clientiService.getCliente(seduta.cliente_id);
  const esercizi = eserciziService.listEserciziSeduta(id);

  const esRows = esercizi.map((ex) => `
    <tr data-id="${ex.id}">
      <td class="ord">${ex.ordine}</td>
      <td><input name="nome" value="${escapeHtml(ex.nome)}" required></td>
      <td><input name="serie" type="number" min="0" value="${ex.serie ?? ''}" style="width:60px"></td>
      <td><input name="ripetizioni" value="${escapeHtml(ex.ripetizioni || '')}" style="width:80px"></td>
      <td><input name="carico" value="${escapeHtml(ex.carico || '')}" style="width:90px"></td>
      <td><input name="recupero" value="${escapeHtml(ex.recupero || '')}" style="width:80px"></td>
      <td><input name="note" value="${escapeHtml(ex.note || '')}"></td>
      <td class="nowrap">
        <button type="button" class="btn btn-ghost small js-up">↑</button>
        <button type="button" class="btn btn-ghost small js-down">↓</button>
        <button type="button" class="btn btn-primary small js-save">Salva</button>
        <button type="button" class="btn btn-danger small js-del">Elimina</button>
      </td>
    </tr>
  `).join('') || `<tr class="empty"><td colspan="8" class="muted">Nessun esercizio. Aggiungi il primo con il form sotto.</td></tr>`;

  const prossimaDisabled = seduta.stato === 'PROSSIMA' ? 'disabled' : '';
  const statoOptions = seduteService.STATI.map((s) =>
    `<option value="${s}" ${s === seduta.stato ? 'selected' : ''}>${s}</option>`
  ).join('');

  const body = `
    <div class="row-between">
      <h1>Seduta #${seduta.id} — Settimana ${seduta.indice_settimana} · Seduta ${seduta.indice_seduta} ${statoBadge(seduta.stato)}</h1>
      <div>
        <a class="btn" href="/admin/sedute/${seduta.id}/pdf">PDF seduta</a>
        <a class="btn" href="/admin/clienti/${seduta.cliente_id}/scheda">← Scheda cliente</a>
      </div>
    </div>

    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="card">
      <div class="row-between">
        <div>
          <p class="muted small">Blocco: <strong>${escapeHtml(seduta.blocco_nome)}</strong> · Cliente: <a href="/admin/clienti/${seduta.cliente_id}">${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)}</a></p>
          ${seduta.titolo ? `<p>${escapeHtml(seduta.titolo)}</p>` : ''}
        </div>
        <div>
          <form method="POST" action="/admin/sedute/${seduta.id}/prossima" style="display:inline">
            <button type="submit" class="btn btn-primary" ${prossimaDisabled}>Imposta come PROSSIMA</button>
          </form>
        </div>
      </div>

      <form method="POST" action="/admin/sedute/${seduta.id}/stato" class="form-inline" style="margin-top:8px">
        <label>Stato
          <select name="stato">${statoOptions}</select>
        </label>
        <label>Titolo <input name="titolo" value="${escapeHtml(seduta.titolo || '')}"></label>
        <button type="submit" class="btn">Aggiorna stato</button>
      </form>
    </section>

    <h2 style="margin-top:20px">Esercizi</h2>
    <div class="card" style="overflow-x:auto">
      <table class="table excel-table" id="eserciziTable">
        <thead><tr>
          <th>#</th>
          <th>Nome</th>
          <th>Serie</th>
          <th>Reps</th>
          <th>Carico</th>
          <th>Recupero</th>
          <th>Note</th>
          <th>Azioni</th>
        </tr></thead>
        <tbody>${esRows}</tbody>
      </table>
    </div>

    <h3 style="margin-top:20px">Aggiungi esercizio</h3>
    <form method="POST" action="/admin/sedute/${seduta.id}/esercizi" class="card form-inline">
      <label>Nome * <input name="nome" required></label>
      <label>Serie <input name="serie" type="number" min="0"></label>
      <label>Reps <input name="ripetizioni" placeholder="8-10"></label>
      <label>Carico <input name="carico" placeholder="60kg"></label>
      <label>Recupero <input name="recupero" placeholder="90s"></label>
      <label>Note <input name="note"></label>
      <button type="submit" class="btn btn-primary">Aggiungi</button>
    </form>

    <h3 style="margin-top:20px">Copia esercizi da un'altra seduta</h3>
    <form method="POST" action="/admin/sedute/${seduta.id}/esercizi/copia-da" class="card form-inline">
      <label>ID seduta sorgente
        <input name="da_seduta_id" type="number" min="1" required>
      </label>
      <button type="submit" class="btn">Copia (sovrascrive esercizi attuali)</button>
    </form>

    <script>
      (function () {
        const sedutaId = ${seduta.id};
        const tbody = document.querySelector('#eserciziTable tbody');

        function serializeRow(tr) {
          const inputs = tr.querySelectorAll('input');
          const out = {};
          inputs.forEach((i) => out[i.name] = i.value);
          out.serie = out.serie === '' ? null : parseInt(out.serie, 10);
          return out;
        }

        tbody.addEventListener('click', async (ev) => {
          const tr = ev.target.closest('tr[data-id]');
          if (!tr) return;
          const id = tr.getAttribute('data-id');
          if (ev.target.classList.contains('js-save')) {
            const body = serializeRow(tr);
            const r = await fetch('/admin/esercizi/' + id, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!j.ok) alert('Errore: ' + (j.error || 'salvataggio fallito'));
          }
          if (ev.target.classList.contains('js-del')) {
            if (!confirm('Eliminare questo esercizio?')) return;
            const r = await fetch('/admin/esercizi/' + id + '/delete', { method: 'POST' });
            const j = await r.json();
            if (j.ok) tr.remove();
            else alert('Errore');
          }
          if (ev.target.classList.contains('js-up') || ev.target.classList.contains('js-down')) {
            const other = ev.target.classList.contains('js-up') ? tr.previousElementSibling : tr.nextElementSibling;
            if (!other || !other.dataset.id) return;
            const ids = Array.from(tbody.querySelectorAll('tr[data-id]')).map((r) => parseInt(r.dataset.id, 10));
            const idx = ids.indexOf(parseInt(id, 10));
            const swapWith = ev.target.classList.contains('js-up') ? idx - 1 : idx + 1;
            if (swapWith < 0 || swapWith >= ids.length) return;
            [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
            const r = await fetch('/admin/sedute/' + sedutaId + '/esercizi/reorder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ordine_ids: ids }),
            });
            const j = await r.json();
            if (j.ok) location.reload();
            else alert('Errore riordino');
          }
        });
      })();
    </script>
  `;

  res.send(adminLayout({
    title: `Seduta #${seduta.id}`,
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Clienti', href: '/admin/clienti' },
      { label: `${cliente.cognome} ${cliente.nome}`, href: `/admin/clienti/${cliente.id}` },
      { label: 'Scheda', href: `/admin/clienti/${cliente.id}/scheda` },
      { label: `Seduta #${seduta.id}` },
    ],
  }));
});

// =====================================================================
// STATI / PROSSIMA
// =====================================================================
router.post('/sedute/:id(\\d+)/stato', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { stato, titolo } = req.body || {};
  try {
    seduteService.setStatoSeduta(id, stato);
    // aggiorna titolo separatamente
    if (typeof titolo === 'string') {
      const db = require('../db/connection').getDb();
      db.prepare('UPDATE sedute SET titolo = ?, aggiornata_il = datetime(\'now\') WHERE id = ?')
        .run(titolo.trim() || null, id);
    }
    return backWithMsg(res, `/admin/sedute/${id}`, 'Stato aggiornato.', 'ok');
  } catch (e) {
    if (e.code === 'not_found' || e.code === 'validation') {
      return backWithMsg(res, `/admin/sedute/${id}`, e.message, 'err');
    }
    console.error(e);
    return backWithMsg(res, `/admin/sedute/${id}`, 'Errore aggiornamento stato.', 'err');
  }
});

router.post('/sedute/:id(\\d+)/prossima', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    seduteService.setProssima(id);
    return backWithMsg(res, `/admin/sedute/${id}`, 'Seduta impostata come PROSSIMA.', 'ok');
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/clienti', 'Seduta non trovata.', 'err');
    console.error(e);
    return backWithMsg(res, `/admin/sedute/${id}`, 'Errore.', 'err');
  }
});

// =====================================================================
// ESERCIZI
// =====================================================================
router.post('/sedute/:id(\\d+)/esercizi', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, serie, ripetizioni, carico, recupero, note } = req.body || {};
  try {
    const newId = eserciziService.addEsercizio({
      sedutaId: id, nome, serie, ripetizioni, carico, recupero, note,
    });
    return backWithMsg(res, `/admin/sedute/${id}`, `Esercizio #${newId} aggiunto.`, 'ok');
  } catch (e) {
    if (e.code === 'validation' || e.code === 'not_found') {
      return backWithMsg(res, `/admin/sedute/${id}`, e.message, 'err');
    }
    console.error(e);
    return backWithMsg(res, `/admin/sedute/${id}`, 'Errore aggiunta esercizio.', 'err');
  }
});

router.post('/sedute/:id(\\d+)/esercizi/copia-da', express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const daId = parseInt(req.body.da_seduta_id, 10);
  try {
    const n = seduteService.copiaEserciziDa({ daSedutaId: daId, aSedutaId: id });
    return backWithMsg(res, `/admin/sedute/${id}`, `Copiati ${n} esercizi dalla seduta #${daId}.`, 'ok');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, `/admin/sedute/${id}`, 'Errore copia esercizi.', 'err');
  }
});

// Modifica esercizio — accetta sia JSON che form
router.post('/esercizi/:id(\\d+)', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.is('application/json') || (req.body && Object.keys(req.body).length > 0 && !req.body._redirect)) {
    try {
      eserciziService.updateEsercizio(id, req.body || {});
      if (req.is('application/json')) return res.json({ ok: true });
      // trova seduta per redirect
      const ex = eserciziService.getEsercizio(id);
      if (ex) return res.redirect(303, `/admin/sedute/${ex.seduta_id}`);
      return res.json({ ok: true });
    } catch (e) {
      if (req.is('application/json')) return res.status(400).json({ ok: false, error: e.message });
      return backWithMsg(res, '/admin/clienti', e.message, 'err');
    }
  }
  return res.json({ ok: false, error: 'body vuoto' });
});

// Elimina esercizio
router.post('/esercizi/:id(\\d+)/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const ex = eserciziService.getEsercizio(id);
    eserciziService.deleteEsercizio(id);
    if (ex) return res.redirect(303, `/admin/sedute/${ex.seduta_id}?ok=${encodeURIComponent('Esercizio eliminato.')}`);
    return res.redirect(303, '/admin/clienti');
  } catch (e) {
    console.error(e);
    return backWithMsg(res, '/admin/clienti', 'Errore eliminazione.', 'err');
  }
});

// Riordina esercizi (JSON)
router.post('/sedute/:id(\\d+)/esercizi/reorder', express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { ordine_ids } = req.body || {};
  try {
    eserciziService.reorderEsercizi({ sedutaId: id, ordineIds: ordine_ids || [] });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// =====================================================================
// REVISIONI COACH
// =====================================================================

// GET /admin/revisioni — elenco sedute COMPLETATA da revisionare
router.get('/revisioni', (req, res) => {
  const includeAll = req.query.tutte === '1';
  const sedute = revisioniService.listDaRevisionare({ includeRevisionate: includeAll });

  if (!wantsHtml(req)) {
    return res.json({ ok: true, sedute });
  }

  const rows = sedute.map((s) => `
    <tr>
      <td><a href="/admin/clienti/${s.cliente_id}">${escapeHtml(s.cliente_cognome)} ${escapeHtml(s.cliente_nome)}</a></td>
      <td>${escapeHtml(s.blocco_nome)} · Sett. ${s.indice_settimana} · Seduta ${s.indice_seduta}</td>
      <td>${s.voto != null ? escapeHtml(s.voto) + '/5' : '<span class="muted">—</span>'}</td>
      <td>${s.inviato_il ? escapeHtml(String(s.inviato_il).replace('T', ' ').slice(0, 16)) : '<span class="muted">—</span>'}</td>
      <td>${s.revisionato_il ? '<span class="badge badge-ok">revisionata</span>' : '<span class="badge badge-warn">da revisionare</span>'}</td>
      <td><a class="btn" href="/admin/sedute/${s.seduta_id}/revisione">Apri revisione</a></td>
    </tr>`).join('') || `<tr><td colspan="6" class="muted">Nessuna seduta da revisionare.</td></tr>`;

  const body = `
    <h1>Revisioni</h1>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}
    <div class="filter-bar">
      <a class="btn ${!includeAll ? 'btn-primary' : ''}" href="/admin/revisioni">Da revisionare</a>
      <a class="btn ${includeAll ? 'btn-primary' : ''}" href="/admin/revisioni?tutte=1">Tutte le completate</a>
    </div>
    <table class="table">
      <thead><tr><th>Cliente</th><th>Seduta</th><th>Voto</th><th>Inviata</th><th>Stato</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  res.send(adminLayout({
    title: 'Revisioni',
    user: req.admin,
    body,
    breadcrumb: [{ label: 'Dashboard', href: '/admin' }, { label: 'Revisioni' }],
  }));
});

// GET /admin/sedute/:id/revisione — dettaglio revisione di una seduta
router.get('/sedute/:id(\\d+)/revisione', (req, res) => {
  const id = parseInt(req.params.id, 10);
  let det;
  try {
    det = revisioniService.getDettaglioRevisione(id);
  } catch (e) {
    if (e.code === 'not_found') return backWithMsg(res, '/admin/revisioni', 'Seduta non trovata.', 'err');
    if (e.code === 'invalid_state') return backWithMsg(res, '/admin/revisioni', e.message, 'err');
    console.error(e);
    return backWithMsg(res, '/admin/revisioni', 'Errore apertura revisione.', 'err');
  }

  if (!wantsHtml(req)) {
    return res.json({ ok: true, ...det });
  }

  const { seduta, cliente, esercizi, feedback_esercizi, feedback_seduta, puo_preparare_prossima } = det;
  const fbByEx = {};
  for (const f of feedback_esercizi) fbByEx[f.esercizio_id] = f;

  const exRows = esercizi.map((ex) => {
    const f = fbByEx[ex.id] || {};
    return `<tr>
      <td>${ex.ordine}</td>
      <td>${escapeHtml(ex.nome)}</td>
      <td>${ex.serie != null ? escapeHtml(ex.serie) : ''}${ex.ripetizioni ? ' × ' + escapeHtml(ex.ripetizioni) : ''}${ex.carico ? ' @ ' + escapeHtml(ex.carico) : ''}</td>
      <td>${f.carico_effettivo != null ? escapeHtml(f.carico_effettivo) : '<span class="muted">—</span>'}</td>
      <td>${f.reps_effettive != null ? escapeHtml(f.reps_effettive) : '<span class="muted">—</span>'}</td>
      <td>${f.difficolta != null ? escapeHtml(f.difficolta) + '/5' : '<span class="muted">—</span>'}</td>
      <td>${f.note ? escapeHtml(f.note) : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="muted">Nessun esercizio.</td></tr>`;

  const fs = feedback_seduta || {};
  const prossimaForm = puo_preparare_prossima
    ? `<form method="POST" action="/admin/sedute/${seduta.id}/prepara-prossima" style="display:inline">
         <button type="submit" class="btn btn-primary">Prepara prossima seduta</button>
       </form>`
    : `<p class="muted small">Nessuno slot BOZZA disponibile dopo questa seduta nel blocco: impossibile preparare la prossima.</p>`;

  const body = `
    <div class="row-between">
      <h1>Revisione — ${escapeHtml(cliente.cognome)} ${escapeHtml(cliente.nome)}</h1>
      <div>
        <a class="btn" href="/admin/sedute/${seduta.id}/pdf">PDF seduta</a>
        <a class="btn" href="/admin/revisioni">← Revisioni</a>
      </div>
    </div>
    ${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}

    <section class="card">
      <p class="muted small">${escapeHtml(seduta.blocco_nome)} · Settimana ${seduta.indice_settimana} · Seduta ${seduta.indice_seduta} ${statoBadge(seduta.stato)}</p>
      ${fs.revisionato_il ? `<p><span class="badge badge-ok">Revisionata il ${escapeHtml(String(fs.revisionato_il).replace('T', ' ').slice(0, 16))}</span></p>` : '<p><span class="badge badge-warn">Non ancora revisionata</span></p>'}
    </section>

    <h2 style="margin-top:20px">Feedback esercizi</h2>
    <div class="card" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th>#</th><th>Esercizio</th><th>Target</th><th>Carico eff.</th><th>Reps eff.</th><th>Difficoltà</th><th>Note cliente</th></tr></thead>
        <tbody>${exRows}</tbody>
      </table>
    </div>

    <h2 style="margin-top:20px">Feedback seduta (cliente)</h2>
    <section class="card">
      <p>Voto complessivo: <strong>${fs.voto != null ? escapeHtml(fs.voto) + '/5' : '—'}</strong></p>
      <p>Commento: ${fs.commento ? escapeHtml(fs.commento) : '<span class="muted">nessuno</span>'}</p>
      <p class="muted small">Inviato: ${fs.inviato_il ? escapeHtml(String(fs.inviato_il).replace('T', ' ').slice(0, 16)) : '—'}</p>
    </section>

    <h2 style="margin-top:20px">Note del coach</h2>
    <form method="POST" action="/admin/sedute/${seduta.id}/revisione" class="card form-stacked">
      <label>Note coach
        <textarea name="note_coach" rows="4">${escapeHtml(fs.note_coach || '')}</textarea>
      </label>
      <button type="submit" class="btn btn-primary">Salva revisione</button>
    </form>

    <h2 style="margin-top:20px">Prepara prossima seduta</h2>
    <section class="card">
      <p class="muted small">Copia gli esercizi di questa seduta nel primo slot BOZZA successivo dello stesso blocco e lo imposta come PROSSIMA. I feedback non vengono copiati. Nessun movimento ingressi.</p>
      ${prossimaForm}
    </section>
  `;
  res.send(adminLayout({
    title: 'Revisione seduta',
    user: req.admin,
    body,
    breadcrumb: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Revisioni', href: '/admin/revisioni' },
      { label: `Seduta #${seduta.id}` },
    ],
  }));
});

// POST /admin/sedute/:id/revisione — salva note coach + marca revisionata
router.post('/sedute/:id(\\d+)/revisione', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = req.body && req.body.note_coach !== undefined ? req.body.note_coach : null;
  try {
    const feedback = revisioniService.salvaRevisione(id, { note_coach: note });
    if (!wantsHtml(req)) return res.json({ ok: true, feedback_seduta: feedback });
    return backWithMsg(res, `/admin/sedute/${id}/revisione`, 'Revisione salvata.', 'ok');
  } catch (e) {
    if (e.code === 'not_found' || e.code === 'invalid_state') {
      if (!wantsHtml(req)) return res.status(400).json({ ok: false, error: e.code, message: e.message });
      return backWithMsg(res, '/admin/revisioni', e.message, 'err');
    }
    console.error(e);
    if (!wantsHtml(req)) return res.status(500).json({ ok: false, error: 'server_error', message: e.message });
    return backWithMsg(res, `/admin/sedute/${id}/revisione`, 'Errore salvataggio revisione.', 'err');
  }
});

// POST /admin/sedute/:id/prepara-prossima — copia esercizi nello slot BOZZA successivo
router.post('/sedute/:id(\\d+)/prepara-prossima', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = revisioniService.preparaProssimaSeduta(id);
    if (!wantsHtml(req)) return res.json({ ok: true, ...result });
    return backWithMsg(res, `/admin/sedute/${result.nuova_seduta_id}`,
      `Prossima seduta pronta (#${result.nuova_seduta_id}): ${result.copiati} esercizi copiati.`, 'ok');
  } catch (e) {
    if (e.code === 'not_found' || e.code === 'invalid_state' || e.code === 'no_slot') {
      if (!wantsHtml(req)) return res.status(400).json({ ok: false, error: e.code, message: e.message });
      return backWithMsg(res, `/admin/sedute/${id}/revisione`, e.message, 'err');
    }
    console.error(e);
    if (!wantsHtml(req)) return res.status(500).json({ ok: false, error: 'server_error', message: e.message });
    return backWithMsg(res, `/admin/sedute/${id}/revisione`, 'Errore preparazione prossima seduta.', 'err');
  }
});

// =====================================================================
// API JSON
// =====================================================================
router.get('/api/clienti/:id(\\d+)/scheda', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cliente = clientiService.getCliente(id);
  if (!cliente) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, cliente, scheda: schedeService.riepilogoCliente(id) });
});

router.get('/api/sedute/:id(\\d+)', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const seduta = seduteService.getSeduta(id);
  if (!seduta) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, seduta, esercizi: eserciziService.listEserciziSeduta(id) });
});

module.exports = router;

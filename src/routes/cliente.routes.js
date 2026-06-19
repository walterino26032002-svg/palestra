'use strict';

const express = require('express');
const path = require('path');

const clienteWorkoutService = require('../services/clienteWorkout.service');
const { requireCliente } = require('../middleware/auth');

const router = express.Router();

// Tutte le route cliente richiedono login cliente.
// IMPORTANT: scope a /cliente. Questo router è montato al root (app.use(clienteRoutes)):
// senza path la guard intercetterebbe ogni richiesta non-admin (anche /admin/* non risolte)
// e rimanderebbe l'admin a /cliente/login.
router.use('/cliente', requireCliente);

const { escapeHtml, wantsHtml, alertBlock } = require('../utils/helpers');

function buildClientePageHtml(req) {
  const user = req.cliente || {};
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accademia — La tua area</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="app-body cliente-body">
<header class="topbar cliente-topbar">
  <a href="/cliente" class="brandmark brandmark-cliente">
    <img src="/assets/brand/accademia-logo.jpg" alt="Accademia">
    <span class="bm-text">
      <span class="bm-name">Accademia</span>
      <span class="bm-sub">Élite Training Club</span>
    </span>
  </a>
  <nav class="nav">
    <span class="cliente-chip">${escapeHtml(user.nome || 'Atleta')}</span>
    <form method="POST" action="/cliente/logout" style="display:inline">
      <button type="submit" class="btn btn-ghost">Esci</button>
    </form>
  </nav>
</header>

<main class="cliente-shell">
  <div id="clienteFlash">${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}</div>
  <div id="clienteApp" class="cliente-app" data-page="home"></div>
</main>

<script src="/js/app.js"></script>
<script src="/js/cliente-workout.js"></script>
</body></html>`;
}

function buildAllenamentoPageHtml(req) {
  const user = req.cliente || {};
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accademia — Allenamento</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="app-body cliente-body workout-page">
<header class="topbar cliente-topbar">
  <a href="/cliente" class="brandmark brandmark-cliente">
    <img src="/assets/brand/accademia-logo.jpg" alt="Accademia">
    <span class="bm-text">
      <span class="bm-name">Accademia</span>
      <span class="bm-sub">Allenamento</span>
    </span>
  </a>
  <nav class="nav">
    <a class="btn btn-ghost" href="/cliente">Home</a>
    <form method="POST" action="/cliente/logout" style="display:inline">
      <button type="submit" class="btn btn-ghost">Esci</button>
    </form>
  </nav>
</header>

<main class="cliente-shell workout-shell">
  <div id="clienteFlash">${alertBlock('ok', req.query.ok)}${alertBlock('error', req.query.err)}</div>
  <div id="clienteApp" class="cliente-app" data-page="workout"></div>
</main>

<script src="/js/app.js"></script>
<script src="/js/cliente-workout.js"></script>
</body></html>`;
}

function routeError(res, req, err, fallbackRedirect) {
  if (wantsHtml(req)) {
    const sep = fallbackRedirect.includes('?') ? '&' : '?';
    return res.redirect(303, `${fallbackRedirect}${sep}err=${encodeURIComponent(err.message || 'Errore')}`);
  }
  const status = err.code === 'not_found' ? 404 : 400;
  return res.status(status).json({ ok: false, error: err.code || 'error', message: err.message });
}

router.get('/cliente', (req, res) => {
  res.send(buildClientePageHtml(req));
});

router.get('/cliente/allenamento', (req, res) => {
  try {
    clienteWorkoutService.getAllenamento(req.cliente.id);
    return res.send(buildAllenamentoPageHtml(req));
  } catch (err) {
    if (err.code === 'checkin_required' || err.code === 'no_workout') {
      return res.redirect(303, `/cliente?err=${encodeURIComponent(err.message)}`);
    }
    return routeError(res, req, err, '/cliente');
  }
});

router.get('/cliente/api/me', (req, res) => {
  try {
    const ctx = clienteWorkoutService.getClienteContext(req.cliente.id);
    return res.json({
      ok: true,
      user: req.user,
      cliente: ctx.cliente,
      saldo_ingressi: ctx.saldo_ingressi,
      badge_label: ctx.badge_label,
      badge_tone: ctx.badge_tone,
      checked_in_today: ctx.checked_in_today,
      prossima_seduta: ctx.prossima_seduta,
      allenamento_sbloccato: ctx.allenamento_sbloccato,
      presenza_oggi: ctx.presenza_oggi,
      today: clienteWorkoutService.todayISO(),
    });
  } catch (err) {
    return routeError(res, req, err, '/cliente');
  }
});

router.get('/cliente/api/allenamento', (req, res) => {
  try {
    const data = clienteWorkoutService.getAllenamento(req.cliente.id);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return routeError(res, req, err, '/cliente');
  }
});

router.post('/cliente/api/esercizi/:id(\\d+)/feedback', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  try {
    const feedback = clienteWorkoutService.upsertFeedbackEsercizio(
      req.cliente.id,
      parseInt(req.params.id, 10),
      req.body || {}
    );
    return res.json({ ok: true, feedback });
  } catch (err) {
    return routeError(res, req, err, '/cliente/allenamento');
  }
});

router.post('/cliente/api/seduta/:id(\\d+)/feedback', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  try {
    const feedback = clienteWorkoutService.upsertFeedbackSeduta(
      req.cliente.id,
      parseInt(req.params.id, 10),
      req.body || {}
    );
    return res.json({ ok: true, feedback });
  } catch (err) {
    return routeError(res, req, err, '/cliente/allenamento');
  }
});

router.post('/cliente/api/seduta/:id(\\d+)/completa', express.json(), express.urlencoded({ extended: false }), (req, res) => {
  try {
    const result = clienteWorkoutService.completaSeduta(
      req.cliente.id,
      parseInt(req.params.id, 10),
      req.body || {}
    );
    return res.json({
      ok: true,
      message: 'Allenamento completato, attendi revisione del coach.',
      ...result,
    });
  } catch (err) {
    return routeError(res, req, err, '/cliente/allenamento');
  }
});

module.exports = router;

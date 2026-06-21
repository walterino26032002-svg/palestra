'use strict';

const express = require('express');
const path = require('path');

const authService = require('../services/auth.service');
const { clearSession } = require('../middleware/auth');

const router = express.Router();

const ADMIN_HOME = '/admin';
const CLIENTE_HOME = '/cliente';

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const { wantsHtml, escapeHtml } = require('../utils/helpers');

function renderAdminLogin(req, res, error) {
  res.send(buildAdminLoginHtml({ error }));
}

function renderClienteLogin(req, res, error) {
  res.send(buildClienteLoginHtml({ error }));
}

// Inline HTML per evitare dipendenze da template engine in V1.
// Mantenuti corti, funzionali. Il look completo arriverà con gli step successivi.
function authHead(title) {
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Accademia</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="auth-body">`;
}

function authBrand(sub) {
  return `<div class="auth-brand">
    <img src="/assets/brand/accademia-logo.jpg" alt="Accademia" class="auth-logo">
    <div class="auth-brand-name">Accademia</div>
    <div class="auth-brand-sub">${escapeHtml(sub || 'Élite Training Club')}</div>
  </div>`;
}

function buildAdminLoginHtml({ error } = {}) {
  const errBlock = error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : '';
  return `${authHead('Area riservata')}
<main class="auth-card">
  ${authBrand('Élite Training Club')}
  <h1>Area riservata</h1>
  <p class="muted">Accesso allo staff dell'Accademia</p>
  ${errBlock}
  <form method="POST" action="/login" autocomplete="off">
    <label>Nome utente
      <input name="username" type="text" required autofocus>
    </label>
    <label>Password
      <input name="password" type="password" required>
    </label>
    <button type="submit" class="btn btn-primary btn-block">Entra nel pannello</button>
  </form>
  <p class="auth-switch">Sei un atleta? <a href="/cliente/login">Vai all'area allenamento</a></p>
</main>
</body></html>`;
}

function buildClienteLoginHtml({ error } = {}) {
  const errBlock = error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : '';
  return `${authHead('Area allenamento')}
<main class="auth-card auth-card-cliente">
  ${authBrand('Allenati · Registra · Migliora')}
  <h1>Accedi alla tua scheda</h1>
  <p class="muted">L'allenamento di oggi ti aspetta</p>
  ${errBlock}
  <form method="POST" action="/cliente/login">
    <label>Nome utente
      <input name="identifier" type="text" autocomplete="username" placeholder="nome.cognome" required autofocus>
    </label>
    <label>Password
      <input name="password" type="password" autocomplete="current-password" required>
    </label>
    <button type="submit" class="btn btn-primary btn-block">Accedi alla tua scheda</button>
  </form>
  <p class="auth-switch">Sei dello staff? <a href="/login">Area riservata</a></p>
</main>
</body></html>`;
}

// -------------------------------------------------------------
// Admin
// -------------------------------------------------------------
router.get('/login', (req, res, next) => {
  if (req.admin && req.admin.id) return res.redirect(ADMIN_HOME);
  if (!wantsHtml(req)) return res.status(200).json({ ok: true, page: 'admin-login' });
  renderAdminLogin(req, res, null);
});

router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { username, password } = req.body || {};
  try {
    const admin = authService.loginAdmin(username, password);
    req.session.regenerate((err) => {
      if (err) {
        if (wantsHtml(req)) return renderAdminLogin(req, res, 'Errore di sessione.');
        return res.status(500).json({ ok: false, error: 'session_error' });
      }
      req.session.admin = admin;
      const redirectTo = req.session._redirectAfterLogin || ADMIN_HOME;
      delete req.session._redirectAfterLogin;
      if (wantsHtml(req)) return res.redirect(redirectTo);
      return res.json({ ok: true, redirect: redirectTo, admin });
    });
  } catch (e) {
    if (wantsHtml(req)) return renderAdminLogin(req, res, e.message);
    return res.status(401).json({ ok: false, error: e.code || 'login_failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await clearSession(req);
  } catch (e) {
    // ignora
  }
  if (wantsHtml(req)) return res.redirect('/login');
  return res.json({ ok: true });
});

// -------------------------------------------------------------
// Cliente
// -------------------------------------------------------------
router.get('/cliente/login', (req, res) => {
  if (req.cliente && req.cliente.id) return res.redirect(CLIENTE_HOME);
  if (!wantsHtml(req)) return res.status(200).json({ ok: true, page: 'cliente-login' });
  renderClienteLogin(req, res, null);
});

router.post('/cliente/login', express.urlencoded({ extended: false }), (req, res) => {
  const { identifier, cliente_id, password } = req.body || {};
  const ident = identifier != null && identifier !== '' ? identifier : cliente_id;
  try {
    const cliente = authService.loginCliente(ident, password);
    req.session.regenerate((err) => {
      if (err) {
        if (wantsHtml(req)) return renderClienteLogin(req, res, 'Errore di sessione.');
        return res.status(500).json({ ok: false, error: 'session_error' });
      }
      req.session.cliente = cliente;
      const redirectTo = req.session._redirectAfterLogin || CLIENTE_HOME;
      delete req.session._redirectAfterLogin;
      if (wantsHtml(req)) return res.redirect(redirectTo);
      return res.json({ ok: true, redirect: redirectTo, cliente });
    });
  } catch (e) {
    if (wantsHtml(req)) return renderClienteLogin(req, res, e.message);
    return res.status(401).json({ ok: false, error: e.code || 'login_failed' });
  }
});

router.post('/cliente/logout', async (req, res) => {
  try {
    await clearSession(req);
  } catch (e) {
    // ignora
  }
  if (wantsHtml(req)) return res.redirect('/cliente/login');
  return res.json({ ok: true });
});

module.exports = router;

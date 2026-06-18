'use strict';

/**
 * Middleware di autenticazione.
 *
 * - attachUser   : mette req.user se la sessione contiene un login valido
 *                  (admin o cliente). NON blocca le richieste.
 * - requireAdmin : richiede login admin. 401 JSON se API, redirect se HTML.
 * - requireCliente: richiede login cliente. Stesso comportamento.
 * - redirectIfAuth: rimanda ai rispettivi home se già loggato (per /login).
 */

const ADMIN_HOME = '/admin';
const CLIENTE_HOME = '/cliente';
const ADMIN_LOGIN = '/login';
const CLIENTE_LOGIN = '/cliente/login';

function wantsHtml(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

function attachUser(req, res, next) {
  req.user = null;
  req.admin = null;
  req.cliente = null;

  const s = req.session || {};
  if (s.admin && s.admin.id) {
    req.admin = s.admin;
    req.user = { type: 'admin', ...s.admin };
  } else if (s.cliente && s.cliente.id) {
    req.cliente = s.cliente;
    req.user = { type: 'cliente', ...s.cliente };
  }
  next();
}

function deny(req, res, next, loginUrl, homeUrl) {
  if (wantsHtml(req)) {
    if (req.originalUrl !== loginUrl) {
      req.session._redirectAfterLogin = req.originalUrl;
    }
    return res.redirect(loginUrl);
  }
  return res.status(401).json({ ok: false, error: 'unauthenticated' });
}

function requireAdmin(req, res, next) {
  if (req.admin && req.admin.id) return next();
  return deny(req, res, next, ADMIN_LOGIN, ADMIN_HOME);
}

function requireCliente(req, res, next) {
  if (req.cliente && req.cliente.id) return next();
  return deny(req, res, next, CLIENTE_LOGIN, CLIENTE_HOME);
}

function redirectIfAdmin(req, res, next) {
  if (req.admin && req.admin.id) return res.redirect(ADMIN_HOME);
  next();
}

function redirectIfCliente(req, res, next) {
  if (req.cliente && req.cliente.id) return res.redirect(CLIENTE_HOME);
  next();
}

function clearSession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  attachUser,
  requireAdmin,
  requireCliente,
  redirectIfAdmin,
  redirectIfCliente,
  clearSession,
  ADMIN_HOME,
  CLIENTE_HOME,
  ADMIN_LOGIN,
  CLIENTE_LOGIN,
};

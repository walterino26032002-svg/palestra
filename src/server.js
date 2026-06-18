'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
const { attachUser, requireAdmin, requireCliente } = require('./middleware/auth');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const nfcRoutes = require('./routes/nfc.routes');
const nfcApiRoutes = nfcRoutes.apiRouter;
const schedeRoutes = require('./routes/schede.routes');
const exportRoutes = require('./routes/export.routes');
const backupRoutes = require('./routes/backup.routes');
const clienteRoutes = require('./routes/cliente.routes');
const backupService = require('./services/backup.service');

const app = express();

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Sessioni (memory store per V1)
app.use(
  session({
    name: 'gestionale.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true,  // disattivato in V1: solo HTTP locale
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 giorni
    },
  })
);

// Popola req.user / req.admin / req.cliente per tutte le richieste
app.use(attachUser);

// Auth routes
app.use(authRoutes);

app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

// Endpoint pubblico NFC (per lettore esterno o simulatore)
app.use('/api/nfc', nfcApiRoutes);

// Admin routes (tutto sotto /admin). export/backup prima di adminRoutes (catch-all).
app.use('/admin', requireAdmin, nfcRoutes, schedeRoutes, exportRoutes, backupRoutes, adminRoutes);

// Cliente routes (la protezione requireCliente è applicata nel router)
app.use(clienteRoutes);

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    name: 'gestionale-palestra',
    version: '0.1.0',
    env: config.nodeEnv,
    time: new Date().toISOString(),
  });
});

// Endpoint "chi sono" — utile per debug/test e per le pagine HTML
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  res.json({ ok: true, user: req.user });
});

// Entry root
app.get('/', (req, res) => {
  if (req.admin && req.admin.id) return res.redirect('/admin');
  if (req.cliente && req.cliente.id) return res.redirect('/cliente');
  return res.redirect('/login');
});

// Pagine cliente (HTML statico, protette)
app.get('/cliente', requireCliente, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'cliente', 'index.html'));
});

// Espone l'utente loggato alle pagine HTML statiche via header iniettato runtime.
// Inietta uno script che valorizza window.__USER__ (no template engine).
app.use((req, res, next) => {
  const originalSendFile = res.sendFile.bind(res);
  res.sendFile = function (filePath, opts, cb) {
    if (req.user && typeof filePath === 'string' && filePath.endsWith('.html')) {
      // intercetta per aggiungere il payload utente prima del </head>
      const fs = require('fs');
      try {
        let html = fs.readFileSync(filePath, 'utf8');
        const injected = `<script>window.__USER__ = ${JSON.stringify(req.user).replace(/</g, '\\u003c')};</script>`;
        if (html.includes('</head>')) {
          html = html.replace('</head>', injected + '</head>');
        } else {
          html = injected + html;
        }
        res.type('html').send(html);
        if (typeof cb === 'function') cb();
        return res;
      } catch (e) {
        // fallback: file non leggibile, delega
      }
    }
    return originalSendFile(filePath, opts, cb);
  };
  next();
});

// 404 JSON
app.use((req, res) => {
  // Se è una richiesta "browser" per un path HTML non trovato, rimanda al login.
  const accept = (req.headers.accept || '').toLowerCase();
  if (accept.includes('text/html')) {
    if (req.path.startsWith('/admin')) return res.redirect('/login');
    if (req.path.startsWith('/cliente')) return res.redirect('/cliente/login');
    return res.redirect('/login');
  }
  res.status(404).json({ ok: false, error: 'not_found', path: req.path });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(500).json({ ok: false, error: 'server_error', message: err.message });
});

function start() {
  return new Promise((resolve) => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[server] in ascolto su http://0.0.0.0:${config.port}  (env=${config.nodeEnv})`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start();
  // Backup automatico (node-cron): solo quando il server è avviato direttamente.
  try {
    require('./services/backup.service').startBackupCron();
  } catch (e) {
    console.error('[backup] avvio cron fallito:', e.message);
  }
}

module.exports = { app, start };

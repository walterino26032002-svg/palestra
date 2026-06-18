'use strict';

/**
 * Layout admin condiviso.
 * App shell premium: sidebar raggruppata su desktop, top bar con menu
 * a panino su mobile (toggle CSS-only, nessuna dipendenza JS), breadcrumb
 * e intestazione pagina coerente. I nomi delle classi del contenuto
 * (page-head, card, table, ...) restano invariati: il markup delle route
 * non cambia.
 */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Navigazione admin raggruppata per area logica.
// `active` evidenzia la voce confrontando l'href.
const NAV_GROUPS = [
  {
    label: 'Operatività',
    items: [
      { href: '/admin',           label: 'Bacheca operativa' },
      { href: '/admin/clienti',   label: 'Clienti' },
      { href: '/admin/schede',    label: 'Schede' },
      { href: '/admin/revisioni', label: 'Revisioni' },
    ],
  },
  {
    label: 'Tesseramento',
    items: [
      { href: '/admin/nfc',     label: 'Tessere' },
      { href: '/admin/bacheca', label: 'Avvisi' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/servizi', label: 'Servizi' },
      { href: '/admin/export',  label: 'Export' },
      { href: '/admin/backup',  label: 'Backup' },
    ],
  },
];

// Compat: alcune parti potrebbero importare NAV come array piatto.
const NAV = NAV_GROUPS.reduce((acc, g) => acc.concat(g.items), []);

function navHtml(active) {
  return NAV_GROUPS.map((group) => {
    const links = group.items.map((n) => {
      const isActive = active === n.href;
      const cls = isActive ? 'nav-link active' : 'nav-link';
      const aria = isActive ? ' aria-current="page"' : '';
      return `<a href="${n.href}" class="${cls}"${aria}>${escapeHtml(n.label)}</a>`;
    }).join('');
    return `<div class="nav-group">
      <span class="nav-group-label">${escapeHtml(group.label)}</span>
      ${links}
    </div>`;
  }).join('');
}

function brandmark() {
  return `<a href="/admin" class="brandmark">
    <img src="/assets/brand/accademia-logo.jpg" alt="Accademia">
    <span class="bm-text">
      <span class="bm-name">Accademia</span>
      <span class="bm-sub">Élite Training Club</span>
    </span>
  </a>`;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {object} o.user      - req.admin (usa .username)
 * @param {string} o.body      - HTML del contenuto
 * @param {Array}  [o.breadcrumb] - [{label, href?}]
 * @param {string} [o.active]  - href della voce di nav attiva
 */
function adminLayout({ title, user, body, breadcrumb = [], active = '' }) {
  const bcHtml = breadcrumb.map((b, i) => {
    const sep = i > 0 ? '<span class="sep">›</span>' : '';
    const inner = b.href
      ? `<a href="${escapeHtml(b.href)}">${escapeHtml(b.label)}</a>`
      : `<span>${escapeHtml(b.label)}</span>`;
    return sep + inner;
  }).join('');

  const username = escapeHtml(user && user.username || '');
  const initial = username ? escapeHtml(username.charAt(0).toUpperCase()) : '·';

  const sidebar = `<aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">${brandmark()}</div>
    <nav class="sidebar-nav" aria-label="Navigazione principale">
      ${navHtml(active)}
    </nav>
    <div class="sidebar-foot">
      <div class="side-user">
        <span class="side-user-avatar" aria-hidden="true">${initial}</span>
        <span class="side-user-meta">
          <span class="side-user-name">${username}</span>
          <span class="side-user-role">Staff</span>
        </span>
      </div>
      <form method="POST" action="/logout">
        <button type="submit" class="btn btn-ghost btn-logout">Esci</button>
      </form>
    </div>
  </aside>`;

  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Accademia</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="app-body">
<input type="checkbox" id="nav-toggle" class="nav-toggle-cb" hidden>
<header class="mobile-topbar">
  ${brandmark()}
  <label for="nav-toggle" class="nav-burger" aria-label="Apri menu">
    <span></span><span></span><span></span>
  </label>
</header>
<label for="nav-toggle" class="sidebar-scrim" aria-hidden="true"></label>
${sidebar}
<main class="app-main">
  <div class="container">
    ${bcHtml ? `<nav class="breadcrumb" aria-label="breadcrumb">${bcHtml}</nav>` : ''}
    ${body}
  </div>
</main>
<script src="/js/admin.js" defer></script>
</body></html>`;
}

module.exports = { adminLayout, escapeHtml, NAV, NAV_GROUPS };

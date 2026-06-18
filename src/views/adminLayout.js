'use strict';

/**
 * Layout admin condiviso (STEP 9).
 * Unico header/navbar per tutte le pagine admin: nav coerente, brand Accademia
 * con logo, breadcrumb. Sostituisce le 5 copie duplicate di adminLayout().
 */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Voci di navigazione admin (coerenti ovunque). `active` evidenzia la sezione.
const NAV = [
  { href: '/admin',          label: 'Bacheca operativa' },
  { href: '/admin/clienti',  label: 'Clienti' },
  { href: '/admin/servizi',  label: 'Servizi' },
  { href: '/admin/schede',   label: 'Schede' },
  { href: '/admin/revisioni',label: 'Revisioni' },
  { href: '/admin/nfc',      label: 'Tessere' },
  { href: '/admin/bacheca',  label: 'Avvisi' },
  { href: '/admin/export',   label: 'Export' },
  { href: '/admin/backup',   label: 'Backup' },
];

function navHtml(active) {
  return NAV.map((n) => {
    const cls = active === n.href ? 'nav-link active' : 'nav-link';
    return `<a href="${n.href}" class="${cls}">${escapeHtml(n.label)}</a>`;
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

  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Accademia</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="app-body">
<header class="topbar">
  ${brandmark()}
  <nav class="nav">
    ${navHtml(active)}
    <span class="nav-user">${escapeHtml(user && user.username || '')}</span>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="btn btn-ghost">Esci</button>
    </form>
  </nav>
</header>
<main class="container">
  ${bcHtml ? `<nav class="breadcrumb">${bcHtml}</nav>` : ''}
  ${body}
</main>
</body></html>`;
}

module.exports = { adminLayout, escapeHtml, NAV };

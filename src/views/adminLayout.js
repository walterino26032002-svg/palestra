'use strict';

/**
 * Layout admin condiviso (STEP 9).
 * Unico header/navbar per tutte le pagine admin: nav coerente, brand Accademia
 * con logo, breadcrumb. Sostituisce le 5 copie duplicate di adminLayout().
 */

const { escapeHtml } = require('../utils/helpers');

// Voci di navigazione admin (coerenti ovunque). `active` evidenzia la sezione.
const NAV = [
  { href: '/admin',            label: 'Bacheca',        countHref: '/admin/bacheca' },
  { href: '/admin/clienti',    label: 'Clienti' },
  { href: '/admin/servizi',    label: 'Pacchetti' },
  { href: '/admin/schede',     label: 'Schede' },
  { href: '/admin/revisioni',  label: 'Revisioni',      countHref: '/admin/revisioni' },
  { href: '/admin/nfc',        label: 'NFC / Ingressi' },
  { href: '/admin/export',     label: 'Export / Backup', activeOn: ['/admin/backup'] },
];

function navHtml(active) {
  return NAV.map((n) => {
    const isActive = active === n.href ||
      (n.activeOn && n.activeOn.some(p => (active || '').startsWith(p)));
    return `<a href="${n.href}" class="${isActive ? 'navlink active' : 'navlink'}">${escapeHtml(n.label)}</a>`;
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

function initials(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1).toUpperCase() : 'A';
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {object} o.user      - req.admin (usa .username)
 * @param {string} o.body      - HTML del contenuto
 * @param {Array}  [o.breadcrumb] - [{label, href?}]
 * @param {string} [o.active]  - href della voce di nav attiva
 * @param {object} [o.counts]  - { '/admin/revisioni': 5, '/admin/bacheca': 3 } badge contatori
 */
function adminLayout({ title, user, body, breadcrumb = [], active = '', counts = {} }) {
  const bcHtml = breadcrumb.map((b, i) => {
    const sep = i > 0 ? '<span class="sep">›</span>' : '';
    const inner = b.href
      ? `<a href="${escapeHtml(b.href)}">${escapeHtml(b.label)}</a>`
      : `<span>${escapeHtml(b.label)}</span>`;
    return sep + inner;
  }).join('');

  const username = (user && user.username) || '';

  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Accademia</title>
<link rel="icon" href="/assets/brand/accademia-logo.jpg">
<link rel="stylesheet" href="/css/app.css">
</head><body class="app-body">
<header class="topbar2">
  <div class="row1">
    ${brandmark()}
    <span class="spacer"></span>
    <span class="who2"><span class="av">${escapeHtml(initials(username))}</span><span class="who-name">${escapeHtml(username)}</span></span>
    <form method="POST" action="/logout" class="logout-form">
      <button type="submit" class="btn btn-ghost btn-logout">Esci</button>
    </form>
  </div>
  <nav class="row2" aria-label="Navigazione amministrazione">
    ${navHtml(active)}
  </nav>
</header>
<main class="container">
  ${bcHtml ? `<nav class="breadcrumb">${bcHtml}</nav>` : ''}
  ${body}
</main>
</body></html>`;
}

module.exports = { adminLayout, escapeHtml, NAV };

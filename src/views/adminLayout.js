'use strict';

const { escapeHtml } = require('../utils/helpers');

const NAV = [
  {
    href: '/admin', label: 'Dashboard',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    countHref: '/admin/bacheca'
  },
  {
    href: '/admin/clienti', label: 'Clienti',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  {
    href: '/admin/servizi', label: 'Pacchetti',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'
  },
  {
    href: '/admin/schede', label: 'Schede',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
  },
  {
    href: '/admin/revisioni', label: 'Revisioni',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    countHref: '/admin/revisioni'
  },
  {
    href: '/admin/nfc', label: 'NFC / Ingressi',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
  },
  {
    href: '/admin/export', label: 'Export / Backup',
    icon: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    activeOn: ['/admin/backup']
  },
];

function initials(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1).toUpperCase() : 'A';
}

function sidebarNavHtml(active, counts) {
  return NAV.map((n) => {
    const isActive = active === n.href ||
      (n.activeOn && n.activeOn.some(p => (active || '').startsWith(p)));
    const cls = isActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link';
    const badge = n.countHref && counts && counts[n.countHref]
      ? `<span class="sidebar-badge">${counts[n.countHref]}</span>` : '';
    return `<a href="${n.href}" class="${cls}">${n.icon}<span>${escapeHtml(n.label)}</span>${badge}</a>`;
  }).join('');
}

function adminLayout({ title, user, body, breadcrumb = [], active = '', counts = {} }) {
  const bcHtml = breadcrumb.map((b, i) => {
    const sep = i > 0 ? '<span class="bc-sep">›</span>' : '';
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
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body.app-body{display:flex;flex-direction:row;min-height:100vh;background:#f8fafc;font-family:system-ui,sans-serif}
.sidebar{width:220px;min-height:100vh;background:#111827;display:flex;flex-direction:column;flex-shrink:0;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:100}
.sidebar-logo{display:flex;align-items:center;gap:10px;padding:20px 16px 16px;color:#fff;text-decoration:none;border-bottom:1px solid #1f2937}
.sidebar-logo svg{flex-shrink:0;color:#10b981}
.sidebar-logo-text{display:flex;flex-direction:column}
.sidebar-logo-name{font-weight:700;font-size:15px;color:#fff}
.sidebar-logo-sub{font-size:10px;color:#9ca3af}
.sidebar-nav{display:flex;flex-direction:column;gap:2px;padding:12px 8px;flex:1}
.sidebar-link{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:6px;color:#9ca3af;text-decoration:none;font-size:13.5px;font-weight:500;position:relative;transition:background .15s,color .15s;border-left:3px solid transparent}
.sidebar-link:hover{background:#1f2937;color:#e5e7eb}
.sidebar-link--active{background:#1d4645;color:#fff;border-left-color:#10b981}
.sidebar-link svg{flex-shrink:0}
.sidebar-badge{margin-left:auto;background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px}
.sidebar-help{margin:8px;background:#2d1b69;border-radius:8px;padding:14px 12px}
.sidebar-help-title{color:#c4b5fd;font-size:12px;font-weight:600;margin-bottom:4px}
.sidebar-help-text{color:#a78bfa;font-size:11px;line-height:1.4}
.sidebar-user{display:flex;align-items:center;gap:10px;padding:14px 16px;border-top:1px solid #1f2937}
.sidebar-user-av{width:32px;height:32px;border-radius:50%;background:#1d4645;color:#10b981;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
.sidebar-user-name{color:#e5e7eb;font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-logout{background:none;border:none;color:#6b7280;cursor:pointer;font-size:11px;padding:4px 6px;border-radius:4px}
.sidebar-logout:hover{color:#ef4444;background:#1f2937}
.app-main{margin-left:220px;flex:1;display:flex;flex-direction:column;min-height:100vh}
.app-topbar{background:#fff;border-bottom:1px solid #e5e7eb;padding:0 24px;height:56px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:50}
.app-topbar-bc{flex:1;display:flex;align-items:center;gap:4px;font-size:13px;color:#6b7280}
.app-topbar-bc a{color:#374151;text-decoration:none;font-weight:500}
.app-topbar-bc a:hover{color:#10b981}
.bc-sep{color:#d1d5db}
.app-topbar-search{flex:1;max-width:320px}
.app-topbar-search input{width:100%;padding:7px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;background:#f9fafb;outline:none}
.app-topbar-search input:focus{border-color:#10b981;background:#fff}
.app-topbar-actions{display:flex;align-items:center;gap:10px}
.topbar-bell{background:none;border:none;cursor:pointer;color:#6b7280;padding:6px;border-radius:6px;display:flex;align-items:center}
.topbar-bell:hover{background:#f3f4f6;color:#374151}
.topbar-av{width:32px;height:32px;border-radius:50%;background:#1d4645;color:#10b981;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.app-content{flex:1;padding:24px;background:#f8fafc}
</style>
</head><body class="app-body">

<aside class="sidebar">
  <a href="/admin" class="sidebar-logo">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span class="sidebar-logo-text">
      <span class="sidebar-logo-name">Accademia</span>
      <span class="sidebar-logo-sub">Élite Training Club</span>
    </span>
  </a>
  <nav class="sidebar-nav" aria-label="Navigazione">
    ${sidebarNavHtml(active, counts)}
  </nav>
  <div class="sidebar-help">
    <div class="sidebar-help-title">Serve aiuto?</div>
    <div class="sidebar-help-text">Consulta la documentazione o contatta il supporto tecnico.</div>
  </div>
  <div class="sidebar-user">
    <div class="sidebar-user-av">${escapeHtml(initials(username))}</div>
    <span class="sidebar-user-name">${escapeHtml(username)}</span>
    <form method="POST" action="/logout" style="margin:0">
      <button type="submit" class="sidebar-logout" title="Esci">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </form>
  </div>
</aside>

<div class="app-main">
  <header class="app-topbar">
    <nav class="app-topbar-bc">${bcHtml || `<span>${escapeHtml(title)}</span>`}</nav>
    <div class="app-topbar-search">
      <input type="search" placeholder="Cerca..." aria-label="Ricerca">
    </div>
    <div class="app-topbar-actions">
      <button class="topbar-bell" aria-label="Notifiche">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </button>
      <div class="topbar-av">${escapeHtml(initials(username))}</div>
    </div>
  </header>
  <main class="app-content">
    ${body}
  </main>
</div>

</body></html>`;
}

module.exports = { adminLayout, escapeHtml, NAV };

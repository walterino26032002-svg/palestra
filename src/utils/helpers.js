'use strict';

/** Helpers HTTP condivisi tra i router. */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wantsHtml(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
}

function alertBlock(kind, msg) {
  if (!msg) return '';
  return `<div class="alert alert-${escapeHtml(kind)}">${escapeHtml(msg)}</div>`;
}

function backWithMsg(res, base, msg, kind = 'ok') {
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(303, `${base}${sep}${kind}=${encodeURIComponent(msg)}`);
}

module.exports = { escapeHtml, wantsHtml, alertBlock, backWithMsg };

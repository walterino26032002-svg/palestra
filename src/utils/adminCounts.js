'use strict';

/** Contatori badge navbar admin (revisioni da fare + avvisi non letti). */

function buildAdminCounts() {
  const counts = {};
  try {
    const r = require('../services/revisioni.service').countDaRevisionare();
    if (r > 0) counts['/admin/revisioni'] = r;
  } catch (_) {}
  try {
    const n = require('../services/bacheca.service').countNonLetti();
    if (n > 0) counts['/admin/bacheca'] = n;
  } catch (_) {}
  return counts;
}

module.exports = { buildAdminCounts };

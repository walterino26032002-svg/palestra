'use strict';

/**
 * Script admin condiviso (presentazione lato client, nessuna logica server).
 *
 * Campo importo in euro:
 *   markup atteso ->
 *     <span class="field-euro">
 *       <input type="text" inputmode="decimal" data-euro data-euro-target="ID_HIDDEN" ...>
 *     </span>
 *     <input type="hidden" name="prezzo_cent" id="ID_HIDDEN" value="1500">
 *
 * L'operatore digita gli euro (es. 15 o 15,00); l'input nascosto che viene
 * inviato al server resta in CENTESIMI, così le API non cambiano.
 */
(function () {
  function parseEuroToCent(v) {
    if (v == null) return '';
    var s = String(v).trim().replace(/€/g, '').replace(/\s/g, '');
    if (s === '') return '';
    s = s.replace(',', '.');
    var n = parseFloat(s);
    if (isNaN(n) || n < 0) return '';
    return String(Math.round(n * 100));
  }

  function centToEuro(c) {
    if (c == null || c === '') return '';
    var n = Number(c) / 100;
    if (isNaN(n)) return '';
    return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function wireEuro(inp) {
    var targetId = inp.getAttribute('data-euro-target');
    var target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    // Inizializza il display dal valore in centesimi già presente.
    if (target.value !== '' && target.value != null) {
      inp.value = centToEuro(target.value);
    }

    function sync() { target.value = parseEuroToCent(inp.value); }

    inp.addEventListener('input', sync);
    inp.addEventListener('blur', function () {
      var c = parseEuroToCent(inp.value);
      inp.value = c === '' ? '' : centToEuro(c);
      target.value = c;
    });

    var form = inp.closest('form');
    if (form) form.addEventListener('submit', sync);

    sync();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var fields = document.querySelectorAll('[data-euro][data-euro-target]');
    Array.prototype.forEach.call(fields, wireEuro);
  });
})();

/* Area cliente mobile-first Accademia — home + allenamento con autosave + cronometro. */
(function () {
  'use strict';

  var esc = (window.app && window.app.escapeHtml) || function (v) {
    return String(v == null ? '' : v);
  };

  var root = document.getElementById('clienteApp');
  if (!root) return;
  var page = root.getAttribute('data-page') || 'home';

  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          var msg = (j && j.message) || (j && j.error) || ('HTTP ' + r.status);
          var e = new Error(msg); e.code = j && j.error; throw e;
        }
        return j;
      });
    });
  }

  function badgeHtml(label, tone) {
    return '<span class="badge badge-' + esc(tone || 'muted') + '">' + esc(label || '') + '</span>';
  }

  /* ---------------------- HOME ---------------------- */
  function renderHome(data) {
    var c = data.cliente || {};
    var ps = data.prossima_seduta;
    var checked = data.checked_in_today;
    var sbloccato = data.allenamento_sbloccato;

    var html = '';
    html += '<section class="hero">';
    html += '<p class="hero-eyebrow">Élite Training Club</p>';
    html += '<h1 class="hero-title">Pronto ad allenarti, ' + esc(c.nome || 'Atleta') + '?</h1>';
    html += '<p class="hero-status">' + badgeHtml(data.badge_label, data.badge_tone) + '</p>';
    html += '</section>';

    html += '<section class="stat-row">';
    html += '<div class="stat-card"><span class="stat-label">Ingressi residui</span><span class="stat-value">' + esc(data.saldo_ingressi) + '</span></div>';
    html += '<div class="stat-card"><span class="stat-label">Check-in di oggi</span><span class="stat-value-sm">' +
      (checked ? badgeHtml('Effettuato', 'ok') : badgeHtml('In attesa', 'warn')) + '</span></div>';
    html += '</section>';

    html += '<section class="card lift-card"><h2 class="section-title">Scheda di oggi</h2>';

    if (ps && checked && sbloccato) {
      // Caso 3 — allenamento sbloccato
      html += '<p class="lift-meta">Settimana ' + esc(ps.indice_settimana) + ' · Seduta ' + esc(ps.indice_seduta) + '</p>';
      if (ps.titolo) html += '<p class="lift-title">' + esc(ps.titolo) + '</p>';
      html += '<div class="unlock-note unlock-ok"><span class="unlock-ico" aria-hidden="true">✓</span>';
      html += '<p>Seduta sbloccata. Buon allenamento.</p></div>';
      html += '<a class="btn btn-primary btn-block" href="/cliente/allenamento">Inizia l\'allenamento</a>';
    } else if (ps && !checked) {
      // Caso 1 — seduta pronta ma check-in non effettuato
      html += '<p class="lift-meta">Settimana ' + esc(ps.indice_settimana) + ' · Seduta ' + esc(ps.indice_seduta) + '</p>';
      if (ps.titolo) html += '<p class="lift-title">' + esc(ps.titolo) + '</p>';
      html += '<div class="unlock-note unlock-wait">';
      html += '<p class="unlock-title">Allenamento non ancora sbloccato</p>';
      html += '<p class="muted">Passa la tessera in reception per sbloccare la seduta di oggi.</p>';
      html += '</div>';
      html += '<p class="unlock-hint muted small">Se sei in palestra senza tessera, chiedi allo staff di registrare il check-in manualmente.</p>';
    } else if (!ps && checked) {
      // Caso 2 — check-in fatto ma nessuna seduta PROSSIMA
      html += '<div class="unlock-note unlock-wait">';
      html += '<p class="unlock-title">Nessuna seduta disponibile</p>';
      html += '<p class="muted">Il check-in è registrato, ma non c\'è una seduta impostata dal coach.</p>';
      html += '</div>';
      html += '<p class="unlock-hint muted small">Chiedi al trainer di preparare o impostare la prossima seduta.</p>';
    } else {
      // Nessuna seduta e nessun check-in
      html += '<div class="unlock-note unlock-wait">';
      html += '<p class="unlock-title">Allenamento non ancora sbloccato</p>';
      html += '<p class="muted">Passa la tessera in reception per sbloccare la seduta di oggi.</p>';
      html += '</div>';
      html += '<p class="unlock-hint muted small">Se sei in palestra senza tessera, chiedi allo staff di registrare il check-in manualmente.</p>';
    }
    html += '</section>';

    html += '<p class="brand-footer">Accademia · Élite Training Club</p>';

    root.innerHTML = html;
  }

  /* -------------------- CRONOMETRO ------------------ */
  var crono = { elapsed: 0, running: false, t0: 0, raf: null, el: null };

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
  }

  function cronoCurrent() {
    return crono.elapsed + (crono.running ? (Date.now() - crono.t0) : 0);
  }

  function cronoTick() {
    if (crono.el) crono.el.textContent = fmtTime(cronoCurrent());
    if (crono.running) crono.raf = window.requestAnimationFrame(cronoTick);
  }

  function cronoStart() {
    if (crono.running) return;
    crono.running = true;
    crono.t0 = Date.now();
    cronoTick();
    updateCronoButtons();
  }

  function cronoPause() {
    if (!crono.running) return;
    crono.elapsed = cronoCurrent();
    crono.running = false;
    if (crono.raf) window.cancelAnimationFrame(crono.raf);
    if (crono.el) crono.el.textContent = fmtTime(crono.elapsed);
    updateCronoButtons();
  }

  function cronoReset() {
    crono.running = false;
    crono.elapsed = 0;
    if (crono.raf) window.cancelAnimationFrame(crono.raf);
    if (crono.el) crono.el.textContent = fmtTime(0);
    updateCronoButtons();
  }

  function updateCronoButtons() {
    var startBtn = document.getElementById('cronoStart');
    var pauseBtn = document.getElementById('cronoPause');
    if (startBtn) startBtn.style.display = crono.running ? 'none' : '';
    if (pauseBtn) pauseBtn.style.display = crono.running ? '' : 'none';
  }

  function cronoHtml() {
    return '' +
      '<div class="crono" id="crono">' +
        '<div class="crono-display" id="cronoDisplay">00:00</div>' +
        '<div class="crono-controls">' +
          '<button type="button" class="btn btn-primary crono-btn" id="cronoStart">Avvia</button>' +
          '<button type="button" class="btn crono-btn" id="cronoPause" style="display:none">Pausa</button>' +
          '<button type="button" class="btn btn-ghost crono-btn" id="cronoReset">Azzera</button>' +
        '</div>' +
      '</div>';
  }

  function wireCrono() {
    crono.el = document.getElementById('cronoDisplay');
    var s = document.getElementById('cronoStart');
    var p = document.getElementById('cronoPause');
    var r = document.getElementById('cronoReset');
    if (s) s.addEventListener('click', cronoStart);
    if (p) p.addEventListener('click', cronoPause);
    if (r) r.addEventListener('click', cronoReset);
    cronoReset();
  }

  /* -------------------- WORKOUT --------------------- */
  var saveTimers = {};

  function feedbackFor(list, esercizioId) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].esercizio_id === esercizioId) return list[i];
    }
    return null;
  }

  function exerciseRow(ex, fb, idx, total) {
    var f = fb || {};
    var stato = f.stato || '';
    var done = (stato === 'completato' || stato === 'saltato') ? '1' : '0';
    var v = function (x) { return x == null ? '' : esc(x); };
    var target = [
      ex.serie != null ? esc(ex.serie) + ' serie' : '',
      ex.ripetizioni ? '× ' + esc(ex.ripetizioni) : '',
      ex.carico ? '@ ' + esc(ex.carico) : '',
      ex.recupero ? 'rec ' + esc(ex.recupero) : '',
    ].filter(Boolean).join('  ');
    return '' +
      '<div class="card exercise" data-ex="' + ex.id + '" data-stato="' + stato + '" data-done="' + done + '">' +
        '<div class="ex-head">' +
          '<span class="ex-count">Esercizio ' + (idx + 1) + ' / ' + total + '</span>' +
          '<span class="ex-done-badge' + (stato === 'saltato' ? ' ex-done-badge--skip' : '') + '" data-done-badge>' + (stato === 'saltato' ? 'Saltato' : 'Completato') + '</span>' +
        '</div>' +
        '<div class="ex-title-row"><span class="ex-num">' + (idx + 1) + '</span><strong class="ex-name">' + esc(ex.nome) + '</strong></div>' +
        (target ? '<p class="ex-target">' + target + '</p>' : '') +
        (ex.note ? '<p class="muted small ex-note">' + esc(ex.note) + '</p>' : '') +
        '<div class="grid grid-2">' +
          '<label>Carico usato<input type="text" inputmode="decimal" name="carico_effettivo" value="' + v(f.carico_effettivo) + '" placeholder="es. 60 kg"></label>' +
          '<label>Ripetizioni fatte<input type="text" inputmode="numeric" name="reps_effettive" value="' + v(f.reps_effettive) + '" placeholder="es. 8 8 7"></label>' +
        '</div>' +
        '<label>Sforzo percepito (1-5)<input type="number" min="1" max="5" name="difficolta" value="' + v(f.difficolta) + '" placeholder="1 = facile · 5 = massimo"></label>' +
        '<label>Note<textarea name="note" rows="2" placeholder="Sensazioni, dolori, appunti...">' + v(f.note) + '</textarea></label>' +
        '<div class="ex-foot">' +
          '<p class="save-state muted small" data-state></p>' +
          '<button type="button" class="btn btn-ghost small ex-skip' + (stato === 'saltato' ? ' ex-skip--active' : '') + '" data-skip>' + (stato === 'saltato' ? 'Saltato ✓' : 'Salta') + '</button>' +
          '<button type="button" class="btn small ex-complete' + (stato === 'completato' ? ' btn-primary' : '') + '" data-complete>' + (stato === 'completato' ? 'Completato ✓' : 'Completa') + '</button>' +
        '</div>' +
      '</div>';
  }

  function collectRow(rowEl) {
    var get = function (n) {
      var el = rowEl.querySelector('[name="' + n + '"]');
      return el ? el.value : '';
    };
    return {
      carico_effettivo: get('carico_effettivo'),
      reps_effettive: get('reps_effettive'),
      difficolta: get('difficolta'),
      note: get('note'),
    };
  }

  function autosaveRow(rowEl) {
    var id = rowEl.getAttribute('data-ex');
    var stateEl = rowEl.querySelector('[data-state]');
    if (stateEl) { stateEl.textContent = 'Salvataggio…'; stateEl.className = 'save-state muted small'; }
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      api('/cliente/api/esercizi/' + id + '/feedback', {
        method: 'POST',
        body: collectRow(rowEl),
      }).then(function () {
        if (stateEl) { stateEl.textContent = '✓ Salvato'; stateEl.className = 'save-state save-ok small'; }
      }).catch(function (e) {
        if (stateEl) { stateEl.textContent = 'Errore: ' + e.message; stateEl.className = 'save-state save-err small'; }
      });
    }, 600);
  }

  function renderWorkout(data) {
    var seduta = data.seduta || {};
    var esercizi = data.esercizi || [];
    var fbList = data.feedback || [];
    var fs = data.feedback_seduta || {};

    var total = esercizi.length;

    var html = '';
    html += '<section class="hero hero-workout">';
    html += '<p class="hero-eyebrow">Allenamento di oggi</p>';
    html += '<h1 class="hero-title">' + (seduta.titolo ? esc(seduta.titolo) : 'Seduta ' + esc(seduta.indice_seduta)) + '</h1>';
    html += '<p class="hero-status">Settimana ' + esc(seduta.indice_settimana) + ' · Seduta ' + esc(seduta.indice_seduta) + '  ' + badgeHtml('In corso', 'ok') + '</p>';
    html += '</section>';

    if (total) {
      html += '<div class="wk-progress"><div class="wk-progress-track"><div class="wk-progress-fill" id="wkProgressFill" style="width:0%"></div></div>' +
        '<span class="wk-progress-label" id="wkProgressLabel">0 / ' + total + ' completati</span></div>';
    }

    html += cronoHtml();

    html += '<div id="exercises">';
    for (var i = 0; i < esercizi.length; i++) {
      html += exerciseRow(esercizi[i], feedbackFor(fbList, esercizi[i].id), i, total);
    }
    if (!esercizi.length) {
      html += '<div class="card empty-state"><p class="empty-title">Nessun esercizio</p><p class="muted">Questa seduta non contiene esercizi.</p></div>';
    }
    html += '</div>';

    html += '<section class="card wk-finish"><h2 class="section-title">Come è andata?</h2>';
    html += '<label>Voto complessivo (1-5)<input type="number" id="sedutaVoto" min="1" max="5" value="' +
      (fs.voto == null ? '' : esc(fs.voto)) + '"></label>';
    html += '<label>Commento per il coach<textarea id="sedutaCommento" rows="3" placeholder="Com\'è andata la seduta?">' + esc(fs.commento || '') + '</textarea></label>';
    html += '<p id="completaState" class="muted small"></p>';
    html += '</section>';

    html += '<div class="wk-cta"><button id="btnCompleta" class="btn btn-primary btn-block" data-seduta="' + seduta.id + '">Concludi la seduta</button></div>';

    root.innerHTML = html;

    wireCrono();

    function updateProgress() {
      var rows = root.querySelectorAll('.exercise');
      var completati = root.querySelectorAll('.exercise[data-stato="completato"]').length;
      var saltati = root.querySelectorAll('.exercise[data-stato="saltato"]').length;
      var gestiti = completati + saltati;
      var fill = document.getElementById('wkProgressFill');
      var label = document.getElementById('wkProgressLabel');
      var pc = rows.length ? Math.round((gestiti / rows.length) * 100) : 0;
      if (fill) fill.style.width = pc + '%';
      // La barra avanza per completati + saltati; il testo distingue i due casi.
      if (label) label.textContent = saltati > 0
        ? completati + ' completati · ' + saltati + ' saltati'
        : completati + ' / ' + rows.length + ' completati';
    }

    function applyStatoToRow(rowEl, stato, doneBtn, skipBtn) {
      var s = stato || '';
      rowEl.setAttribute('data-stato', s);
      rowEl.setAttribute('data-done', (s === 'completato' || s === 'saltato') ? '1' : '0');
      var badge = rowEl.querySelector('[data-done-badge]');
      if (badge) {
        badge.textContent = s === 'saltato' ? 'Saltato' : 'Completato';
        badge.className = 'ex-done-badge' + (s === 'saltato' ? ' ex-done-badge--skip' : '');
      }
      if (doneBtn) {
        doneBtn.textContent = s === 'completato' ? 'Completato ✓' : 'Completa';
        doneBtn.className = 'btn small ex-complete' + (s === 'completato' ? ' btn-primary' : '');
      }
      if (skipBtn) {
        skipBtn.textContent = s === 'saltato' ? 'Saltato ✓' : 'Salta';
        skipBtn.className = 'btn btn-ghost small ex-skip' + (s === 'saltato' ? ' ex-skip--active' : '');
      }
    }

    function setStato(rowEl, stato, doneBtn, skipBtn) {
      var id = rowEl.getAttribute('data-ex');
      var stateEl = rowEl.querySelector('[data-state]');
      var payload = collectRow(rowEl);
      payload.stato = stato;
      if (stateEl) { stateEl.textContent = 'Salvataggio…'; stateEl.className = 'save-state muted small'; }
      api('/cliente/api/esercizi/' + id + '/feedback', { method: 'POST', body: payload })
        .then(function (res) {
          applyStatoToRow(rowEl, (res.feedback && res.feedback.stato) || stato || '', doneBtn, skipBtn);
          if (stateEl) { stateEl.textContent = '✓ Salvato'; stateEl.className = 'save-state save-ok small'; }
          updateProgress();
        }).catch(function (e) {
          if (stateEl) { stateEl.textContent = 'Errore: ' + e.message; stateEl.className = 'save-state save-err small'; }
        });
    }

    // Autosave esercizi
    root.querySelectorAll('.exercise').forEach(function (rowEl) {
      rowEl.querySelectorAll('input, textarea').forEach(function (el) {
        el.addEventListener('input', function () { autosaveRow(rowEl); });
        el.addEventListener('change', function () { autosaveRow(rowEl); });
      });
      // Completa / Salta: salva stato persistente nel DB (no toggle-off in V1).
      var doneBtn = rowEl.querySelector('[data-complete]');
      var skipBtn = rowEl.querySelector('[data-skip]');
      if (doneBtn) doneBtn.addEventListener('click', function () {
        if (rowEl.getAttribute('data-stato') === 'completato') return;
        setStato(rowEl, 'completato', doneBtn, skipBtn);
      });
      if (skipBtn) skipBtn.addEventListener('click', function () {
        if (rowEl.getAttribute('data-stato') === 'saltato') return;
        var nextEl = rowEl.nextElementSibling;
        setStato(rowEl, 'saltato', doneBtn, skipBtn);
        if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    updateProgress();

    // Completa
    var btn = document.getElementById('btnCompleta');
    if (btn) {
      btn.addEventListener('click', function () {
        var sid = btn.getAttribute('data-seduta');
        var state = document.getElementById('completaState');
        btn.disabled = true;
        if (state) state.textContent = 'Invio in corso…';
        api('/cliente/api/seduta/' + sid + '/completa', {
          method: 'POST',
          body: {
            voto: document.getElementById('sedutaVoto').value,
            commento: document.getElementById('sedutaCommento').value,
          },
        }).then(function () {
          window.location.href = '/cliente?ok=' + encodeURIComponent('Allenamento inviato. Il coach lo revisionerà a breve.');
        }).catch(function (e) {
          btn.disabled = false;
          if (state) state.textContent = 'Errore: ' + e.message;
        });
      });
    }
  }

  /* --------------------- boot ----------------------- */
  function fail(msg) {
    root.innerHTML = '<div class="card empty-state"><p class="empty-title">Qualcosa non va</p>' +
      '<p class="muted">' + esc(msg) + '</p>' +
      '<p><a class="btn btn-ghost" href="/cliente">Torna alla home</a></p></div>';
  }

  if (page === 'workout') {
    api('/cliente/api/allenamento').then(renderWorkout).catch(function (e) {
      if (e.code === 'checkin_required' || e.code === 'no_workout') {
        window.location.href = '/cliente?err=' + encodeURIComponent(e.message);
        return;
      }
      fail(e.message);
    });
  } else {
    api('/cliente/api/me').then(renderHome).catch(function (e) { fail(e.message); });
  }
})();

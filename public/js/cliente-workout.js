/* Area cliente Accademia — home / scheda / allenamento live. Stack: vanilla JS, no framework. */
(function () {
  'use strict';

  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
      return r.json().catch(function(){ return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          var e = new Error((j && j.message) || (j && j.error) || ('HTTP '+r.status));
          e.code = j && j.error; throw e;
        }
        return j;
      });
    });
  }

  /* ================================================================
     HOME
  ================================================================ */
  function renderHome(data) {
    var c   = data.cliente || {};
    var ps  = data.prossima_seduta;
    var chk = data.checked_in_today;
    var sbk = data.allenamento_sbloccato;
    var sal = data.saldo_ingressi;
    var nome = c.nome || '';

    var saldoHtml;
    if (data.mensile_attivo) {
      var mFine = data.mensile_attivo.data_fine ? data.mensile_attivo.data_fine.substring(0, 10).split('-').reverse().join('/') : '';
      saldoHtml = '<span class="ck-badge ck-badge--ok">Abbonamento mensile attivo</span>';
      if (mFine) saldoHtml += '<span class="ck-big-unit"> fino al ' + esc(mFine) + '</span>';
    } else if (sal == null) {
      saldoHtml = '<span class="ck-muted">—</span>';
    } else if (sal > 0) {
      saldoHtml = '<span class="ck-big-num">'+esc(sal)+'</span><span class="ck-big-unit"> ingressi disponibili</span>';
    } else if (sal === 0) {
      saldoHtml = '<span class="ck-big-num">0</span><span class="ck-big-unit"> ingressi disponibili</span>';
    } else {
      saldoHtml = '<span class="ck-badge ck-badge--danger">Da regolarizzare</span>';
    }

    var h = '';
    h += '<p class="ck-eyebrow">Area cliente</p>';
    h += '<h1 class="ck-h1">'+esc(nome ? 'Pronto ad allenarti,' : 'Pronto ad allenarti?')+(nome ? '<br><span class="ck-name">'+esc(nome)+'?</span>' : '')+'</h1>';
    h += '<p class="ck-subtitle">Scheda, log e abbonamento — tutto a portata di mano.</p>';

    h += '<div class="ck-card ck-card--mem">';
    h += '<p class="ck-label">Il tuo abbonamento</p>';
    h += '<div class="ck-mem-body">'+saldoHtml+'</div>';
    if (sal < 0) {
      h += '<p class="ck-mem-hint">Contatta la palestra per sistemare l\'abbonamento.</p>';
    } else {
      h += '<p class="ck-mem-checkin '+(chk?'ok':'')+'">'+(chk ? '<span>&#10003; Check-in effettuato oggi</span>' : 'Nessun check-in oggi')+'</p>';
    }
    h += '</div>';

    if (ps && sbk) {
      h += '<a class="ck-action-card" href="/cliente/allenamento">';
    } else {
      h += '<div class="ck-action-card ck-action-card--dim">';
    }
    h += '<span class="ck-action-icon">&#127947;</span><div class="ck-action-body">';
    h += '<p class="ck-action-title">Scheda di oggi</p>';
    if (ps) {
      h += '<p class="ck-action-sub">Sett. '+esc(ps.indice_settimana)+' &middot; Sed. '+esc(ps.indice_seduta);
      if (ps.titolo) h += ' — '+esc(ps.titolo);
      h += (sbk ? '' : ' &middot; Passa la tessera per sbloccare')+'</p>';
    } else {
      h += '<p class="ck-action-sub">Nessuna seduta pronta. Contatta il trainer.</p>';
    }
    h += '</div>';
    if (ps && sbk) { h += '<span class="ck-action-arrow">&#8599;</span></a>'; }
    else { h += '</div>'; }

    h += '<div class="ck-action-card ck-action-card--dim"><span class="ck-action-icon">&#128180;</span><div class="ck-action-body"><p class="ck-action-title">Ingressi e accesso</p><p class="ck-action-sub">'+(chk?'Check-in effettuato oggi':'Nessun check-in registrato')+'</p></div></div>';

    root.innerHTML = h;
  }

  /* ================================================================
     WORKOUT
  ================================================================ */
  var wkState = { mode: 'overview', currentIdx: 0, localStato: {} };
  var saveTimers = {};

  function feedbackFor(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].esercizio_id === id) return list[i];
    }
    return null;
  }

  function collectFeedback(rowEl) {
    var g = function(n){ var el = rowEl.querySelector('[name="'+n+'"]'); return el ? el.value : ''; };
    return { carico_effettivo: g('carico_effettivo'), reps_effettive: g('reps_effettive'), difficolta: '', note: g('note') };
  }

  function autosave(rowEl) {
    var id = rowEl.getAttribute('data-ex');
    var st = rowEl.querySelector('[data-st]');
    if (st) { st.textContent = 'Salvataggio…'; st.className = 'ck-save'; }
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function() {
      api('/cliente/api/esercizi/'+id+'/feedback', { method:'POST', body: collectFeedback(rowEl) })
        .then(function(){ if(st){ st.textContent = '✓ Salvato'; st.className = 'ck-save ck-save-ok'; } })
        .catch(function(){ if(st){ st.textContent = 'Errore'; st.className = 'ck-save ck-save-err'; } });
    }, 700);
  }

  function renderWorkout(data) {
    var seduta   = data.seduta   || {};
    var esercizi = data.esercizi || [];
    var fbList   = data.feedback || [];
    var fs       = data.feedback_seduta || {};

    wkState.localStato = {};
    var firstTodo = -1;
    for (var ii = 0; ii < esercizi.length; ii++) {
      var fInit = feedbackFor(fbList, esercizi[ii].id) || {};
      wkState.localStato[esercizi[ii].id] = fInit.stato || '';
      if (firstTodo === -1 && !wkState.localStato[esercizi[ii].id]) firstTodo = ii;
    }
    wkState.currentIdx = firstTodo >= 0 ? firstTodo : 0;

    /* overview card — cliccabile per aprire esercizio specifico */
    function exOverviewCard(ex, idx) {
      var num = String(idx+1).padStart(2,'0');
      var stato = wkState.localStato[ex.id]||'';
      var params = [
        ex.serie != null ? esc(ex.serie)+' serie' : '',
        ex.ripetizioni ? esc(ex.ripetizioni)+' reps' : '',
        ex.rpe         ? 'RPE '+esc(ex.rpe)         : '',
        ex.carico       ? esc(ex.carico)             : '',
        ex.recupero     ? 'rec '+esc(ex.recupero)    : '',
      ].filter(Boolean);
      var statoBadge = stato === 'completato' ? ' <span class="ck-stato-pill ck-stato-completato">✓</span>'
                     : stato === 'saltato'    ? ' <span class="ck-stato-pill ck-stato-saltato">S</span>' : '';
      var h = '<button type="button" class="ck-ex-overview" data-open="'+idx+'">';
      h += '<div class="ck-ex-num">'+num+'</div>';
      h += '<div class="ck-ex-info">';
      h += '<p class="ck-ex-name">'+esc(ex.nome)+statoBadge+'</p>';
      if (params.length) h += '<p class="ck-ex-params">'+params.join(' &middot; ')+'</p>';
      if (ex.note) h += '<p class="ck-ex-note">'+esc(ex.note)+'</p>';
      h += '</div></button>';
      return h;
    }

    function exLiveCard(ex, fb, idx, total) {
      var stato = wkState.localStato[ex.id] || '';
      var f = fb || {};
      var v = function(x){ return x == null ? '' : esc(x); };
      var params = [
        ex.serie != null ? esc(ex.serie)+' serie' : '',
        ex.ripetizioni ? esc(ex.ripetizioni)+' reps' : '',
        ex.rpe         ? 'RPE '+esc(ex.rpe)         : '',
        ex.carico       ? esc(ex.carico)             : '',
        ex.recupero     ? 'rec '+esc(ex.recupero)    : '',
      ].filter(Boolean).join(' &middot; ');
      var h = '<div class="ck-live-card" data-ex="'+esc(ex.id)+'" data-stato="'+esc(stato)+'">';
      h += '<div class="ck-live-head"><div>';
      h += '<p class="ck-live-count">'+String(idx+1).padStart(2,'0')+' / '+String(total).padStart(2,'0')+'</p>';
      h += '<p class="ck-live-name">'+esc(ex.nome)+'</p>';
      if (params) h += '<p class="ck-live-params">'+params+'</p>';
      if (ex.note) h += '<p class="ck-live-note">'+esc(ex.note)+'</p>';
      h += '</div>';
      h += '<span class="ck-stato-pill ck-stato-'+(stato||'todo')+'" data-stato-pill>';
      h += stato==='completato' ? '✓ Completato' : stato==='saltato' ? 'Saltato' : 'In corso';
      h += '</span></div>';
      h += '<div class="ck-fb-grid">';
      h += '<label class="ck-fl"><span>Carico usato</span><input type="text" name="carico_effettivo" value="'+v(f.carico_effettivo)+'" placeholder="es. 20kg, elastico, corpo libero"></label>';
      h += '<label class="ck-fl"><span>Reps fatte</span><input type="text" name="reps_effettive" value="'+v(f.reps_effettive)+'" placeholder="es. 8, 8-10, 8 8 7, max"></label>';
      h += '</div>';
      h += '<label class="ck-fl ck-fl--full"><span>Feedback / note</span><textarea name="note" rows="2" placeholder="Feedback / note">'+v(f.note)+'</textarea></label>';
      h += '<p class="ck-save" data-st></p>';
      h += '</div>';
      return h;
    }

    function showOverview() {
      var doneN = 0, skipN = 0;
      for (var k=0; k<esercizi.length; k++) {
        var s = wkState.localStato[esercizi[k].id]||'';
        if (s==='completato') doneN++; else if(s==='saltato') skipN++;
      }
      var h = '<a class="ck-back" href="/cliente">← Home</a>';
      h += '<p class="ck-eyebrow">ALLENAMENTO</p>';
      h += '<h1 class="ck-h1">Scheda di oggi</h1>';
      h += '<p class="ck-subtitle">Sett. '+esc(seduta.indice_settimana)+' &middot; Sed. '+esc(seduta.indice_seduta)+' &middot; '+esc(esercizi.length)+' esercizi pianificati</p>';
      h += '<div class="ck-overview-list">';
      for (var i=0; i<esercizi.length; i++) h += exOverviewCard(esercizi[i], i);
      h += '</div>';
      if (!esercizi.length) h += '<p class="ck-muted">Nessun esercizio in questa seduta.</p>';
      h += '<button type="button" id="btnStartLive" class="ck-btn-primary">'+(doneN+skipN>0?'Continua allenamento':'Inizia seduta')+'</button>';
      root.innerHTML = h;
      /* "Inizia seduta" → live */
      var btn = document.getElementById('btnStartLive');
      if (btn) btn.addEventListener('click', function(){ wkState.mode='live'; showLive(); });
      /* tap su card esercizio → live a quell'indice */
      root.querySelectorAll('[data-open]').forEach(function(el) {
        el.addEventListener('click', function(){
          wkState.currentIdx = parseInt(el.getAttribute('data-open'),10);
          wkState.mode = 'live';
          showLive();
        });
      });
    }

    function showLive() {
      var idx   = wkState.currentIdx;
      var total = esercizi.length;
      var doneN = 0, skipN = 0;
      for (var k=0; k<total; k++) {
        var s = wkState.localStato[esercizi[k].id]||'';
        if (s==='completato') doneN++; else if(s==='saltato') skipN++;
      }
      var allDone = (doneN+skipN) >= total;
      var exStato = wkState.localStato[esercizi[idx].id]||'';

      var h = '<button type="button" class="ck-back" id="btnBackOverview">← Scheda</button>';
      h += '<p class="ck-eyebrow">ALLENAMENTO</p>';
      h += '<h1 class="ck-h1">Esercizio '+(idx+1)+' / '+total+'</h1>';
      h += '<p class="ck-subtitle">'+doneN+' fatti'+(skipN>0?' &middot; '+skipN+' saltati':'')+' &middot; '+(total-doneN-skipN)+' rimanenti</p>';

      /* stepper — dots sempre navigabili */
      h += '<div class="ck-stepper">';
      for (var d=0; d<total; d++) {
        var ds = wkState.localStato[esercizi[d].id]||'';
        var cls = 'ck-dot';
        if (d===idx && !allDone) cls+=' ck-dot--cur';
        else if (ds==='completato') cls+=' ck-dot--done';
        else if (ds==='saltato')    cls+=' ck-dot--skip';
        h += '<button type="button" class="'+cls+'" data-goto="'+d+'"></button>';
      }
      h += '</div>';

      h += exLiveCard(esercizi[idx], feedbackFor(fbList, esercizi[idx].id), idx, total);

      /* bottom bar — adattiva */
      if (!allDone) {
        h += '<div class="ck-bottom-bar">';
        h += '<button type="button" class="ck-bb-back" id="bbPrev"'+(idx===0?' disabled':'')+'>&#8592;</button>';
        /* salta: disabilitato se già saltato */
        if (exStato==='saltato') {
          h += '<button type="button" class="ck-bb-skip" disabled>Saltato</button>';
        } else {
          h += '<button type="button" class="ck-bb-skip" id="bbSkip">Salta</button>';
        }
        /* completa: disabilitato se già completato */
        if (exStato==='completato') {
          h += '<button type="button" class="ck-bb-complete" disabled>✓ Completato</button>';
        } else {
          h += '<button type="button" class="ck-bb-complete" id="bbComplete">Completa</button>';
        }
        h += '</div>';
        /* se sto guardando un gestito, offri "prossimo da fare" */
        if (exStato==='completato'||exStato==='saltato') {
          var nextTodo = -1;
          for (var nt=0; nt<esercizi.length; nt++) {
            if ((wkState.localStato[esercizi[nt].id]||'')==='') { nextTodo=nt; break; }
          }
          if (nextTodo>=0) {
            h += '<button type="button" class="ck-next-todo" data-goto="'+nextTodo+'">Prossimo esercizio →</button>';
          }
        }
      }

      /* summary finale */
      /* riepilogo esercizi prima del summary */
      if (allDone) {
        h += '<div class="ck-riepilogo">';
        h += '<p class="ck-eyebrow">Riepilogo allenamento</p>';
        for (var ri=0; ri<esercizi.length; ri++) {
          var rex = esercizi[ri];
          var rfb = feedbackFor(fbList, rex.id) || {};
          var rst = wkState.localStato[rex.id]||'';
          h += '<div class="ck-riepilogo-row">';
          h += '<span class="ck-ex-num">'+String(ri+1).padStart(2,'0')+'</span>';
          h += '<div class="ck-riepilogo-info">';
          h += '<p class="ck-riepilogo-name">'+esc(rex.nome)+'</p>';
          var parts = [];
          if (rfb.carico_effettivo) parts.push('Carico: '+esc(rfb.carico_effettivo));
          if (rfb.reps_effettive)   parts.push('Reps: '+esc(rfb.reps_effettive));
          if (parts.length) h += '<p class="ck-riepilogo-vals">'+parts.join(' &middot; ')+'</p>';
          if (rfb.note) h += '<p class="ck-riepilogo-note">'+esc(rfb.note)+'</p>';
          h += '</div>';
          h += '<span class="ck-stato-pill ck-stato-'+(rst||'todo')+'">'+( rst==='completato'?'Completato':rst==='saltato'?'Saltato':'—')+'</span>';
          h += '</div>';
        }
        h += '</div>';
      }
      if (allDone) {
        h += '<div class="ck-summary">';
        h += '<h2>Com’\xe8 andata?</h2>';
        h += '<p class="ck-muted">Invia il tuo feedback al coach.</p>';
        h += '<label class="ck-fl ck-fl--full"><span>Feedback / note finali</span>';
        h += '<textarea id="sedutaCommento" rows="4" placeholder="Feedback / note finali">'+esc(fs.commento||'')+'</textarea></label>';
        h += '<p class="ck-save" id="completaState"></p>';
        h += '<button type="button" id="btnCompleta" class="ck-btn-primary" data-seduta="'+esc(seduta.id)+'">Concludi allenamento</button>';
        h += '</div>';
      }

      root.innerHTML = h;
      wireLive();
    }

    function wireLive() {
      /* ← Scheda */
      var backBtn = document.getElementById('btnBackOverview');
      if (backBtn) backBtn.addEventListener('click', function(){ wkState.mode='overview'; showOverview(); });

      /* dots + "prossimo" — tutti i [data-goto] */
      root.querySelectorAll('[data-goto]').forEach(function(d){
        d.addEventListener('click', function(){
          wkState.currentIdx = parseInt(d.getAttribute('data-goto'),10);
          showLive();
        });
      });

      var card = root.querySelector('.ck-live-card');
      if (card) {
        card.querySelectorAll('input,textarea').forEach(function(el){
          el.addEventListener('input',  function(){ autosave(card); });
          el.addEventListener('change', function(){ autosave(card); });
        });
      }

      function saveAndAdvance(stato) {
        if (!card) return;
        var id = card.getAttribute('data-ex');
        var st = card.querySelector('[data-st]');
        var payload = collectFeedback(card);
        payload.stato = stato;
        if(st){ st.textContent='Salvataggio…'; st.className='ck-save'; }
        api('/cliente/api/esercizi/'+id+'/feedback', { method:'POST', body:payload })
          .then(function(res){
            var s = (res.feedback && res.feedback.stato) || stato;
            wkState.localStato[id] = s;
            if(st){ st.textContent='✓ Salvato'; st.className='ck-save ck-save-ok'; }
            /* avanza al prossimo todo, se esiste */
            var next = wkState.currentIdx+1;
            if (next < esercizi.length) wkState.currentIdx = next;
            setTimeout(showLive, 350);
          })
          .catch(function(e){ if(st){ st.textContent='Errore'; st.className='ck-save ck-save-err'; } });
      }

      var skipBtn = document.getElementById('bbSkip');
      if (skipBtn) skipBtn.addEventListener('click', function(){ saveAndAdvance('saltato'); });
      var complBtn = document.getElementById('bbComplete');
      if (complBtn) complBtn.addEventListener('click', function(){ saveAndAdvance('completato'); });
      var prevBtn = document.getElementById('bbPrev');
      if (prevBtn) prevBtn.addEventListener('click', function(){
        if (wkState.currentIdx>0){ wkState.currentIdx--; showLive(); }
      });

      var concludiBtn = document.getElementById('btnCompleta');
      if (concludiBtn) {
        concludiBtn.addEventListener('click', function(){
          var sid = concludiBtn.getAttribute('data-seduta');
          var stEl = document.getElementById('completaState');
          concludiBtn.disabled = true;
          if(stEl) stEl.textContent = 'Invio in corso…';
          api('/cliente/api/seduta/'+sid+'/completa', {
            method:'POST',
            body:{ voto:'', commento: (document.getElementById('sedutaCommento')||{}).value||'' }
          }).then(function(){
            window.location.href = '/cliente?ok='+encodeURIComponent('Allenamento inviato. Il coach lo revisionerà a breve.');
          }).catch(function(e){
            concludiBtn.disabled = false;
            if(stEl) stEl.textContent = 'Errore: '+e.message;
          });
        });
      }
    }

    showOverview();
  }

  /* ================================================================
     FAIL / BOOT
  ================================================================ */
  function fail(msg) {
    root.innerHTML = '<div class="ck-card"><p style="font-weight:700;margin:0 0 8px">Qualcosa non va</p>'+
      '<p class="ck-muted">'+esc(msg)+'</p><br>'+
      '<a href="/cliente" style="color:inherit;font-weight:700">← Torna alla home</a></div>';
  }

  if (page === 'workout') {
    api('/cliente/api/allenamento').then(renderWorkout).catch(function(e){
      if (e.code==='checkin_required'||e.code==='no_workout') {
        window.location.href = '/cliente?err='+encodeURIComponent(e.message);
        return;
      }
      fail(e.message);
    });
  } else {
    api('/cliente/api/me').then(renderHome).catch(function(e){ fail(e.message); });
  }
})();

# AUDIT STEP 7 — Gestionale Palestra

> Audit totale del progetto dopo lo STEP 7 (revisione coach + prepara prossima seduta), prima dello STEP 8.
> Eseguito con 5 agent di analisi in sola lettura + smoke test automatico (36 check). Nessuna correzione applicata: i problemi vanno approvati prima di intervenire.

Data: 2026-06-17 · Branch dati: `data/gestionale.sqlite` invariato.

---

## 1. Stato generale del progetto

Progetto **stabile e funzionante end-to-end**. Tutti i flussi principali sono coerenti: login admin/cliente, protezione route, NFC e check-in, schede, area cliente, feedback, completamento, revisione coach e prepara prossima seduta.

- `node --check`: **16/16 file core OK** (24/24 includendo tutti i service e il frontend).
- Smoke test automatico: **36/36 PASS**.
- Migration applicate: 001, 002, 003, 005, 006 (la 004 non esiste — solo gap di numerazione, innocuo).
- Saldo ingressi correttamente **derivato** da `SUM(movimenti_ingressi.delta)`, mai persistito.
- Vincolo "una sola PROSSIMA per cliente" rispettato in tutti i percorsi testati.
- Regola "prepara prossima": origine resta COMPLETATA, nuova → PROSSIMA, vecchia PROSSIMA → **BOZZA** (override utente rispettato), nessun movimento ingressi.
- **Nessun problema BLOCCANTE.**

---

## 2. Problemi BLOCCANTI

**Nessuno.** Il codice compila, non ci sono crash né perdite di dati nei flussi testati.

---

## 3. Problemi IMPORTANTI

> Da decidere con l'utente. Non correggere d'ufficio.

### IMP-1 — Contratto API `/api/nfc/check` divergente da CLAUDE.md §7.2
`src/services/checkin.service.js`
La spec §7.2 documenta un campo `result` con valori `"ok" | "already_checked_in" | "inactive" | "unknown_card"`. La risposta reale usa invece `motivo` (`ok`, `ok_senza_seduta`, `gia_presente`, `tessera_sconosciuta`, `tessera_disattivata`, `cliente_non_attivo`, `richiesta_non_valida`). Il campo `result` non esiste. Inoltre i casi anomali tornano `ok:false` con HTTP 400 (un lettore esterno potrebbe trattare 4xx come errore di protocollo). Terza nomenclatura ancora diversa per `esito` in `nfc_eventi`.
→ Decidere: allineare il codice a §7.2 **oppure** aggiornare la spec. (Segnalato da 3 agent.)

### IMP-2 — `COMPLETATA` impostata prima della revisione coach (diverge da §6.2)
`src/services/clienteWorkout.service.js` (`completaSeduta`)
§6.2 dice "Una seduta può passare a COMPLETATA solo dopo invio feedback **e revisione coach**". Il flusso reale: invio cliente → COMPLETATA → compare in `/admin/revisioni` → revisione post-hoc (che aggiunge solo `note_coach` + `revisionato_il`, non cambia stato). È internamente coerente con il design STEP 7 (la lista revisioni si basa su `COMPLETATA AND revisionato_il IS NULL`), ma contraddice la lettera del §6.2. Manca uno stato intermedio tipo `INVIATA`/`IN_REVISIONE`.
→ Decidere: aggiornare §6.2 **oppure** introdurre lo stato intermedio.

### IMP-3 — Il cliente può modificare il feedback seduta dopo la revisione coach
`src/services/clienteWorkout.service.js` (`upsertFeedbackSeduta` accetta stato `PROSSIMA` o `COMPLETATA`)
Dopo l'invio la seduta è COMPLETATA, quindi il cliente può continuare a chiamare `POST /cliente/api/seduta/:id/feedback` e cambiare voto/commento anche dopo che il coach ha revisionato. Le `note_coach` sono preservate dall'ON CONFLICT, ma il contenuto su cui il coach si è basato diventa mutabile.
→ Consigliato bloccare l'edit cliente quando `revisionato_il IS NOT NULL`.

### IMP-4 — Vincolo "max 1 PROSSIMA" e transizioni di stato non difesi a livello SQL
`src/services/sedute.service.js` (`setStatoSeduta`) + `001_init.sql`
- L'unicità PROSSIMA è solo applicativa, re-implementata in due punti (`setStatoSeduta` e `revisioni.preparaProssimaSeduta`): rischio di divergenza. È esprimibile come indice parziale (`CREATE UNIQUE INDEX ... ON sedute(cliente_id) WHERE stato='PROSSIMA'` — il commento in 001 che lo dice impossibile è fattualmente errato; SQLite supporta indici parziali da 3.8.0).
- `setStatoSeduta` accetta qualunque stato senza validare la transizione: si può portare una BOZZA direttamente a COMPLETATA, o riportare COMPLETATA → PROSSIMA, bypassando feedback/revisione. Anche l'admin via `POST /sedute/:id/stato` può forzare stati arbitrari.
→ Da realizzare in una **nuova** migration (es. 007) + guardia applicativa. NON modificare migration applicate.

### IMP-5 — Dead code dagli step iniziali (route shadowed + injection inattiva)
`src/server.js`
- Route statica `app.get('/cliente', requireCliente, sendFile)` (riga ~81) mai raggiunta: `clienteRoutes` definisce `/cliente` prima.
- `public/cliente/index.html` e `public/admin/index.html` sono versioni "V1 minima" mai servite (le pagine sono generate inline dalle route).
- Middleware injection `window.__USER__` (righe ~87-111) registrato dopo le route che usano `sendFile` → non si attiva mai.
→ Confusione su "quale pagina viene servita". Pulizia consigliata (rimozione).

### IMP-6 — Navigazione admin incoerente (3 copie divergenti di `adminLayout`)
`admin.routes.js`, `nfc.routes.js`, `schede.routes.js`
La navbar cambia voci a seconda della sezione: "Schede" sparisce nelle pagine NFC/Bacheca/Seduta, e **"Revisioni" non è MAI nel menu** (raggiungibile solo dalla card dashboard). `adminLayout`/`escapeHtml`/`alertBlock`/`backWithMsg`/`wantsHtml` sono duplicati ~4 volte.
→ Refactor con maggior ritorno: estrarre helper/layout condivisi in `src/utils/` + `src/views/`.

### IMP-7 — Endpoint NFC pubblico mutante senza protezione (by-design V1)
`src/routes/nfc.routes.js` + `src/server.js`
`POST /api/nfc/check` è pubblico (corretto per lettore esterno) ma è state-changing (crea presenze, scala movimenti). Nessun shared-secret, rate-limit o binding IP. Chiunque sulla LAN può forzare check-in o enumerare tessere dalla differenza di risposta. **Accettabile per V1 locale**, ma diventa critico se esposto oltre il localhost.
→ Documentare come debito; hardening in roadmap (token lettore / whitelist IP / TLS).

---

## 4. Problemi MINORI

- **MIN-1** — `has_password` sempre `true` (`clienti.service.js`): `!!x !== undefined` è sempre vero. Placeholder errato/inutilizzato.
- **MIN-2** — Home cliente espone metadati PROSSIMA (settimana/seduta/nota) **prima** del check-in (`cliente-workout.js`). Gli esercizi sono correttamente gated, ma §5 dice "solo con check-in il cliente vede la propria PROSSIMA".
- **MIN-3** — Home cliente legge `ps.note`, ma l'editor coach salva `titolo` → la descrizione impostata dal coach non appare mai al cliente.
- **MIN-4** — Accesso DB diretto da route (`schede.routes.js` UPDATE titolo inline): unica violazione di layering. Spostare in `sedute.service` (es. `setTitolo`).
- **MIN-5** — Feature `username` half-wired: login la supporta, ma nessun form admin (`createCliente`/`updateCliente`) permette di impostarla (resta NULL). Il test client ha username solo perché impostato via script.
- **MIN-6** — Race su `presenze`: `findPresenzaOggi` + INSERT non atomici. Il `UNIQUE(cliente_id,data)` protegge l'integrità ma una seconda INSERT simultanea lancerebbe 500 invece di `already_checked_today`. Raro in uso monoutente locale.
- **MIN-7** — `insertEvento` fuori dalla transazione presenza+movimento: se fallisce, presenza senza evento NFC. §7 vuole l'evento "sempre".
- **MIN-8** — `prepara-prossima` accetta qualunque COMPLETATA, non solo "l'ultima" (§6.3): preparando da una vecchia COMPLETATA si può riportare indietro la PROSSIMA attuale. Edge case coach-driven senza guardia.
- **MIN-9** — `copiaEserciziDa` cancella (DELETE) gli esercizi della destinazione prima di copiare: se la BOZZA era già precompilata, il contenuto si perde senza avviso.
- **MIN-10** — PROSSIMA in blocco archiviato resta visibile/sbloccabile al cliente (`getProssimaSedutaCliente` non filtra `archiviato`).
- **MIN-11** — `req.user` ritornato in `/cliente/api/me` è probabilmente `undefined` (il middleware popola `req.cliente`). Campo morto, il frontend usa `data.cliente`.
- **MIN-12** — Ambiguità identifier login cliente: `username OR email OR telefono` con `LIMIT 1` poi fallback ID. Un valore numerico potrebbe coincidere con telefono di uno e id di un altro (serve comunque la password della riga risolta — nessun accesso incrociato, ma record risolto potenzialmente inatteso).
- **MIN-13** — `escapeHtml` non uniforme: `auth.routes.js` usa `String(s)` (rende "null"), le altre copie usano `String(s == null ? '' : s)`.
- **MIN-14** — Label form fissa "Crea blocco (4×5 = 20 sedute BOZZA)" anche se i campi settimane/sedute sono editabili.
- **MIN-15** — Nessun rate-limit/lockout sul login (mitigato solo dal costo bcrypt). Accettabile in locale.
- **MIN-16** — Doppio body-parser ridondante (globale + per-route). Nessun bug, solo ridondanza.
- **MIN-17** — Gap numerazione migration (004 assente). Innocuo, solo tracciabilità.
- **MIN-18** — Nomenclatura esiti incoerente: `esito` (nfc_eventi) vs `motivo` (API) vs `bacheca.TIPI` usano stringhe diverse per concetti equivalenti.

---

## 5. Migliorie consigliate (debito tecnico — non ora)

1. **Estrarre helper/layout condivisi** in `src/utils/` + `src/views/adminLayout.js` (risolve IMP-6 + MIN-13 alla radice; singola refactor a maggior ritorno).
2. **Decidere e unificare il contratto `/api/nfc/check`** (IMP-1) con un'unica nomenclatura per esito/motivo/tipo.
3. **Rimuovere il dead code** (IMP-5): file statici, route shadowed, middleware injection.
4. **Introdurre test automatici**: nessun framework presente. Suggerito `node --test` nativo (zero dipendenze, coerente con "no build step") su DB SQLite in-memory, sui punti a rischio regressione: unicità PROSSIMA, 5 casi check-in, saldo/badge, prepara-prossima.
5. **Completare o rimuovere la feature username** (MIN-5): aggiungere il campo ai form admin.
6. **Unificare `note`/`titolo`** mostrati al cliente (MIN-3).
7. **Badge "Senza scheda"** (§8 punto 3) non implementato in `getBadge` — coerenza di dominio incompleta.
8. **Hardening endpoint NFC** per roadmap (IMP-7): shared-secret / whitelist IP / TLS.

---

## 6. Test eseguiti

- `node --check` su 16 file core (server, routes, middleware, config) + service e frontend: **tutti OK**.
- Smoke test temporaneo `smoke-audit-step7.cjs` (poi rimosso) — server reale su :3000, doppio cookie jar admin/cliente, copertura:
  - login admin + protezione route admin senza sessione (401);
  - `/admin/schede`, `/admin/clienti/:id/scheda`, editor seduta, simulatore NFC, bacheca;
  - admin inesistente NON intercettato da cliente.routes (→ /login);
  - saldo derivato da SUM(movimenti);
  - `POST /api/nfc/check` con `uid` e con `codice`;
  - primo check-in (sblocca PROSSIMA) + secondo check-in stesso giorno (already_checked_today, no doppio scalo);
  - UID sconosciuto → `tessera_sconosciuta` + avviso bacheca;
  - una sola PROSSIMA per cliente;
  - login cliente con username / ID / email;
  - cliente vede PROSSIMA con esercizi; feedback esercizio; feedback seduta; completamento → COMPLETATA;
  - seduta in `/admin/revisioni`; dettaglio revisione con feedback cliente; salva revisione coach;
  - prepara prossima seduta: origine resta COMPLETATA, nuova → PROSSIMA, vecchia PROSSIMA → BOZZA (non SALTATA), una sola PROSSIMA, esercizi copiati, feedback NON copiati;
  - prepara-prossima e revisione NON creano movimenti ingressi.

---

## 7. Risultato smoke test

**36/36 PASS (0 fail).** Tutti i flussi richiesti verificati end-to-end contro un server reale. Script temporaneo rimosso al termine; database e dati di test invariati.

---

## 8. File suggeriti da modificare (solo dopo OK utente)

| Problema | File |
|---|---|
| IMP-1 contratto NFC | `src/services/checkin.service.js`, `src/routes/nfc.routes.js`, (eventualmente `CLAUDE.md §7.2`) |
| IMP-2 stato COMPLETATA | `src/services/clienteWorkout.service.js`, (eventualmente `CLAUDE.md §6.2`) |
| IMP-3 edit feedback post-revisione | `src/services/clienteWorkout.service.js` |
| IMP-4 vincoli SQL/stato | nuova migration `007_*.sql`, `src/services/sedute.service.js` |
| IMP-5 dead code | `src/server.js`, `public/cliente/index.html`, `public/admin/index.html` |
| IMP-6 layout/nav | nuovo `src/views/adminLayout.js` + `src/utils/`, `admin.routes.js`, `nfc.routes.js`, `schede.routes.js` |
| MIN-1 has_password | `src/services/clienti.service.js` |
| MIN-2/3 home cliente | `public/js/cliente-workout.js`, `src/services/clienteWorkout.service.js` |
| MIN-4 layering titolo | `src/routes/schede.routes.js`, `src/services/sedute.service.js` |
| MIN-5 username form | `src/services/clienti.service.js`, `src/routes/admin.routes.js` |

---

## 9. Raccomandazione finale

**Si può procedere allo STEP 8.** Non esistono problemi bloccanti: build pulita, smoke test 36/36, dominio coerente, nessuna regressione sui flussi core.

I problemi IMPORTANTI sono **divergenze semantiche dalla spec** (IMP-1 contratto NFC, IMP-2 stato COMPLETATA) e **debito strutturale** (IMP-4 vincoli SQL, IMP-5 dead code, IMP-6 layout duplicati), non difetti funzionali. Possono essere affrontati in un mini-step di consolidamento dedicato senza bloccare lo STEP 8.

**Raccomandazione operativa:** prima dello STEP 8 conviene chiarire almeno **IMP-1** e **IMP-2** (sono decisioni di specifica: o si cambia il codice o si aggiorna CLAUDE.md), perché toccano il contratto del dominio e influenzano gli step successivi. Gli altri IMPORTANTI sono refactoring rinviabili. Nessuna correzione è stata applicata in attesa del tuo OK.

---

## 10. Decisione finale (consolidamento documentale post-audit)

**Decisione presa: per ora la specifica viene allineata al comportamento implementato e testato. Non si introduce stato IN_REVISIONE in V1.**

In concreto, a seguito dell'approvazione dell'audit:
- **IMP-1** risolto via documentazione: `CLAUDE.md §7.2` è stato riscritto per descrivere la risposta reale (`ok` + `motivo` + campi correlati), con la tabella dei `motivo` validi. Il campo storico `result` non viene introdotto.
- **IMP-2** risolto via documentazione: `CLAUDE.md §6.1/§6.2` chiarisce che il completamento del cliente porta la seduta a `COMPLETATA`, che "da revisionare" è derivato da `revisionato_il IS NULL` e che la revisione coach aggiunge `note_coach` + `revisionato_il` senza cambiare stato. Nessuno stato `IN_REVISIONE`/`INVIATA`.
- Gli altri debiti tecnici (IMP-3, IMP-4, IMP-5, IMP-6, hardening NFC, username form, feedback bloccato post-revisione) sono registrati in `CLAUDE.md §15` come debito noto, da affrontare in step dedicati. Nessun codice funzionale è stato modificato in questo mini-step.

**Esito:** si può procedere allo STEP 8.

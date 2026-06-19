# REFACTOR PLAN — STEP BY STEP

## Premessa

Questo piano descrive il refactor operativo da eseguire in modo incrementale.
In questa fase è solo documentazione: non autorizza ancora modifiche architetturali non concordate.

Regole trasversali a tutti gli step:
- non rigenerare da zero la logica blocchi/sedute;
- non sostituire il modello NFC esistente se non necessario;
- non cambiare il modello saldo ingressi a ledger;
- non introdurre feature extra;
- non duplicare nuove route o nuove UI;
- procedere per step piccoli, verificabili e reversibili.

---

## STEP 1 — Cleanup strutturale

### Obiettivo
Pulire il progetto da codice morto, file non usati, route shadowed e duplicazioni banali senza cambiare la logica business.

### File coinvolti
- `src/server.js`
- `public/admin/index.html`
- `public/cliente/index.html`
- eventuali file che contengono riferimenti al middleware `window.__USER__`
- eventuali punti con funzioni duplicate evidenti e inutilizzate

### Cosa fare
- identificare e rimuovere i file HTML morti non più serviti dal flusso reale;
- rimuovere la route statica `/cliente` se confermata shadowed dalla route viva;
- rimuovere il middleware `window.__USER__` se confermato non usato;
- rimuovere duplicazioni evidenti che non spostano logica business;
- correggere doppie definizioni locali chiaramente ridondanti.

### Cosa NON fare
- non cambiare route funzionali vive;
- non cambiare flusso login;
- non cambiare logica NFC;
- non cambiare logica schede/sedute;
- non cambiare database;
- non cambiare UI in senso grafico;
- non rinominare strutture dominio se questo comporta impatti diffusi.

### Criteri di completamento
- nessun file morto lasciato nel flusso principale;
- nessuna route shadowed inutile mantenuta;
- nessun middleware morto lasciato nel bootstrap;
- nessuna doppia funzione locale evidente rimasta nei punti già censiti;
- l'app continua a comportarsi come prima.

### Test manuali
- avvio applicazione;
- accesso admin;
- accesso cliente;
- apertura `/admin`;
- apertura `/cliente`;
- apertura `/cliente/allenamento` con comportamento invariato;
- verifica che non ci siano errori server dopo la rimozione del codice morto.

---

## STEP 2 — Centralizzazione helper

### Obiettivo
Spostare gli helper duplicati in moduli condivisi, senza cambiare comportamento.

### File coinvolti
- `src/views/adminLayout.js`
- `src/middleware/auth.js`
- `src/routes/admin.routes.js`
- `src/routes/schede.routes.js`
- `src/routes/nfc.routes.js`
- `src/routes/backup.routes.js`
- `src/routes/cliente.routes.js`
- `src/routes/auth.routes.js`
- eventuale nuova cartella `src/utils/`

### Cosa fare
- centralizzare `escapeHtml`;
- centralizzare `wantsHtml`;
- centralizzare `alertBlock`;
- centralizzare `backWithMsg`;
- centralizzare formatter data/importi se ripetuti;
- ridurre i duplicati importando da un solo modulo condiviso.

### Cosa NON fare
- non modificare i contenuti delle pagine oltre il minimo necessario;
- non cambiare il copy della UI se non serve al refactor;
- non cambiare i flussi business;
- non introdurre un framework di template.

### Criteri di completamento
- gli helper sopra vivono in un solo posto o in un set minimo e coerente di moduli;
- i router non hanno più copie locali inutili degli stessi helper;
- output HTML e redirect restano equivalenti a prima.

### Test manuali
- login admin e cliente;
- redirect con messaggi `ok`/`err` in pagine admin;
- bacheca, NFC, schede, backup, cliente: nessun errore di rendering;
- visualizzazione corretta di testi con escaping HTML.

---

## STEP 3 — Refactor route / service

### Obiettivo
Chiarire le responsabilità tra router, servizi e rendering, mantenendo la logica esistente.

### File coinvolti
- `src/routes/admin.routes.js`
- `src/routes/schede.routes.js`
- `src/routes/nfc.routes.js`
- `src/routes/cliente.routes.js`
- `src/services/checkin.service.js`
- `src/services/sedute.service.js`
- `src/services/revisioni.service.js`
- `src/services/clienteWorkout.service.js`
- `src/services/schede.service.js`
- `src/services/esercizi.service.js`
- eventuali nuovi helper/service di lettura condivisa

### Cosa fare
- spostare query duplicate nei service corretti;
- consolidare la logica di lettura di prossima seduta;
- consolidare la logica di lettura feedback seduta/esercizi;
- alleggerire i router, lasciando loro soprattutto orchestrazione HTTP;
- separare meglio rendering, validazione, orchestrazione business.

### Cosa NON fare
- non cambiare la semantica di `PROSSIMA`, `COMPLETATA`, `SALTATA`;
- non cambiare la logica di check-in del giorno;
- non cambiare la preparazione della prossima seduta;
- non introdurre nuovi stati o nuove entità dominio;
- non riscrivere tutto in API-first o SPA completa.

### Criteri di completamento
- minore duplicazione tra servizi;
- router più corti e più leggibili;
- nessun cambiamento funzionale percepibile lato utente;
- funzioni dominio più facili da seguire e testare.

### Test manuali
- creare cliente;
- associare tessera;
- registrare pagamento;
- creare blocco;
- aprire seduta;
- modificare esercizi;
- fare check-in NFC;
- completare allenamento cliente;
- revisionare seduta;
- usare “prepara prossima seduta”.

---

## STEP 4 — UI admin

### Obiettivo
Riordinare la UI admin mantenendo funzioni e logiche esistenti.

### File coinvolti
- `src/views/adminLayout.js`
- `public/css/app.css`
- `src/routes/admin.routes.js`
- `src/routes/schede.routes.js`
- `src/routes/nfc.routes.js`
- `src/routes/export.routes.js`
- `src/routes/backup.routes.js`

### Cosa fare
- rendere la navigazione admin coerente e sempre evidenziata;
- semplificare dashboard e percorsi principali;
- rendere più leggibile il dettaglio cliente;
- dare maggiore centralità a “Schede da revisionare”;
- separare meglio aree NFC, clienti, schede, pacchetti, backup/export;
- mantenere stile professionale, semplice e ordinato.

### Cosa NON fare
- non cambiare logica business;
- non cambiare struttura DB;
- non introdurre nuove pagine non necessarie;
- non creare una seconda UI parallela.

### Criteri di completamento
- navigazione più chiara;
- meno densità visiva inutile;
- percorsi principali evidenti;
- nessuna regressione nelle operazioni amministrative.

### Test manuali
- navigare tutte le sezioni admin;
- controllare stato attivo menu;
- creare/aggiornare cliente;
- registrare pagamento;
- gestire NFC;
- accedere a schede e revisioni;
- verificare leggibilità mobile/tablet minima lato admin.

---

## STEP 5 — UI cliente

### Obiettivo
Riordinare l'area cliente mantenendo il flusso mobile-first e le funzioni attuali.

### File coinvolti
- `src/routes/cliente.routes.js`
- `public/js/cliente-workout.js`
- `public/css/app.css`
- eventuale helper/layout condiviso cliente

### Cosa fare
- semplificare la shell cliente;
- rendere più chiaro lo stato di accesso all'allenamento;
- migliorare leggibilità e compilazione della seduta;
- mantenere autosave, timer, stato esercizio, note, invio finale;
- trattare esplicitamente il login come accesso con codice cliente.

### Cosa NON fare
- non cambiare la regola NFC di sblocco;
- non cambiare il flusso di completamento seduta;
- non aggiungere nuove feature cliente fuori scope;
- non trasformare l'area cliente in una nuova architettura frontend complessa.

### Criteri di completamento
- area cliente più leggibile su smartphone;
- flusso più lineare dal login alla seduta;
- nessuna perdita delle funzioni attuali;
- codice client-side più organizzato.

### Test manuali
- login cliente con codice cliente;
- accesso a home cliente;
- stato bloccato prima del check-in;
- sblocco dopo check-in valido;
- compilazione esercizi;
- autosave;
- timer;
- invio finale seduta;
- visualizzazione note coach se previste dal flusso.

---

## STEP 6 — Hardening NFC / Raspberry

### Obiettivo
Preparare il progetto a un deploy locale più robusto, senza alterare il dominio.

### File coinvolti
- `src/routes/nfc.routes.js`
- `src/services/checkin.service.js`
- `src/server.js`
- `src/config.js`
- `src/services/backup.service.js`
- eventuali middleware di protezione richiesta

### Cosa fare
- valutare protezione endpoint NFC con token condiviso e/o whitelist IP;
- rivedere il comportamento sessioni per deploy locale;
- verificare robustezza backup/restore;
- ridurre punti fragili per Raspberry;
- valutare ottimizzazioni leggere per query ripetute.

### Cosa NON fare
- non introdurre servizi cloud;
- non cambiare stack;
- non riscrivere il sistema NFC da zero;
- non cambiare il database senza necessità reale;
- non trasformare il progetto in multiutente avanzato.

### Criteri di completamento
- endpoint NFC meno esposto;
- deploy locale più prevedibile;
- backup più affidabile operativamente;
- nessuna regressione nel flusso check-in.

### Test manuali
- check-in NFC valido;
- check-in con tessera sconosciuta;
- check-in ripetuto stesso giorno;
- cliente non attivo;
- tessera disattivata;
- backup manuale;
- restore da backup di test;
- riavvio processo e verifica sessioni/comportamento previsto.

---

## Ordine operativo obbligatorio

1. STEP 1 — cleanup strutturale
2. STEP 2 — centralizzazione helper
3. STEP 3 — refactor route/service
4. STEP 4 — UI admin
5. STEP 5 — UI cliente
6. STEP 6 — hardening NFC/Raspberry

Non anticipare step successivi se lo step corrente non è stato chiuso e verificato.

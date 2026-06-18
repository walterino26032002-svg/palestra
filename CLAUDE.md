# Gestionale Palestra — Memoria Tecnica (V1)

> File di memoria tecnica del progetto. Ogni decisione presa durante lo sviluppo deve essere coerente con queste regole. Qualsiasi deviazione richiede motivazione esplicita.

---

## 1. Scopo

Gestionale web **locale** per palestra / coaching personalizzato. Funziona interamente in rete locale, senza dipendenze cloud. Ottimizzato per uso da postazione fissa (admin) e da smartphone (cliente).

## 2. Stack obbligatorio

| Layer | Tecnologia |
|-------|-----------|
| Runtime | Node.js 20+ (testato su 24.x) |
| Web framework | Express |
| Database | SQLite (file locale) |
| DB driver | better-sqlite3 |
| Moduli | CommonJS (`require` / `module.exports`) |
| Hash password | bcrypt |
| Sessioni | express-session (memory store in V1) |
| Frontend | HTML / CSS / JS vanilla (no framework, no build step) |
| PDF | pdfkit |
| Excel | exceljs |
| Scheduler | node-cron |

## 3. Accesso

- Server: `http://localhost:3000`
- Admin seed iniziale:
  - username: `admin`
  - password: `admin123`
- Cambiare la password al primo login (TODO V1.1).

## 4. Funzioni V1 (scope)

1. Login admin e login cliente.
2. Gestione clienti (anagrafica, attivo/non attivo, badge).
3. Servizi e pagamenti (registrazione pagamento + generazione movimento ingressi positivo).
4. Movimenti ingressi (ledger, saldo derivato).
5. Tessere NFC (associazione 1:1 cliente ↔ tessera).
6. Simulatore NFC (pannello admin per testare il check-in).
7. Endpoint API: `POST /api/nfc/check` (accettazione tessera).
8. Bacheca admin minimale (avvisi e stato recente).
9. Blocco → Settimana → Seduta → Esercizio (gerarchia schede).
10. Creazione automatica di **20 sedute BOZZA** per blocco di default: **4 settimane × 5 sedute**.
11. Editor scheda stile Excel (tabella editabile di esercizi per seduta).
12. Area cliente **mobile-first** con:
    - feedback esercizi con **autosave**;
    - riepilogo e invio allenamento;
    - consultazione esercizi della seduta PROSSIMA.
13. Revisione coach del feedback (chiusura seduta).
14. Funzione **"Prepara prossima seduta"**: copia gli esercizi della seduta COMPLETATA nello slot successivo libero, portandolo a PROSSIMA.
15. Export PDF (seduta/blocco) e XLSX (esercizi/blocco).
16. Backup automatico giornaliero + backup manuale, con log in `backup_log`.
17. README di progetto.

## 5. Regole fondamentali (vincoli non derogabili)

- **NO** app mobile nativa.
- **NO** cloud / servizi esterni / API terze parti.
- **NO** Lovable / generatori AI di codice integrati.
- **NO** import Excel (solo export).
- **NO** grafici / dashboard avanzate.
- **NO** stampa automatica al check-in.
- **NO** HTTPS in V1 (solo HTTP locale).
- Il **saldo ingressi è derivato** dai `movimenti_ingressi`, mai modificabile direttamente.
- Il **calendario NON decide l'allenamento**: la seduta proposta al cliente è solo quella marcata **PROSSIMA**.
- **Una sola seduta PROSSIMA per cliente** (vincolo di stato).
- L'utente NON può uscire dall'app senza logout esplicito (sessione = cookie).

## 6. Modello dominio — Seduta

### 6.1 Stati

| Stato | Significato |
|-------|------------|
| `BOZZA` | Seduta preparata dal coach, non ancora visibile al cliente. |
| `PROSSIMA` | Singola seduta attiva del cliente, mostrata in area cliente. |
| `COMPLETATA` | Seduta svolta e inviata dal cliente. Se `feedback_seduta.revisionato_il` è nullo è **"da revisionare"**; valorizzato = revisionata dal coach. |
| `SALTATA` | Seduta non svolta. Marca **manuale** del coach (`POST /admin/sedute/:id/stato`). |

### 6.2 Vincoli e ciclo di vita (comportamento reale implementato)

- Massimo **1 seduta PROSSIMA per cliente** alla volta. Garantito a livello applicativo (transazione), non da vincolo SQL — vedi §15 (debiti tecnici).
- Solo con check-in (NFC) il cliente sblocca/vede gli esercizi della propria seduta PROSSIMA.
- **Quando il cliente invia/completa l'allenamento, la seduta passa direttamente a `COMPLETATA`** (richiede check-in del giorno + stato PROSSIMA). Non esiste uno stato intermedio.
- Una seduta `COMPLETATA` con `feedback_seduta.revisionato_il` **nullo** è considerata **"da revisionare"** e compare in `/admin/revisioni`.
- La **revisione coach** non cambia lo stato della seduta: aggiunge solo `note_coach` e valorizza `revisionato_il` su `feedback_seduta`. La seduta resta `COMPLETATA`.
- **Per ora NON si introduce uno stato `IN_REVISIONE`/`INVIATA`**: la distinzione "da revisionare" vs "revisionata" è derivata da `revisionato_il`. (Decisione consolidata post STEP 7.)

### 6.3 Prepara prossima seduta

- Origine: una seduta **COMPLETATA** del cliente (quella aperta in revisione).
- Destinazione: primo slot `BOZZA` futuro disponibile nello **stesso blocco** (in ordine `indice_settimana`, `indice_seduta`).
- Copia: esercizi, serie, ripetizioni, carichi template (non copia feedback).
- Effetto collaterale: la destinazione diventa `PROSSIMA`. **La precedente PROSSIMA del cliente (se diversa dalla destinazione) torna a `BOZZA`** — NON `SALTATA`. `SALTATA` è riservato alla sola marcatura manuale del coach.
- L'origine resta `COMPLETATA`. **Nessun movimento ingressi** viene creato.

## 7. Logica check-in NFC

Endpoint: `POST /api/nfc/check` body `{ "tessera_uid": "..." }`.

### 7.1 Flusso

1. Lookup tessera in `nfc_tessere`. Se inesistente → risposta `unknown_card` (l'evento viene comunque loggato in `nfc_eventi` con `cliente_id=NULL`).
2. Se tessera esiste → scrivi riga in `nfc_eventi` (sempre, anche in caso di anomalie).
3. **Primo NFC del giorno** per quel cliente (`presenze` con `data = CURRENT_DATE`):
   - registra `presenze` (riga unica al giorno per cliente);
   - inserisce `movimenti_ingressi` con `delta = -1` (può andare negativo).
4. **NFC ripetuto stesso giorno**: nessuna nuova `presenze`, nessun nuovo movimento. Risposta `already_checked_in`.
5. **Cliente non attivo** (`clienti.attivo = 0`): si registra solo `nfc_eventi`. NON si crea `presenze`, NON si scala movimento, NON si sblocca allenamento. Risposta `inactive`.
6. **Nessuna seduta PROSSIMA** ma cliente attivo: check-in procede normalmente (presenza + -1), si crea `avvisi_bacheca` di tipo `seduta_mancante`.
7. Tutti gli scenari anomali generano un `avvisi_bacheca`.

### 7.2 Risposta API

> Allineata al comportamento reale implementato e testato (STEP 7). Non esiste un campo `result`: l'esito è in `motivo`.

```json
{
  "ok": true,
  "motivo": "ok",
  "saldo_ingressi": 3,
  "prossima_seduta_id": 42,
  "allenamento_sbloccato": true,
  "already_checked_today": false,
  "cliente_id": 7,
  "tessera_uid": "AA:BB:CC:DD"
}
```

Campi della risposta:

| Campo | Significato |
|-------|------------|
| `ok` | `true` se il check-in è andato a buon fine (casi `ok`, `ok_senza_seduta`, `gia_presente`); `false` per gli scenari anomali. |
| `motivo` | Codice testuale dell'esito (vedi tabella sotto). |
| `saldo_ingressi` | Saldo derivato (`SUM(delta)` su `movimenti_ingressi`). |
| `prossima_seduta_id` | ID della seduta PROSSIMA, oppure `null`. |
| `allenamento_sbloccato` | `true` se esiste presenza odierna + seduta PROSSIMA. |
| `already_checked_today` | `true` se il cliente aveva già fatto check-in oggi (nessun nuovo scalo). |
| `cliente_id` | ID cliente associato alla tessera, oppure `null`. |
| `tessera_uid` | UID letto, sempre riportato in eco. |

Valori validi di `motivo`:

| `motivo` | `ok` | Quando |
|----------|------|--------|
| `ok` | `true` | Primo check-in del giorno, cliente attivo con seduta PROSSIMA. |
| `ok_senza_seduta` | `true` | Primo check-in del giorno, cliente attivo ma senza seduta PROSSIMA (genera avviso `seduta_mancante`). |
| `gia_presente` | `true` | Check-in ripetuto nello stesso giorno: nessun nuovo movimento/presenza. |
| `tessera_sconosciuta` | `false` | UID non presente in `nfc_tessere` (evento loggato con `cliente_id=NULL` + avviso). |
| `tessera_disattivata` | `false` | Tessera esistente ma `attiva = 0`: nessuno scalo. |
| `cliente_non_attivo` | `false` | Cliente `attivo = 0`: solo evento, nessuno scalo, nessuno sblocco. |
| `richiesta_non_valida` | `false` | UID assente/vuoto nella richiesta. |

> Nota storica §7.1: i termini `unknown_card` / `already_checked_in` / `inactive` citati nel flusso descrittivo corrispondono rispettivamente ai `motivo` `tessera_sconosciuta` / `gia_presente` / `cliente_non_attivo` (oltre a `tessera_disattivata`). Il valore loggato in `nfc_eventi.esito` usa una nomenclatura interna distinta (`ok`, `already_checked_in`, `inactive_client`, `inactive_card`, `unknown_card`) e non coincide necessariamente con `motivo`.

## 8. Badge cliente

Regole di priorità (valutate in ordine):

1. Se `attivo = 0` → **Non attivo** (sempre e solo questo).
2. Altrimenti:
   - `saldo >= 2` → **Attivo**.
   - `saldo = 1` → **Ultimo ingresso**.
   - `saldo = 0` → **Da rinnovare**.
   - `saldo < 0` → **Da regolarizzare**.
3. Il badge **"Senza scheda"** può coesistere con uno dei precedenti (4/5) ma NON con "Non attivo".

`saldo_ingressi` = `SUM(delta)` su `movimenti_ingressi` per quel `cliente_id`.

## 9. Schema database (V1)

Tabelle previste:

- `admin` — utenti amministratore (bcrypt hash).
- `clienti` — anagrafica, stato attivo, note.
- `nfc_tessere` — associazione tessera ↔ cliente (unique uid).
- `storico_nfc` — storico assegnazioni tessere (storico, non usato per lookup live).
- `nfc_eventi` — log raw di ogni lettura NFC.
- `presenze` — riga unica per `(cliente_id, data)`.
- `servizi` — tipologie di abbonamento / pacchetto ingressi.
- `pagamenti` — pagamento di un cliente per un servizio.
- `movimenti_ingressi` — ledger saldo: pagamenti (+), check-in (-).
- `blocchi` — contenitore di settimane per un cliente.
- `sedute` — settimana + indice + stato + note.
- `esercizi` — esercizi di una seduta (ordine, nome, serie, rep, carico, note).
- `feedback_esercizi` — feedback del cliente per esercizio (autosave).
- `feedback_seduta` — feedback complessivo della seduta + stato revisione coach.
- `avvisi_bacheca` — feed eventi admin.
- `backup_log` — storico backup eseguiti.

Vedi migration `src/db/migrations/001_init.sql` per il DDL completo.

## 10. Struttura cartelle (target V1)

```
gestionale-palestra/
├── CLAUDE.md
├── README.md
├── package.json
├── package-lock.json
├── .env.example
├── .env
├── .gitignore
├── data/
│   └── gestionale.sqlite
├── backups/
├── exports/
├── public/
│   ├── css/
│   ├── js/
│   ├── admin/
│   └── cliente/
├── src/
│   ├── config.js
│   ├── server.js
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── db/
│   │   ├── connection.js
│   │   ├── migrator.js
│   │   ├── seed.js
│   │   └── migrations/
│   │       └── 001_init.sql
│   └── utils/
└── storage/   (allegati eventuali, vuota in V1)
```

## 11. Comandi npm

- `npm start` → avvia server produzione.
- `npm run dev` → avvia server con `node --watch`.
- `npm run db:migrate` → esegue migration pendenti.
- `npm run db:seed` → esegue seed admin iniziale (idempotente).

## 12. Variabili d'ambiente (`.env`)

```
PORT=3000
NODE_ENV=development
SESSION_SECRET=cambiami-in-prod
DB_PATH=./data/gestionale.sqlite
BACKUP_DIR=./backups
EXPORT_DIR=./exports
```

## 13. Procedura di sviluppo

- Lavoro **incrementale**, uno STEP per volta.
- Dopo ogni STEP: fermarsi, elencare file creati, comandi eseguiti, errori e cosa testare manualmente.
- **Attendere OK esplicito** prima di procedere allo STEP successivo.
- Non generare script PowerShell di setup; tutto passa da `npm` o file reali.
- Non incollare codice applicativo in chat; scrivere sempre nei file.

## 14. Roadmap (oltre V1)

- Cambio password admin obbligatorio.
- Persistenza sessioni su SQLite o file (no memory store).
- Multi-admin con ruoli.
- Notifiche email/SMS (opzionale, solo se richiesto).
- HTTPS con reverse proxy locale (Caddy/nginx).
- Sostituzione memory session store con SQLite session store.

## 15. Debiti tecnici noti (post STEP 7)

Registro dei debiti tecnici accettati per la V1, da affrontare in step di refactor/UI o in patch dedicate. Nessuno di questi è bloccante per le funzioni attuali (audit STEP 7, smoke test 36/36 PASS).

- **Endpoint NFC pubblico da proteggere**: `POST /api/nfc/check` è volutamente pubblico (lettore esterno) e modifica lo stato (presenze + movimenti `-1`). Da proteggere in futuro con token condiviso col lettore e/o whitelist IP, e rate-limit. Accettabile finché il server resta su rete locale fidata in HTTP.
- **Layout admin duplicati**: `adminLayout` / `escapeHtml` / `alertBlock` / `backWithMsg` / `wantsHtml` sono replicati in più route (`admin.routes.js`, `schede.routes.js`, `nfc.routes.js`). Da centralizzare in `src/utils/` + un unico modulo layout nello STEP UI/refactor. Effetto collaterale attuale: navbar incoerente tra sezioni e voce "Revisioni" assente dal menu (raggiungibile solo da card dashboard).
- **Dead code da pulire**: `public/cliente/index.html` e `public/admin/index.html` (versioni "V1 minima" non più servite, route shadowed), la route statica `/cliente` in `server.js` e il middleware di injection `window.__USER__` (mai eseguito). Da rimuovere più avanti.
- **Vincolo SQL "una sola PROSSIMA"**: attualmente garantito solo a livello applicativo (transazione). Valutabile in **futura migration** come indice parziale `CREATE UNIQUE INDEX ... ON sedute(cliente_id) WHERE stato='PROSSIMA'` (supportato da SQLite). Non modificare migration già applicate.
- **Username cliente nei form admin**: il login cliente accetta già `username` (migration 006 + `auth.service`), ma i form admin (`createCliente`/`updateCliente`) non espongono il campo. Da completare se non già presente, oppure rimuovere dallo scope finché non serve.
- **Feedback cliente dopo revisione**: oggi `upsertFeedbackSeduta` accetta stato `PROSSIMA` o `COMPLETATA`, quindi il cliente può modificare voto/commento anche dopo che il coach ha valorizzato `revisionato_il`. Da bloccare in una futura patch quando `revisionato_il` è valorizzato (le `note_coach` sono già preservate).

# AUDIT PROGETTO ATTUALE — GESTIONALE PALESTRA

## 1. Scopo di questo audit

Questo documento fotografa lo stato reale del progetto esistente prima del refactor.
Non propone modifiche tecniche dirette: serve come base di continuità per le prossime chat.

## 2. Stack attuale

- Runtime: `Node.js`
- Framework web: `Express`
- Database: `SQLite`
- Driver DB: `better-sqlite3`
- Sessioni: `express-session` con memory store
- Moduli: `CommonJS`
- Password: `bcrypt`
- Frontend: `HTML / CSS / JS vanilla`
- PDF: `pdfkit`
- Excel: `exceljs`
- Scheduler: `node-cron`

Entry point principale:
- `src/server.js`

## 3. File principali

### Core applicazione
- `src/server.js` — bootstrap Express, sessioni, mount router, static, route root, health, cron backup
- `src/config.js` — configurazione env e path runtime
- `src/middleware/auth.js` — middleware auth admin/cliente
- `src/views/adminLayout.js` — layout admin condiviso

### Router
- `src/routes/auth.routes.js`
- `src/routes/admin.routes.js`
- `src/routes/schede.routes.js`
- `src/routes/nfc.routes.js`
- `src/routes/export.routes.js`
- `src/routes/backup.routes.js`
- `src/routes/cliente.routes.js`

### Service layer
- `src/services/auth.service.js`
- `src/services/clienti.service.js`
- `src/services/servizi.service.js`
- `src/services/pagamenti.service.js`
- `src/services/movimenti.service.js`
- `src/services/nfc.service.js`
- `src/services/checkin.service.js`
- `src/services/bacheca.service.js`
- `src/services/blocchi.service.js`
- `src/services/sedute.service.js`
- `src/services/esercizi.service.js`
- `src/services/schede.service.js`
- `src/services/clienteWorkout.service.js`
- `src/services/revisioni.service.js`
- `src/services/backup.service.js`
- `src/services/export.service.js`

### Database
- `src/db/connection.js`
- `src/db/migrator.js`
- `src/db/seed.js`
- `src/db/migrations/001_init.sql`
- `src/db/migrations/002_cliente_password.sql`
- `src/db/migrations/003_admin_id.sql`
- `src/db/migrations/005_esercizi_recupero.sql`
- `src/db/migrations/006_cliente_username.sql`
- `src/db/migrations/007_feedback_esercizi_stato.sql`

### Frontend statico
- `public/css/app.css`
- `public/js/app.js`
- `public/js/cliente-workout.js`

## 4. Route principali

### Auth
- `GET /login`
- `POST /login`
- `POST /logout`
- `GET /cliente/login`
- `POST /cliente/login`
- `POST /cliente/logout`

### Admin
- `GET /admin`
- `GET /admin/clienti`
- `GET /admin/clienti/nuovo`
- `POST /admin/clienti`
- `GET /admin/clienti/:id`
- `POST /admin/clienti/:id`
- `POST /admin/clienti/:id/password`
- `POST /admin/clienti/:id/toggle-attivo`
- `POST /admin/clienti/:id/pagamenti`
- `GET /admin/servizi`
- `POST /admin/servizi`
- `POST /admin/servizi/:id`
- `POST /admin/servizi/:id/toggle-attivo`
- `GET /admin/schede`
- `GET /admin/clienti/:id/scheda`
- `POST /admin/clienti/:id/blocchi`
- `POST /admin/blocchi/:id`
- `POST /admin/blocchi/:id/archivia`
- `GET /admin/sedute/:id`
- `POST /admin/sedute/:id/stato`
- `POST /admin/sedute/:id/prossima`
- `POST /admin/sedute/:id/esercizi`
- `POST /admin/sedute/:id/esercizi/copia-da`
- `POST /admin/esercizi/:id`
- `POST /admin/esercizi/:id/delete`
- `POST /admin/sedute/:id/esercizi/reorder`
- `GET /admin/revisioni`
- `GET /admin/sedute/:id/revisione`
- `POST /admin/sedute/:id/revisione`
- `POST /admin/sedute/:id/prepara-prossima`
- `GET /admin/nfc`
- `GET /admin/nfc/nuova`
- `POST /admin/nfc`
- `POST /admin/nfc/:id/toggle-attiva`
- `GET /admin/nfc/simulatore`
- `GET /admin/bacheca`
- `POST /admin/bacheca/:id/letto`
- `POST /admin/bacheca/segna-tutti-letti`
- `GET /admin/export`
- `GET /admin/backup`
- `POST /admin/backup/crea`
- `POST /admin/backup/restore`

### API pubbliche / JSON
- `GET /health`
- `GET /api/me`
- `POST /api/nfc/check`
- `GET /api/nfc/check`
- `GET /admin/api/clienti`
- `GET /admin/api/clienti/:id`
- `GET /admin/api/servizi`
- `GET /admin/api/clienti/:id/scheda`
- `GET /admin/api/sedute/:id`
- `GET /admin/api/nfc/tessere`
- `GET /admin/api/bacheca`
- `GET /admin/api/nfc/eventi`
- `GET /admin/api/backup`
- `GET /cliente/api/me`
- `GET /cliente/api/allenamento`
- `POST /cliente/api/esercizi/:id/feedback`
- `POST /cliente/api/seduta/:id/feedback`
- `POST /cliente/api/seduta/:id/completa`

## 5. Pagine principali

### Admin
- dashboard / bacheca operativa
- lista clienti
- nuovo cliente
- dettaglio cliente
- servizi/pacchetti
- lista schede
- scheda cliente
- editor seduta
- revisioni
- dettaglio revisione
- tessere NFC
- nuova tessera
- simulatore NFC
- bacheca avvisi
- export
- backup

### Cliente
- login cliente
- home cliente
- allenamento del giorno

## 6. Tabelle database reali

- `admin`
- `clienti`
- `nfc_tessere`
- `storico_nfc`
- `nfc_eventi`
- `presenze`
- `servizi`
- `pagamenti`
- `movimenti_ingressi`
- `blocchi`
- `sedute`
- `esercizi`
- `feedback_esercizi`
- `feedback_seduta`
- `avvisi_bacheca`
- `backup_log`
- `schema_migrations`

## 7. Logica NFC attuale

La logica principale è in:
- `src/services/checkin.service.js`
- `src/services/nfc.service.js`
- `src/routes/nfc.routes.js`

Flusso reale attuale:
1. Arriva richiesta a `POST /api/nfc/check`.
2. Viene validato l'UID tessera.
3. Si cerca la tessera in `nfc_tessere`.
4. Ogni lettura viene registrata in `nfc_eventi`.
5. Se la tessera non esiste o è disattivata, il check-in non prosegue.
6. Se il cliente è non attivo, viene loggato evento ma non viene scalato ingresso.
7. Se è il primo check-in del giorno:
   - viene creata presenza in `presenze`;
   - viene creato movimento `-1` in `movimenti_ingressi`.
8. Se il cliente ha già fatto check-in oggi, non viene scalato di nuovo.
9. Se manca una seduta `PROSSIMA`, il check-in può comunque risultare valido ma viene generato un avviso.

Aspetti corretti da mantenere:
- un solo addebito per giorno;
- presenza separata dai movimenti;
- log evento NFC sempre presente;
- sblocco allenamento dopo presenza valida.

## 8. Logica pacchetti / ingressi attuale

La logica è distribuita tra:
- `src/services/servizi.service.js`
- `src/services/pagamenti.service.js`
- `src/services/movimenti.service.js`

Modello reale attuale:
- `servizi` definisce pacchetto, numero ingressi e prezzo;
- `pagamenti` registra il pagamento effettuato;
- ogni pagamento crea un movimento positivo in `movimenti_ingressi`;
- ogni check-in valido crea un movimento negativo in `movimenti_ingressi`;
- il saldo ingressi è derivato da `SUM(delta)`.

Aspetto corretto da mantenere:
- il saldo non va spostato su un campo statico cliente;
- il ledger è la fonte unica di verità.

## 9. Logica blocchi / sedute attuale

La logica è distribuita tra:
- `src/services/blocchi.service.js`
- `src/services/sedute.service.js`
- `src/services/esercizi.service.js`
- `src/services/schede.service.js`

Modello reale attuale:
- esistono blocchi associati al cliente;
- un blocco genera sedute in stato iniziale `BOZZA`;
- oggi il default è 4 settimane x 5 sedute = 20 sedute bozza;
- la seduta ha stati: `BOZZA`, `PROSSIMA`, `COMPLETATA`, `SALTATA`;
- per ogni cliente deve esistere una sola seduta `PROSSIMA`;
- quando una nuova seduta viene marcata `PROSSIMA`, eventuali altre `PROSSIMA` tornano `BOZZA`;
- gli esercizi sono righe legate alla seduta.

Punto fondamentale:
- questa logica esiste già e non deve essere reinventata da zero.

## 10. Logica revisioni attuale

La logica è distribuita tra:
- `src/services/clienteWorkout.service.js`
- `src/services/revisioni.service.js`
- `src/routes/schede.routes.js`

Flusso reale attuale:
1. Il cliente compila la seduta.
2. I feedback per esercizio vengono salvati.
3. Il cliente completa la seduta.
4. La seduta passa a `COMPLETATA`.
5. L'admin la vede in `/admin/revisioni`.
6. Lo stato “da revisionare” dipende da `feedback_seduta.revisionato_il` nullo.
7. L'admin salva note coach.
8. L'admin può usare la funzione `preparaProssimaSeduta`.
9. La funzione copia gli esercizi nel primo slot futuro disponibile dello stesso blocco e porta la destinazione a `PROSSIMA`.

Aspetti corretti da mantenere:
- la revisione non richiede un nuovo stato aggiuntivo della seduta;
- la preparazione della prossima seduta va preservata, non riscritta da zero.

## 11. Problemi trovati

### 11.1 Duplicazioni
Sono presenti molte duplicazioni di helper e logiche trasversali.

Helper ripetuti in più router:
- `escapeHtml`
- `wantsHtml`
- `alertBlock`
- `backWithMsg`
- formatter data/importi

Altre duplicazioni:
- query ripetute per prossima seduta;
- query ripetute per feedback seduta/esercizi;
- contatori dashboard/bacheca/revisioni ricostruiti in più punti;
- funzioni di rendering simili tra pagine admin e cliente.

### 11.2 Confusione nelle responsabilità
I route file contengono spesso insieme:
- rendering HTML;
- validazione input;
- gestione redirect;
- risposta JSON;
- parte di orchestrazione business.

Questo rende il flusso poco leggibile e complica il refactor.

### 11.3 UI disordinata
Problemi osservati:
- area admin molto densa;
- navigazione non sempre coerente;
- evidenziazione della sezione attiva non uniforme;
- dettaglio cliente troppo carico;
- area schede e revisioni funzionale ma poco lineare;
- esperienza admin non abbastanza ordinata/professionale.

### 11.4 Area cliente concentrata in un file grande
- `public/js/cliente-workout.js` contiene molta logica client-side in un unico file.
- Questo oggi è gestibile, ma è un punto naturale di disordine futuro.

## 12. Codice morto / non più utile

Confermati come candidati alla rimozione nel refactor:
- `public/admin/index.html` — non usato dal flusso reale
- `public/cliente/index.html` — shadowed dalla route vera cliente
- middleware di injection `window.__USER__` in `src/server.js` — di fatto non usato nel flusso live
- route statica `/cliente` in `src/server.js` — superata dalla route gestita in `src/routes/cliente.routes.js`
- duplicazioni locali di helper che possono essere centralizzate

## 13. Tabelle/campi da osservare con attenzione

Non da cambiare ora, ma da trattare con criterio nel refactor:
- `clienti.username` — è il candidato naturale per diventare esplicitamente il `codice cliente` in UI
- `clienti.email` e `clienti.telefono` — potrebbero restare secondari o opzionali rispetto all'anagrafica minima desiderata
- `feedback_esercizi.stato` — utile, ma da mantenere coerente con il flusso cliente
- gap numerico nelle migration (`004` assente) — attenzione futura, non è un refactor da fare ora

## 14. Rischi per Raspberry / server locale

### 14.1 Endpoint NFC pubblico
`POST /api/nfc/check` è pubblico e modifica stato.
Questo è il rischio principale per un deploy locale su rete non totalmente fidata.

### 14.2 Sessioni in memory store
Le sessioni si perdono al riavvio del processo.
Per V1 è tollerabile, ma è un limite reale su Raspberry/server locale.

### 14.3 HTTP locale senza HTTPS
Scelta coerente con la V1, ma resta un rischio operativo su rete locale condivisa.

### 14.4 SQLite su storage locale
Va bene per questo progetto, ma richiede attenzione a:
- backup;
- interruzioni di corrente;
- integrità del file DB.

### 14.5 Query poco ottimizzate in alcuni punti
Alcune liste ricostruiscono dati con query ripetute (es. saldi cliente).
Per pochi clienti regge, ma su Raspberry è meglio ridurre sprechi nel refactor.

### 14.6 Password admin iniziale di seed
Se non viene cambiata, è un rischio operativo importante.

## 15. Conclusione audit

Il progetto ha una base dominio buona e già coerente con molti punti del brief definitivo.
Le aree più valide da preservare sono:
- check-in NFC;
- ledger ingressi;
- logica blocchi/sedute;
- revisione coach;
- funzione prepara prossima seduta.

I problemi principali non sono tanto di dominio, quanto di struttura:
- duplicazioni;
- helper sparsi;
- codice morto;
- routing e rendering mescolati;
- UI admin da riordinare.

La strategia corretta non è una riscrittura completa, ma un refactor incrementale con priorità a pulizia, centralizzazione e semplificazione dei flussi.

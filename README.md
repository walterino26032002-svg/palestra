# Gestionale Palestra

Gestionale web **locale** per palestra / coaching personalizzato. Funziona interamente in rete locale (HTTP), senza dipendenze cloud. Ottimizzato per uso da postazione fissa (admin) e da smartphone (cliente).

Stack: Node.js 20+ · Express · SQLite (better-sqlite3) · HTML/CSS/JS vanilla · pdfkit · exceljs · node-cron.

---

## Prerequisiti

- Node.js 20+ (testato su 24.x)
- npm

## Installazione

Da terminale, nella cartella del progetto (su Windows usare `npm.cmd`):

```
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

- `db:migrate` applica le migration SQL pendenti.
- `db:seed` crea l'admin iniziale (idempotente).
- `start` avvia il server.

Server disponibile su: **http://localhost:3000**

Comandi disponibili:

| Comando | Effetto |
|---------|---------|
| `npm.cmd start` | avvia il server |
| `npm.cmd run dev` | avvia con `node --watch` (riavvio automatico) |
| `npm.cmd run db:migrate` | applica migration pendenti |
| `npm.cmd run db:seed` | seed admin iniziale (idempotente) |

## Configurazione (`.env`)

Copiare `.env.example` in `.env` e adattare:

```
PORT=3000
NODE_ENV=development
SESSION_SECRET=cambiami-in-prod
DB_PATH=./data/gestionale.sqlite
BACKUP_DIR=./backups
EXPORT_DIR=./exports
BACKUP_ENABLED=true
BACKUP_CRON=0 3 * * *
BACKUP_RETENTION_DAYS=30
```

---

## Credenziali

**Admin (seed iniziale):**
- username: `admin`
- password: `admin123`

**Cliente di test (se creato in fase di test):**
- username: `cliente.test`
- password: `cliente123`
- UID tessera NFC: `TEST-NFC-001`

---

## Flusso operativo

1. **Creare un servizio** (listino): `/admin/servizi` — nome, ingressi, prezzo.
2. **Creare un cliente**: `/admin/clienti/nuovo` — anagrafica + password cliente.
3. **Registrare un pagamento**: dal dettaglio cliente → genera un movimento ingressi positivo.
4. **Assegnare una tessera NFC**: `/admin/nfc/nuova` — associazione tessera ↔ cliente.
5. **Creare un blocco 4×5**: dalla scheda cliente → genera 20 sedute BOZZA.
6. **Impostare la seduta PROSSIMA**: dall'editor seduta → "Imposta come PROSSIMA".
7. **Check-in NFC**: il cliente passa la tessera (o si usa il simulatore `/admin/nfc/simulatore`) → scala 1 ingresso e sblocca l'allenamento.
8. **Il cliente svolge l'allenamento**: login cliente `/cliente/login` → apre l'allenamento, compila i feedback (autosave) e invia → la seduta diventa COMPLETATA.
9. **Il coach revisiona**: `/admin/revisioni` → apre il dettaglio, vede i feedback, salva note coach.
10. **Prepara prossima seduta**: dalla revisione → copia gli esercizi nel primo slot BOZZA successivo e lo imposta PROSSIMA (la vecchia PROSSIMA torna BOZZA; nessun movimento ingressi).
11. **Esportare PDF/XLSX**: dal dettaglio cliente, dall'editor seduta o da `/admin/export`.
12. **Backup**: `/admin/backup` per backup manuale; backup automatico giornaliero via cron.

---

## Export PDF / XLSX

Pagina riepilogo: **`/admin/export`**.

**PDF** (pdfkit):
- Scheda cliente: `/admin/clienti/:id/scheda/pdf`
- Seduta: `/admin/sedute/:id/pdf`
- Report cliente: `/admin/clienti/:id/report/pdf`

**XLSX** (exceljs):
- Scheda cliente: `/admin/clienti/:id/scheda/xlsx` (fogli Cliente, Sedute, Esercizi, Feedback)
- Report cliente: `/admin/clienti/:id/report/xlsx` (Anagrafica, Pagamenti, Movimenti, Presenze, Sedute)
- Clienti (globale): `/admin/export/clienti.xlsx`
- Pagamenti (globale): `/admin/export/pagamenti.xlsx`
- Movimenti (globale): `/admin/export/movimenti.xlsx`

I file vengono generati e scaricati al volo (stream HTTP), non lasciano copie sul server salvo quelle che si salvano manualmente. La cartella `exports/` (configurabile con `EXPORT_DIR`) è prevista per eventuali export su file.

### Stampa manuale

Non esiste stampa automatica. Per stampare:
1. aprire/scaricare il PDF desiderato (es. PDF seduta o PDF scheda);
2. aprirlo nel browser o nel lettore PDF;
3. usare la funzione di stampa del browser/lettore (Ctrl+P).

**Nessuna stampa viene mai eseguita automaticamente al check-in NFC.**

---

## Backup

I backup sono salvati nella cartella **`backups/`** (configurabile con `BACKUP_DIR`), come file SQLite singoli e consistenti (si usa l'API nativa `db.backup()`, WAL-aware).

Nome file: `gestionale_backup_AAAA-MM-GG_HH-mm-ss_<tipo>.sqlite` (tipo: `manual`, `auto`, `pre_restore`).

### Backup manuale

Pagina: **`/admin/backup`**.
- "Crea backup ora" → genera un file in `backups/` e registra l'esito in `backup_log`.
- Lista dei backup presenti con dimensione e data.
- Download manuale di ogni backup.
- Restore esplicito da un file presente in `backups/` (vedi sotto).

### Backup automatico

Eseguito da node-cron quando il server è avviato direttamente. Configurabile in `.env`:
- `BACKUP_ENABLED=true` — abilita/disabilita il cron.
- `BACKUP_CRON=0 3 * * *` — orario (default: ogni giorno alle 03:00).
- `BACKUP_RETENTION_DAYS=30` — retention prudente: cancella solo i backup `auto`/`manual` più vecchi di N giorni, mantenendo sempre almeno alcuni file recenti e **mai** i backup `pre_restore`.

### Restore

Il restore è un'azione admin esplicita e protetta:
- accetta **solo** file già presenti in `backups/` (filename validato, niente path traversal `../`);
- prima del restore crea automaticamente un **backup d'emergenza** (`pre_restore`);
- dopo la sostituzione esegue `PRAGMA integrity_check`; se fallisce, ripristina automaticamente lo stato precedente.

### ⚠️ Nota importante sul backup (Raspberry Pi)

Il backup salvato sulla **SD card del Raspberry NON è sufficiente**: le SD si corrompono o si guastano. Copiare periodicamente i file della cartella `backups/` anche su **PC, chiavetta USB o disco esterno**. Nessun backup viene caricato su cloud.

---

## NFC / Check-in

Endpoint pubblico (per lettore NFC esterno o simulatore):

```
POST /api/nfc/check
Content-Type: application/json

{ "uid": "TEST-NFC-001", "sorgente": "lettore" }
```

Accetta `uid`, `codice` o `code`. La risposta usa `ok` + `motivo` (vedi `CLAUDE.md §7.2`). L'endpoint resta **pubblico e invariato**; nessuna stampa automatica.

---

## Struttura cartelle dati

- `data/gestionale.sqlite` — database (con sidecar `-wal`/`-shm`).
- `backups/` — backup del database.
- `exports/` — eventuali export su file.
- `storage/` — allegati (non usata in V1).

I dati e i backup **non** sono inclusi nel versionamento (`.gitignore`).

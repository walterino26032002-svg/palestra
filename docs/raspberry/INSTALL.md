# Gestionale Palestra — Installazione su Raspberry Pi

Guida per installare il gestionale su Raspberry Pi OS (64-bit, Bookworm).
Il gestionale gira interamente in rete locale; non richiede connessione a internet dopo la prima installazione.

---

## 1. Prerequisiti Raspberry

- Raspberry Pi 4 (consigliato, minimo 2 GB RAM) o Pi 5
- Raspberry Pi OS 64-bit (Bookworm o Bullseye)
- Connessione di rete locale (LAN o Wi-Fi)
- Accesso SSH o tastiera/monitor
- Almeno 2 GB di spazio libero su SD/SSD

---

## 2. Pacchetti di sistema

```bash
sudo apt update && sudo apt upgrade -y

# Dipendenze build (necessarie per better-sqlite3 e bcrypt)
sudo apt install -y git nginx build-essential python3 python3-pip

# Node.js LTS tramite NodeSource
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Verifica versioni
node --version   # deve essere 20.x o superiore
npm --version
```

> **Nota:** `build-essential` e `python3` sono necessari perché `better-sqlite3` e `bcrypt` compilano moduli nativi (node-gyp) durante `npm install`.

---

## 3. Clone repository

```bash
# Scegli la directory di installazione (default: /home/pi)
cd /home/pi

git clone https://github.com/TUO_UTENTE/gestionale-palestra.git
cd gestionale-palestra
```

Se non hai accesso pubblico al repo, usa SSH o copia i file via `scp`/USB.

---

## 4. Installazione dipendenze Node

```bash
# In produzione, ometti le devDependencies
npm install --omit=dev
```

> Se compare un errore di compilazione (`node-gyp`, `binding.gyp`), verifica che `build-essential` e `python3` siano installati (§2).

---

## 5. Configurazione

```bash
cp .env.example .env
nano .env
```

Modifica obbligatoriamente:

| Variabile | Cosa fare |
|-----------|-----------|
| `SESSION_SECRET` | Sostituisci con una stringa lunga e casuale: `openssl rand -base64 48` |
| `NODE_ENV` | Lascia `production` |
| `PORT` | Lascia `3000` (Nginx farà da proxy sulla porta 80) |

Salva il file (`Ctrl+X → Y → Invio`).

```bash
# Proteggi il file .env dalla lettura di altri utenti
chmod 600 .env
```

---

## 6. Database

```bash
# Esegui le migration (crea le tabelle se non esistono)
npm run db:migrate

# Seed admin iniziale (idempotente — sicuro da rieseguire)
npm run db:seed
```

Credenziali admin di default: `admin` / `admin123` — **cambiale subito dopo il primo accesso.**

---

## 7. Avvio manuale (test)

```bash
npm start
```

Apri dal browser della rete locale:

```
http://IP_RASPBERRY:3000
```

Trova l'IP del Raspberry con `hostname -I`.

Premi `Ctrl+C` per fermare. Poi continua con systemd.

---

## 8. systemd — Avvio automatico

```bash
# Copia il file service (adatta User e WorkingDirectory se necessario)
sudo cp docs/raspberry/systemd/gestionale-palestra.service /etc/systemd/system/

# Apri e verifica i path
sudo nano /etc/systemd/system/gestionale-palestra.service

# Trova il path esatto di node
which node   # tipicamente /usr/bin/node

# Ricarica systemd e abilita il servizio
sudo systemctl daemon-reload
sudo systemctl enable gestionale-palestra
sudo systemctl start gestionale-palestra

# Verifica stato
sudo systemctl status gestionale-palestra
```

**Log in tempo reale:**

```bash
journalctl -u gestionale-palestra -f
```

---

## 9. Nginx — Reverse proxy su porta 80

```bash
# Copia la config Nginx
sudo cp docs/raspberry/nginx/gestionale.conf /etc/nginx/sites-available/gestionale

# Abilita il sito
sudo ln -s /etc/nginx/sites-available/gestionale /etc/nginx/sites-enabled/gestionale

# Rimuovi il default Nginx (opzionale, evita conflitti su porta 80)
sudo rm -f /etc/nginx/sites-enabled/default

# Testa la configurazione
sudo nginx -t

# Ricarica Nginx
sudo systemctl reload nginx
```

Testa dal browser:

```
http://IP_RASPBERRY/
```

(senza porta — Nginx smista a Node su :3000)

---

## 10. Backup

I backup automatici vengono creati in `backups/` secondo la cron configurata in `.env`.

**Backup manuale consigliato prima di ogni aggiornamento:**

```bash
cp data/gestionale.sqlite data/gestionale-$(date +%Y%m%d_%H%M%S).bak
```

**Backup remoto** (esempio via rsync da un altro PC):

```bash
rsync -avz pi@IP_RASPBERRY:/home/pi/gestionale-palestra/data/ ./backup-remoto/
rsync -avz pi@IP_RASPBERRY:/home/pi/gestionale-palestra/backups/ ./backup-remoto/
```

---

## 11. Aggiornamento da GitHub

Usa lo script incluso:

```bash
bash scripts/update-raspberry.sh
```

Lo script esegue in ordine: backup DB → git pull → npm install → db:migrate → restart systemd.

**Oppure manualmente:**

```bash
# 1. Backup DB
cp data/gestionale.sqlite data/backup-pre-update-$(date +%Y%m%d_%H%M%S).sqlite

# 2. Aggiorna codice (solo fast-forward, sicuro)
git pull --ff-only origin main

# 3. Dipendenze
npm install --omit=dev

# 4. Migration
npm run db:migrate

# 5. Riavvia servizio
sudo systemctl restart gestionale-palestra
```

> **Pagina di manutenzione web:** non implementata in V1. Gestire gli aggiornamenti via SSH come descritto sopra. Aggiungere una pagina di manutenzione espone endpoint admin in HTTP; rivalutare dopo l'introduzione di HTTPS.

---

## 12. NFC / PN532

Il gestionale **non legge direttamente l'hardware NFC**: riceve l'UID via HTTP POST su `/api/nfc/check`.

La lettura fisica della tessera va gestita da uno **script separato** (Python, Arduino, ecc.) che esegue:

```bash
curl -s -X POST http://127.0.0.1:3000/api/nfc/check \
     -H 'Content-Type: application/json' \
     -d '{"tessera_uid": "AA:BB:CC:DD"}'
```

**Permessi Linux** che potrebbe richiedere lo script NFC:

| Interfaccia | Gruppo |
|-------------|--------|
| Seriale (UART) | `dialout` |
| SPI | `spi` |
| I2C | `i2c` |

```bash
sudo usermod -aG dialout,spi,i2c pi
# Richiede logout/login per avere effetto
```

---

## 13. Troubleshooting

**Porta 3000 già occupata**
```bash
sudo lsof -i :3000
# Termina il processo che occupa la porta, poi riavvia il servizio
```

**Errore compilazione `better-sqlite3` o `bcrypt`**
```bash
sudo apt install -y build-essential python3
node --version   # deve essere 20+
npm install --omit=dev
```

**Errore `node-gyp` / mismatch versione Node**
```bash
# Rimuovi node_modules e reinstalla con la versione Node corrente
rm -rf node_modules
npm install --omit=dev
```

**Nginx restituisce 502 Bad Gateway**
```bash
# Verifica che il servizio Node sia attivo
sudo systemctl status gestionale-palestra
# Controlla i log
journalctl -u gestionale-palestra -n 50
```

**Permessi su `.env`**
```bash
chmod 600 .env
# Verifica che l'utente del service (pi) sia il proprietario
chown pi:pi .env
```

**Database non trovato all'avvio**
```bash
# Verifica DB_PATH in .env (deve essere relativo alla WorkingDirectory del service)
ls -la data/
# Riesegui migration se necessario
npm run db:migrate
```

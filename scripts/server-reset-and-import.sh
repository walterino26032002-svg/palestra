#!/usr/bin/env bash
# scripts/server-reset-and-import.sh
# Uso: bash scripts/server-reset-and-import.sh /home/pi/import/ELENCO_IMPORT.xlsx
set -e

XLSX_FILE="${1:?Passa il path del file .xlsx come primo argomento}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="gestionale-palestra"
DB_PATH="${APP_DIR}/data/gestionale.sqlite"
BACKUP_DIR="${APP_DIR}/backups"

if [ ! -f "$XLSX_FILE" ]; then echo "File non trovato: $XLSX_FILE"; exit 1; fi

echo ""
echo "=== RESET E IMPORT GESTIONALE PALESTRA ==="
echo "App dir : $APP_DIR"
echo "DB      : $DB_PATH"
echo "File    : $XLSX_FILE"
echo ""
echo "ATTENZIONE: questa operazione cancella il database e importa da zero."
echo "Digita RESET-IMPORT per continuare (CTRL+C per annullare):"
read -r CONFIRM
if [ "$CONFIRM" != "RESET-IMPORT" ]; then echo "Annullato."; exit 0; fi

# 1. Backup DB
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
  TS=$(date +%Y%m%d_%H%M%S)
  cp "$DB_PATH" "${BACKUP_DIR}/pre_reset_${TS}.sqlite"
  echo "[ok] Backup DB: ${BACKUP_DIR}/pre_reset_${TS}.sqlite"
fi

# 2. Stop servizio
echo "[...] Fermando $SERVICE..."
sudo systemctl stop "$SERVICE" || true

# 3. Rimuovi DB
rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
echo "[ok] DB rimosso."

# 4. Install + migrate + seed
cd "$APP_DIR"
npm ci --omit=dev
npm run db:migrate
npm run db:seed
echo "[ok] DB inizializzato."

# 5. Dry-run import
echo ""
echo "=== DRY-RUN IMPORT ==="
node src/scripts/import-clienti.js "$XLSX_FILE"

# 6. Seconda conferma
echo ""
echo "Digita IMPORTA per procedere con l'import reale (CTRL+C per annullare):"
read -r CONFIRM2
if [ "$CONFIRM2" != "IMPORTA" ]; then echo "Import annullato. Server non riavviato."; exit 0; fi

# 7. Import reale
node src/scripts/import-clienti.js "$XLSX_FILE" --apply

# 8. Riavvia
sudo systemctl start "$SERVICE"
echo "[ok] Servizio riavviato."
echo ""
sudo systemctl status "$SERVICE" --no-pager -l

#!/usr/bin/env bash
# update-raspberry.sh — Aggiorna Gestionale Palestra da GitHub
# Uso: bash scripts/update-raspberry.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$REPO_DIR/data/gestionale.sqlite"
SERVICE_NAME="gestionale-palestra"

cd "$REPO_DIR"
echo "==> Directory: $REPO_DIR"

# 1. Verifica working tree pulito (evita pull su modifiche locali non committate)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERRORE: working tree non pulito. Fai commit o ripristina le modifiche prima di aggiornare."
  git status --short
  exit 1
fi

# 2. Backup database prima di qualsiasi modifica
if [ -f "$DB_FILE" ]; then
  BACKUP="$DB_FILE.bak-$(date +%Y%m%d_%H%M%S)"
  cp "$DB_FILE" "$BACKUP"
  echo "==> Backup DB: $BACKUP"
fi

# 3. Aggiorna il codice (solo fast-forward — non fa merge, non cambia branch)
echo "==> git pull --ff-only"
git pull --ff-only origin main

# 4. Dipendenze (omette devDependencies in produzione)
echo "==> npm install --omit=dev"
npm install --omit=dev

# 5. Migration database
echo "==> npm run db:migrate"
npm run db:migrate

# 6. Riavvia servizio systemd (se attivo)
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo "==> systemctl restart $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
  sleep 2
  sudo systemctl status "$SERVICE_NAME" --no-pager -l
else
  echo "==> Servizio $SERVICE_NAME non attivo — avvia manualmente con:"
  echo "    sudo systemctl start $SERVICE_NAME"
fi

echo ""
echo "==> Aggiornamento completato."

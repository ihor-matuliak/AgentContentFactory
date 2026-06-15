#!/usr/bin/env bash
# Agent Content Factory — резервна копія бази даних.
#
# Робить дамп бази ai_agent_swarm у папку backups/ із часовою міткою
# й лишає лише 14 останніх копій. Чіпає тільки базу ai_agent_swarm роллю swarm.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

HOST="${ADMIN_HOST:-localhost}"
PORT="${ADMIN_PORT:-5432}"
DB_NAME="ai_agent_swarm"
DB_ROLE="swarm"
DB_PASSWORD="swarm"
KEEP=14

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql"

echo "==> Резервна копія бази '$DB_NAME' → $OUT"
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$HOST" -p "$PORT" \
  -U "$DB_ROLE" -d "$DB_NAME" --no-owner --no-privileges -f "$OUT"

# Лишаємо лише $KEEP останніх копій.
COUNT="$(ls -1t "$BACKUP_DIR"/${DB_NAME}-*.sql 2>/dev/null | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$BACKUP_DIR"/${DB_NAME}-*.sql | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "   видаляю стару копію: $(basename "$old")"
    rm -f "$old"
  done
fi

echo "✅ Готово. Копій у backups/: $(ls -1 "$BACKUP_DIR"/${DB_NAME}-*.sql 2>/dev/null | wc -l | tr -d ' ') (зберігаємо $KEEP)."

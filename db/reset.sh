#!/usr/bin/env bash
# Agent Content Factory — перестворення бази з нуля.
#
# Видаляє ТІЛЬКИ базу ai_agent_swarm (інші бази не чіпаються) і запускає
# setup.sh заново. Роль swarm залишається й перевикористовується.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ADMIN_HOST="${ADMIN_HOST:-localhost}"
ADMIN_PORT="${ADMIN_PORT:-5432}"
ADMIN_USER="${ADMIN_USER:-postgres}"
ADMIN_DB="${ADMIN_DB:-postgres}"

DB_NAME="ai_agent_swarm"

echo "⚠️  Перестворення бази '$DB_NAME' з нуля (інші бази не чіпаються)."

# Розриваємо активні підключення до цільової бази, щоб DROP не завис.
psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" -U "$ADMIN_USER" -d "$ADMIN_DB" \
  -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  >/dev/null

echo "==> Видалення бази '$DB_NAME' (якщо існує)…"
psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" -U "$ADMIN_USER" -d "$ADMIN_DB" \
  -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "==> Запуск setup.sh…"
ADMIN_HOST="$ADMIN_HOST" ADMIN_PORT="$ADMIN_PORT" ADMIN_USER="$ADMIN_USER" \
  ADMIN_DB="$ADMIN_DB" bash "$SCRIPT_DIR/setup.sh"

echo "✅ Базу '$DB_NAME' перестворено."

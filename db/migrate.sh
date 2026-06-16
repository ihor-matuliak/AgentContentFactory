#!/usr/bin/env bash
# Agent Content Factory — безпечна міграція схеми (migrate.sql).
#
# Застосовує нові таблиці БЕЗ перестворення бази й без втрати даних
# (усе в migrate.sql ідемпотентне). Чіпає лише базу ai_agent_swarm роллю swarm.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HOST="${ADMIN_HOST:-localhost}"
PORT="${ADMIN_PORT:-5432}"
DB_NAME="ai_agent_swarm"
DB_ROLE="swarm"
DB_PASSWORD="swarm"

echo "==> Застосування міграції до бази '$DB_NAME'…"
PGPASSWORD="$DB_PASSWORD" psql -h "$HOST" -p "$PORT" \
  -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/migrate.sql"

if [ -f "$SCRIPT_DIR/migrate_gemini.sql" ]; then
  echo "==> Застосування міграції Gemini…"
  PGPASSWORD="$DB_PASSWORD" psql -h "$HOST" -p "$PORT" \
    -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/migrate_gemini.sql"
fi

if [ -f "$SCRIPT_DIR/migrate_knowledge_v2.sql" ]; then
  echo "==> Застосування міграції Бази знань v2…"
  PGPASSWORD="$DB_PASSWORD" psql -h "$HOST" -p "$PORT" \
    -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/migrate_knowledge_v2.sql"
fi

if [ -f "$SCRIPT_DIR/migrate_higgsfield.sql" ]; then
  echo "==> Застосування міграції Higgsfield (generated_assets)…"
  PGPASSWORD="$DB_PASSWORD" psql -h "$HOST" -p "$PORT" \
    -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/migrate_higgsfield.sql"
fi

echo "✅ Міграцію застосовано (дані збережено)."

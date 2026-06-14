#!/usr/bin/env bash
# Agent Content Factory — оновлення даних агентів (seed.sql) без перестворення бази.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HOST="${ADMIN_HOST:-localhost}"
PORT="${ADMIN_PORT:-5432}"
DB_NAME="ai_agent_swarm"
DB_ROLE="swarm"
DB_PASSWORD="swarm"

echo "==> Оновлення даних агентів у базі '$DB_NAME'…"
PGPASSWORD="$DB_PASSWORD" psql -h "$HOST" -p "$PORT" \
  -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed.sql"

echo "✅ Дані агентів оновлено."

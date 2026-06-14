#!/usr/bin/env bash
# Agent Content Factory — створення ролі та бази даних рою.
#
# Створює роль swarm (пароль swarm) і базу ai_agent_swarm у локальному
# PostgreSQL, після чого застосовує schema.sql та seed.sql.
#
# ВАЖЛИВО: скрипт ніколи не чіпає інші бази — він працює тільки з роллю
# swarm та базою ai_agent_swarm. Видалення тут немає (див. reset.sh).
#
# Адмінське підключення (для CREATE ROLE/DATABASE) береться з env:
#   ADMIN_HOST   (default: localhost)
#   ADMIN_PORT   (default: 5432)
#   ADMIN_USER   (default: postgres)
#   ADMIN_DB     (default: postgres)
# Пароль адміна — через стандартний PGPASSWORD або ~/.pgpass.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ADMIN_HOST="${ADMIN_HOST:-localhost}"
ADMIN_PORT="${ADMIN_PORT:-5432}"
ADMIN_USER="${ADMIN_USER:-postgres}"
ADMIN_DB="${ADMIN_DB:-postgres}"

DB_NAME="ai_agent_swarm"
DB_ROLE="swarm"
DB_PASSWORD="swarm"

# psql, що підключається адміном до службової бази postgres.
admin_psql() {
  psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" -U "$ADMIN_USER" -d "$ADMIN_DB" \
    -v ON_ERROR_STOP=1 "$@"
}

echo "==> Перевірка/створення ролі '$DB_ROLE'…"
ROLE_EXISTS="$(admin_psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'")"
if [ "$ROLE_EXISTS" = "1" ]; then
  echo "    Роль '$DB_ROLE' вже існує — оновлюю пароль."
  admin_psql -c "ALTER ROLE $DB_ROLE WITH LOGIN PASSWORD '$DB_PASSWORD';"
else
  admin_psql -c "CREATE ROLE $DB_ROLE WITH LOGIN PASSWORD '$DB_PASSWORD';"
  echo "    Роль '$DB_ROLE' створено."
fi

echo "==> Перевірка/створення бази '$DB_NAME'…"
DB_EXISTS="$(admin_psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")"
if [ "$DB_EXISTS" = "1" ]; then
  echo "    База '$DB_NAME' вже існує — пропускаю створення."
else
  # CREATE DATABASE не можна виконувати в транзакції, тому окремою командою.
  admin_psql -c "CREATE DATABASE $DB_NAME OWNER $DB_ROLE;"
  echo "    Базу '$DB_NAME' створено (власник: $DB_ROLE)."
fi

# Підстраховка: гарантуємо, що власник саме swarm.
admin_psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_ROLE;"

echo "==> Застосування схеми (schema.sql)…"
PGPASSWORD="$DB_PASSWORD" psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" \
  -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/schema.sql"

echo "==> Завантаження початкових даних (seed.sql)…"
PGPASSWORD="$DB_PASSWORD" psql -h "$ADMIN_HOST" -p "$ADMIN_PORT" \
  -U "$DB_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed.sql"

echo "✅ Готово: база '$DB_NAME' налаштована, роль '$DB_ROLE' активна."

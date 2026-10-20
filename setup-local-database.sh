#!/bin/bash
# Local PostgreSQL setup. Authentication remains external (peer/trust or libpq).
# Never construct or print a credential-bearing connection string.
set -e

DB_NAME="dynapharm"
DB_HOST="localhost"
DB_PORT="5432"

if [[ "${NODE_ENV:-}" == "production" || "${REPLIT_DEPLOYMENT:-}" == "1" || "${REPLIT_DEPLOYMENT:-}" == "true" ]]; then
  echo "Local database setup refused in production." >&2
  exit 1
fi
DB_USER=$(whoami)

echo "Checking local PostgreSQL availability..."
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "Local PostgreSQL must be started by the operator." >&2
  exit 1
fi

# Fixed local database identity; no production URL or command-line URL accepted.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE dynapharm;" 2>/dev/null || \
  (psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "SELECT 1 FROM pg_database WHERE datname = 'dynapharm';" | grep -q 1)

local_psql() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "Applying local schema..."
local_psql -f backend/db_schema.sql
echo "Applying local enhancements..."
local_psql -f backend/db_enhancements.sql

TABLE_COUNT=$(local_psql -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
SYNC_LOG_EXISTS=$(local_psql -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sync_log');" | xargs)
TRIGGER_COUNT=$(local_psql -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE '%_notify';" | xargs)
echo "Local database setup complete."
echo "Tables: $TABLE_COUNT; sync log present: $SYNC_LOG_EXISTS; realtime triggers: $TRIGGER_COUNT"
echo "Configure application authentication separately through a protected settings workflow."

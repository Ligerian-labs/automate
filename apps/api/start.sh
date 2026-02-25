#!/bin/sh
set -e
echo "Running database migrations..."
bun run /app/apps/api/src/db/migrate.ts
echo "Starting API server..."
exec bun run /app/apps/api/src/index.ts

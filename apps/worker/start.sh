#!/bin/sh
set -e
echo "Running database migrations..."
bun run /app/apps/api/dist/db/migrate.js
echo "Starting worker..."
exec bun run /app/apps/worker/dist/index.js

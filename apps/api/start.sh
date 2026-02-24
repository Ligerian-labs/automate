#!/bin/sh
set -e
echo "Running database migrations..."
bun run /app/apps/api/dist/db/migrate.js
echo "Starting API server..."
exec bun run /app/apps/api/dist/index.js

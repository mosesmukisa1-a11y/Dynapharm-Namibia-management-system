#!/bin/bash
set -e

echo "Running post-merge setup..."

# Install all dependencies including dev tools (overrides .npmrc omit=dev)
npm install --include=dev --no-fund --no-audit

# Apply any pending database migrations (migrations only, no user seeding)
echo "Running database migrations..."
node migrations/run-migrations.js --migrations-only

echo "Post-merge setup complete."

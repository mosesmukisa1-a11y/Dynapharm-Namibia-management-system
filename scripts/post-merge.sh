#!/bin/bash
set -e

echo "Running post-merge setup..."

# Install all dependencies including dev tools (overrides .npmrc omit=dev)
npm install --include=dev --no-fund --no-audit

# Apply any pending database migrations (migrations only, no user seeding)
echo "Running database migrations..."
node migrations/run-migrations.js --migrations-only

# Express serves dist; merged frontend repairs must not leave a stale bundle.
echo "Building the frontend..."
npm run build

echo "Post-merge setup complete."

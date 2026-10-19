#!/bin/bash
set -euo pipefail

echo "Running candidate-only post-merge source checks..."

# A merge is not owner authorization to install, migrate, mint a release identity,
# or build unreviewed source. Dependency reconciliation and release build belong
# to the separately reviewed clean-install gate, not this automatic hook.
if [[ "${NODE_ENV:-}" == "production" || "${REPLIT_DEPLOYMENT:-}" == "1" || "${REPLIT_DEPLOYMENT:-}" == "true" ]]; then
  echo "Post-merge source checks refused in production." >&2
  exit 1
fi

node --check scripts/lib/release-package.mjs
node --check scripts/lib/verify-release-status.mjs
node --check api/services/releaseStatus.js
node --check server.js

echo "Post-merge source checks complete; no install, migration or build was performed."
echo "Frontend dist may be stale. Release remains blocked until a reviewed candidate is frozen and its bound clean-install/build gate passes."

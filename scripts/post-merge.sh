#!/bin/bash
set -e

echo "Running post-merge setup..."

# Install root dependencies (backend + dev tools)
npm install --no-fund --no-audit


echo "Post-merge setup complete."

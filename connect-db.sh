#!/bin/bash
# Quick database connection script for Dynapharm
# Usage: ./connect-db.sh [command]

DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'

# Export for other scripts
export DATABASE_URL

if [ -z "$1" ]; then
    # No command provided, open interactive psql session
    echo "🔗 Connecting to Dynapharm database..."
    echo ""
    psql "$DATABASE_URL"
else
    # Execute the provided command
    psql "$DATABASE_URL" -c "$1"
fi


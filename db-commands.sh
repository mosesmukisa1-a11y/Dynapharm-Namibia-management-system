#!/bin/bash
# Common database commands for Dynapharm
# Usage: source db-commands.sh (then use the functions)

DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'
export DATABASE_URL

# Connect to database interactively
db-connect() {
    echo "🔗 Connecting to Dynapharm database..."
    psql "$DATABASE_URL"
}

# List all tables
db-tables() {
    psql "$DATABASE_URL" -c "\dt"
}

# Show table structure
db-structure() {
    if [ -z "$1" ]; then
        echo "Usage: db-structure <table_name>"
        return 1
    fi
    psql "$DATABASE_URL" -c "\d $1"
}

# Count records in a table
db-count() {
    if [ -z "$1" ]; then
        echo "Usage: db-count <table_name>"
        return 1
    fi
    psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM $1;"
}

# View recent sync logs
db-sync-logs() {
    psql "$DATABASE_URL" -c "SELECT * FROM sync_log ORDER BY changed_at DESC LIMIT ${1:-10};"
}

# View all clients
db-clients() {
    psql "$DATABASE_URL" -c "SELECT id, name, phone, email FROM clients LIMIT ${1:-20};"
}

# View all users
db-users() {
    psql "$DATABASE_URL" -c "SELECT id, username, full_name, role, branch FROM users LIMIT ${1:-20};"
}

# View all branches
db-branches() {
    psql "$DATABASE_URL" -c "SELECT id, name, location, phone FROM branches;"
}

# Execute custom SQL
db-query() {
    if [ -z "$1" ]; then
        echo "Usage: db-query \"SELECT * FROM table_name LIMIT 10;\""
        return 1
    fi
    psql "$DATABASE_URL" -c "$1"
}

# Show help
db-help() {
    echo "📚 Dynapharm Database Commands"
    echo "=============================="
    echo ""
    echo "Available commands:"
    echo "  db-connect          - Open interactive psql session"
    echo "  db-tables           - List all tables"
    echo "  db-structure <table> - Show table structure"
    echo "  db-count <table>    - Count records in table"
    echo "  db-sync-logs [n]    - View recent sync logs (default: 10)"
    echo "  db-clients [n]      - View clients (default: 20)"
    echo "  db-users [n]        - View users (default: 20)"
    echo "  db-branches         - View all branches"
    echo "  db-query \"SQL\"      - Execute custom SQL query"
    echo "  db-help             - Show this help"
    echo ""
    echo "Example:"
    echo "  source db-commands.sh"
    echo "  db-tables"
    echo "  db-count clients"
    echo "  db-query \"SELECT * FROM orders WHERE created_at > '2024-01-01';\""
}


# 🗄️ Database Access Guide

## Quick Access

### Method 1: Interactive Connection
```bash
./connect-db.sh
```

### Method 2: Using Helper Commands
```bash
# Load the helper functions
source db-commands.sh

# Then use any command:
db-tables          # List all tables
db-count clients   # Count records in clients table
db-clients         # View clients
db-help            # Show all available commands
```

### Method 3: Direct psql Command
```bash
export DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'
psql "$DATABASE_URL"
```

---

## Connection Details

- **Host:** `shuttle.proxy.rlwy.net`
- **Port:** `23724`
- **Database:** `railway`
- **Username:** `postgres`
- **Password:** `GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq`

**Connection String:**
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
```

---

## Common Commands

### List Tables
```bash
./connect-db.sh "\dt"
```

### View Table Structure
```bash
./connect-db.sh "\d clients"
```

### Query Data
```bash
./connect-db.sh "SELECT COUNT(*) FROM clients;"
./connect-db.sh "SELECT * FROM clients LIMIT 10;"
./connect-db.sh "SELECT * FROM users WHERE role = 'admin';"
```

### View Recent Changes
```bash
./connect-db.sh "SELECT * FROM sync_log ORDER BY changed_at DESC LIMIT 10;"
```

---

## Using GUI Tools

You can also use database GUI tools like:
- **pgAdmin** (https://www.pgadmin.org/)
- **DBeaver** (https://dbeaver.io/)
- **TablePlus** (https://tableplus.com/)
- **Postico** (macOS: https://eggerapps.at/postico/)

**Connection Settings:**
- Host: `shuttle.proxy.rlwy.net`
- Port: `23724`
- Database: `railway`
- Username: `postgres`
- Password: `GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq`

---

## Available Helper Functions

After running `source db-commands.sh`, you have access to:

- `db-connect` - Open interactive session
- `db-tables` - List all tables
- `db-structure <table>` - Show table structure
- `db-count <table>` - Count records
- `db-sync-logs [n]` - View sync logs (default: 10)
- `db-clients [n]` - View clients (default: 20)
- `db-users [n]` - View users (default: 20)
- `db-branches` - View all branches
- `db-query "SQL"` - Execute custom SQL
- `db-help` - Show help

---

## Example Workflow

```bash
# 1. Connect interactively
./connect-db.sh

# Inside psql:
\d clients          # Describe clients table
SELECT * FROM clients LIMIT 5;
\q                  # Quit

# 2. Or use helper commands
source db-commands.sh
db-tables
db-count clients
db-clients 10
```

---

## Security Note

⚠️ **Keep your database credentials secure!**
- Don't share the connection string publicly
- Use environment variables in production code
- Consider rotating passwords periodically


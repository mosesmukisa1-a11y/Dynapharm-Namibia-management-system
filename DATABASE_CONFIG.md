# 📋 Database Configuration

## Local Database Configuration

**Database Name:** `dynapharm`  
**Database User:** `moseswalker`  
**Password:** `welker33`  
**Host:** `localhost`  
**Port:** `5432`

### Connection URLs

**For Local Development (no password in URL):**
```
postgresql://moseswalker@localhost:5432/dynapharm
```

**With Password (for Railway/Vercel style):**
```
postgresql://moseswalker:welker33@localhost:5432/dynapharm
```

### Environment Variable

To use this database in your application:

```bash
export DATABASE_URL='postgresql://moseswalker@localhost:5432/dynapharm'
```

Or add to `.env` file:
```
DATABASE_URL=postgresql://moseswalker@localhost:5432/dynapharm
```

---

## Database Status

✅ **Database Created:** dynapharm  
✅ **Tables:** 21 tables created  
✅ **Enhancements:** Applied (sync_log, triggers, indexes)  
✅ **Realtime Triggers:** 4 triggers configured

### Tables Created

- branches
- users
- products
- price_history
- clients
- stock_batches
- branch_stock
- stock_movements
- reports
- orders
- employees
- stock_requests
- stock_transfers
- attendance
- leave_requests
- shifts
- bonus_payments
- cash_requests
- notifications
- appointments
- sync_log (for tracking changes)

---

## Test Connection

```bash
# Test connection
psql "postgresql://moseswalker@localhost:5432/dynapharm" -c "SELECT version();"

# List all tables
psql "postgresql://moseswalker@localhost:5432/dynapharm" -c "\dt"

# Count tables
psql "postgresql://moseswalker@localhost:5432/dynapharm" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

---

## For Railway Deployment

When you deploy to Railway:
1. Railway will provide its own `DATABASE_URL`
2. You'll need to initialize the schema there too
3. Use the same `db_schema.sql` and `db_enhancements.sql` files

**Railway Setup Command:**
```bash
# After getting Railway DATABASE_URL
export DATABASE_URL='your-railway-database-url'
psql "$DATABASE_URL" -f backend/db_schema.sql
psql "$DATABASE_URL" -f backend/db_enhancements.sql
```

---

## Next Steps

1. ✅ Local database is ready
2. 🔄 Test your API endpoints with this database
3. 🔄 Set up Railway PostgreSQL for production
4. 🔄 Configure Vercel environment variables

---

## Quick Reference

**Connect to database:**
```bash
psql -d dynapharm
```

**Set environment variable:**
```bash
export DATABASE_URL='postgresql://moseswalker@localhost:5432/dynapharm'
```

**Run test script:**
```bash
export DATABASE_URL='postgresql://moseswalker@localhost:5432/dynapharm'
node test-database-connection.js
```

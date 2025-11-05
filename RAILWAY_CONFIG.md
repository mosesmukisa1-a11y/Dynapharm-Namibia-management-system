# 🚂 Railway Configuration

## Database Setup Status: ✅ COMPLETE

- ✅ PostgreSQL connected (PostgreSQL 17.6)
- ✅ 21 tables created
- ✅ Database enhancements applied
- ✅ 4 realtime triggers configured
- ✅ sync_log table exists

---

## Railway PostgreSQL Connection Strings

### External URL (For Vercel & Local Development)
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
```

### Internal URL (For Railway Services)
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway
```

**Note:** Use the **external URL** for Vercel environment variables.

---

## Environment Variables for Vercel

When deploying to Vercel, add these environment variables:

1. **DATABASE_URL**
   ```
   postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
   ```

2. **REALTIME_GATEWAY_URL** (after deploying gateway)
   ```
   https://your-realtime-gateway-url.up.railway.app
   ```

3. **NODE_ENV**
   ```
   production
   ```

---

## Database Verification

✅ **Tables:** 21 tables created
- branches, users, products, clients, orders, reports, employees, etc.
- sync_log (for change tracking)

✅ **Realtime Triggers:** 4 triggers configured
- clients_notify
- orders_notify
- reports_notify
- products_notify

✅ **Indexes:** Performance indexes created
✅ **Functions:** notify_change() and log_sync_change() functions created

---

## Next Steps

### 1. Deploy Realtime Gateway to Railway

1. In Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose your repository
4. Click the new service → **"Settings"**
5. Set **Root Directory**: `realtime-gateway`
6. Go to **"Variables"** tab → Add:
   - Key: `DATABASE_URL`
   - Value: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`
     (Use **internal URL** for Railway services)
7. Wait for deployment
8. Generate domain: Settings → Networking → Generate Domain
9. Copy the URL

### 2. Deploy to Vercel

1. Go to https://vercel.com
2. Import your repository
3. Add environment variables:
   - `DATABASE_URL` = (external URL above)
   - `REALTIME_GATEWAY_URL` = (from step 1)
   - `NODE_ENV` = `production`
4. Deploy

---

## Test Connection

```bash
export DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM clients;"
```

---

## Quick Reference

**List all tables:**
```bash
psql "$DATABASE_URL" -c "\dt"
```

**Check sync_log:**
```bash
psql "$DATABASE_URL" -c "SELECT * FROM sync_log ORDER BY changed_at DESC LIMIT 5;"
```

**Check triggers:**
```bash
psql "$DATABASE_URL" -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_notify';"
```

---

## Security Note

⚠️ **Keep these credentials secure!**
- Don't commit to public repositories
- Use environment variables in production
- The password is stored in this file for reference only

---

## Status Summary

- ✅ Railway PostgreSQL: Configured
- ✅ Database Schema: Initialized (21 tables)
- ✅ Database Enhancements: Applied
- 🔄 Realtime Gateway: Pending deployment
- 🔄 Vercel Deployment: Pending

**Ready for Realtime Gateway deployment!**

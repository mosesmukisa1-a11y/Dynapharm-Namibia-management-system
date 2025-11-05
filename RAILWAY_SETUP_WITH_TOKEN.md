# 🚂 Railway Setup with Your Token

## Quick Setup Steps

Since Railway CLI requires interactive login, here's the easiest way:

---

## Step 1: Login to Railway Web Interface

1. Go to https://railway.app
2. Use your token to authenticate (if needed) or just login normally
3. Create a new project or select existing one

---

## Step 2: Create PostgreSQL Database

1. In Railway, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Wait ~30 seconds for provisioning
4. Click the **PostgreSQL** service
5. Go to **"Variables"** tab
6. Copy the `DATABASE_URL` value

---

## Step 3: Initialize Database Schema

**Option A: Railway Web Interface (EASIEST)**

1. In Railway → PostgreSQL service → Click **"Query"** tab
2. Open `backend/db_schema.sql` on your computer
3. Copy ALL contents (Cmd+A, Cmd+C)
4. Paste into Railway Query tab
5. Click **"Run"**
6. Repeat for `backend/db_enhancements.sql`

**Option B: Terminal (Quick)**

After getting your Railway DATABASE_URL, run:

```bash
# Replace with YOUR Railway DATABASE_URL
export DATABASE_URL='your-railway-database-url-here'

cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Initialize schema
psql "$DATABASE_URL" -f backend/db_schema.sql
psql "$DATABASE_URL" -f backend/db_enhancements.sql

# Verify
psql "$DATABASE_URL" -c "\dt"
```

---

## Step 4: Deploy Realtime Gateway

1. In Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose your repository
4. Click the new service → **"Settings"**
5. Set **Root Directory**: `realtime-gateway`
6. Go to **"Variables"** tab
7. Click **"+ New Variable"**
   - Key: `DATABASE_URL`
   - Value: (paste your Railway PostgreSQL DATABASE_URL)
8. Railway will auto-deploy
9. Once deployed (green status), go to **"Settings"** → **"Networking"**
10. Click **"Generate Domain"**
11. Copy the generated URL

---

## Step 5: Save Your URLs

After setup, you'll have:

1. **Railway DATABASE_URL:**
   ```
   postgresql://postgres:xxx@xxx.railway.app:5432/railway
   ```

2. **Realtime Gateway URL:**
   ```
   https://xxx.up.railway.app
   ```

**Save both for Vercel configuration!**

---

## Quick Command (After Getting DATABASE_URL)

Once you have your Railway DATABASE_URL, run this:

```bash
# Set your Railway DATABASE_URL here
export DATABASE_URL='paste-your-railway-database-url-here'

cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Initialize database
psql "$DATABASE_URL" -f backend/db_schema.sql && \
psql "$DATABASE_URL" -f backend/db_enhancements.sql && \
echo "✅ Database initialized!" && \
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

---

## Next Steps

1. ✅ Railway PostgreSQL set up
2. ✅ Database schema initialized
3. ✅ Realtime Gateway deployed
4. 🔄 Deploy to Vercel (see `RAILWAY_VERCEL_DEPLOYMENT.md`)
5. 🔄 Configure Vercel environment variables

---

## Need Help?

If you get stuck:
1. Share your Railway DATABASE_URL and I can help initialize it
2. Share any error messages you encounter
3. Check Railway logs: Service → Deployments → View Logs

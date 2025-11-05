# Manual Railway Login Steps

Since Railway CLI requires interactive mode, please run these commands **manually in your terminal**:

## Step 1: Login with Token

Open your terminal and run:

```bash
railway login --browserless
```

When prompted for the token, paste:
```
465e4489-cf3d-448a-8172-74db8e58e93a
```

## Step 2: Verify Login

```bash
railway whoami
```

You should see your Railway account email.

## Step 3: Run Setup

After logging in, run:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
./setup-with-token.sh
```

Or run these commands manually:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
railway link
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'
railway variables
railway up
```

## Step 4: Set Root Directory (IMPORTANT!)

1. Go to https://railway.app
2. Your project → Realtime Gateway service
3. Settings → Service Settings
4. Set **Root Directory** to: `realtime-gateway`
5. Set **Start Command** to: `node server.js`
6. Click **Save**

## Step 5: Test

Wait 2-3 minutes, then:

```bash
curl https://web-production-40cac.up.railway.app/health
```

Expected response:
```json
{"status":"ok","connectedClients":0,"db_connected":true,"timestamp":...}
```

---

**Start with Step 1 in your terminal!**


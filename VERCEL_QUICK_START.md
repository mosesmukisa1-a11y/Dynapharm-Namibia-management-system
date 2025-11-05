# ⚡ Vercel Quick Start

## Fast Setup (5 minutes)

### 1. Go to Vercel
- Visit: https://vercel.com
- Sign in with GitHub

### 2. Import Project
- Click **"Add New"** → **"Project"**
- Select: `mosesmukisa1-a11y/Dynapharm-Namibia-management-system`
- Click **"Import"**

### 3. Configure (First Time)
- Leave all settings as default
- Click **"Deploy"**
- Wait for first deployment

### 4. Add Environment Variables
After deployment:
- Go to **Settings** → **Environment Variables**
- Add these:

**DATABASE_URL**
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
```
✅ Production, ✅ Preview, ✅ Development

**REALTIME_GATEWAY_URL**
```
https://web-production-40cac.up.railway.app
```
✅ Production, ✅ Preview, ✅ Development

### 5. Redeploy
- Go to **Deployments** → Latest deployment
- Click **"..."** → **"Redeploy"**

### 6. Done!
Your site is live at: `https://your-project.vercel.app`

---

## Quick Commands (CLI Alternative)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
vercel --prod

# Add environment variables
vercel env add DATABASE_URL production
vercel env add REALTIME_GATEWAY_URL production

# Redeploy
vercel --prod
```

---

**That's it! Your app is now live on Vercel!** 🎉


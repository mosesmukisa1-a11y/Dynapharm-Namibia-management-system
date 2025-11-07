# 🚀 DEPLOY NOW - Step by Step Guide

## ✅ **STEP 1: Create GitHub Repository**

### Manual GitHub Setup:
1. Go to [GitHub.com](https://github.com)
2. Login with: `mosesmukisa1-a11y`
3. Click **"New Repository"**
4. Repository name: `dynapharm-cloud`
5. Description: `Dynapharm International Namibia - Cloud Health Management System`
6. Set to **Public**
7. **DO NOT** initialize with README (we already have files)
8. Click **"Create Repository"**

### Connect Local Repository:
```bash
cd ~/Desktop/dynapharm-cloud
git remote add origin https://github.com/mosesmukisa1-a11y/dynapharm-cloud.git
git branch -M main
git push -u origin main
```

---

## ✅ **STEP 2: Deploy Backend to Railway**

### Railway Deployment:
1. Go to [Railway.app](https://railway.app)
2. Login with: `mosesmukisa1-a11y`
3. Click **"New Project"**
4. Choose **"Deploy from GitHub repo"**
5. Select repository: `dynapharm-cloud`
6. Choose **"backend"** folder
7. Railway will auto-detect Python and deploy
8. **Save your Railway URL** (e.g., `https://dynapharm-backend-production.up.railway.app`)

---

## ✅ **STEP 3: Deploy Frontend to Vercel**

### Vercel Deployment:
1. Go to [Vercel.com](https://vercel.com)
2. Login with: `mosesmukisa1-a11y`
3. Click **"New Project"**
4. Import from GitHub: `dynapharm-cloud`
5. Choose **"frontend"** folder as root directory
6. Deploy
7. **Save your Vercel URL** (e.g., `https://dynapharm-cloud.vercel.app`)

---

## ✅ **STEP 4: Update API Endpoint**

### Update Frontend Configuration:
1. Edit `frontend/index.html`
2. Find this line (around line 50):
   ```javascript
   API_BASE = 'https://dynapharm-backend-production.up.railway.app/api';
   ```
3. Replace with your **actual Railway URL**:
   ```javascript
   API_BASE = 'https://YOUR-RAILWAY-URL.up.railway.app/api';
   ```
4. Commit and push changes:
   ```bash
   git add .
   git commit -m "Update API endpoint"
   git push
   ```
5. Vercel will auto-redeploy

---

## ✅ **STEP 5: Test Your Deployment**

### Test URLs:
- **Frontend**: `https://your-project.vercel.app`
- **Backend Health**: `https://your-railway-url.up.railway.app/api/health`
- **API Test**: `https://your-railway-url.up.railway.app/api/users`

### Authentication Checklist:
- Run `node migrations/run-migrations.js` after setting `DATABASE_URL` to seed the default Dynapharm accounts with hashed passwords.
- Set `AUTH_SECRET` (and optionally `AUTH_ALLOWED_ORIGINS`, `AUTH_TOKEN_TTL`, `AUTH_REFRESH_TTL`) before deploying the API.
- Verify `/api/auth/login` and `/api/auth/me` return expected responses using your seeded credentials.

---

## 🎉 **SUCCESS!**

Your Dynapharm system is now:
- ✅ **Live on the internet** 24/7
- ✅ **Auto-scaling** with traffic
- ✅ **SSL-secured** with HTTPS
- ✅ **Globally accessible**
- ✅ **Auto-deploying** on code changes

---

## 📞 **Need Help?**

If you encounter any issues:
1. Check the deployment logs in Railway/Vercel dashboards
2. Verify your GitHub repository is public
3. Ensure all files are committed and pushed
4. Check that the API endpoint URL is correct

**Your system will be accessible at your Vercel URL!** 🚀

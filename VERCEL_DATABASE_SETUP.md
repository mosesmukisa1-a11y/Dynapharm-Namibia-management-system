# Vercel Database Setup Guide

## 🎯 Quick Setup

Your Railway PostgreSQL database is ready to connect!

### Database Connection String:
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
```

## 📋 Step-by-Step Instructions

### Method 1: Vercel Dashboard (Easiest)

1. **Open Vercel Dashboard**
   - Go to: https://vercel.com/dashboard
   - Select your project: `dynapharm-namibia-management-system-pi`

2. **Navigate to Environment Variables**
   - Click **Settings** tab
   - Click **Environment Variables** in the left sidebar

3. **Add DATABASE_URL Variable**
   - Click **Add** button
   - Fill in:
     ```
     Name: DATABASE_URL
     Value: postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
     ```
   - Check all environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

4. **Redeploy Your Application**
   - Go to **Deployments** tab
   - Find your latest deployment
   - Click the ⋯ (three dots) menu
   - Select **Redeploy** → **Redeploy with existing Build Cache**
   - Wait for deployment to complete (~1-2 minutes)

### Method 2: Vercel CLI

If you have Vercel CLI installed:

```bash
# Set environment variable
vercel env add DATABASE_URL production

# When prompted, paste:
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway

# Also add for preview and development
vercel env add DATABASE_URL preview
vercel env add DATABASE_URL development

# Redeploy
vercel --prod
```

## ✅ Verification

After redeploying, your API endpoints should work:

1. **Test Health Endpoint:**
   ```
   https://dynapharm-namibia-management-system-pi.vercel.app/api/health
   ```

2. **Check Console Logs:**
   - Login to your site
   - Open browser console (F12)
   - You should no longer see "HTTP 500" errors for `/api/branches` or `/api/stock-batches`

3. **Test API Endpoints:**
   - `/api/branches` - Should return your branches
   - `/api/products` - Should return products
   - `/api/auth/login` - Should authenticate users

## 🔒 Security Notes

- ✅ The connection string is stored securely in Vercel
- ✅ Never commit `.env` files to GitHub
- ✅ The `.env.example` file has been created as a template
- ✅ SSL is automatically configured for Railway connections

## 📊 Expected Behavior After Setup

**Before:**
```
❌ Request failed for /api/branches: Error: HTTP 500
❌ API unavailable, using localStorage fallback
```

**After:**
```
✅ API connected successfully
✅ Loaded branches from database
✅ Synced products from backend
✅ Real-time sync activated
```

## 🐛 Troubleshooting

### If you still see 500 errors:

1. **Check Environment Variable:**
   ```bash
   # Verify it's set correctly in Vercel
   vercel env ls
   ```

2. **Check Database Schema:**
   - The error mentioned: `column "distributor_name" does not exist`
   - You may need to run database migrations
   - Check `migrations/` folder for SQL scripts

3. **View Deployment Logs:**
   - Go to Vercel Dashboard → Deployments
   - Click on your deployment
   - View **Functions** tab for error details

4. **Test Database Connection Locally:**
   ```bash
   # Create .env file (DO NOT COMMIT)
   echo "DATABASE_URL=postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway" > .env
   
   # Test connection
   node test-database-connection.js
   ```

## 📞 Next Steps

1. Add the DATABASE_URL to Vercel (see Method 1 above)
2. Redeploy your application
3. Test the APIs
4. If database schema issues persist, we'll run migrations

## 🎉 Benefits After Setup

- ✅ Real-time data sync across all users
- ✅ Data persists across sessions
- ✅ Multi-user support
- ✅ Centralized data storage
- ✅ No localStorage limitations


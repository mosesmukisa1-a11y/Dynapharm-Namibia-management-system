# 🔍 Vercel Error Diagnostic Guide

## Common Errors You Might Encounter

### 1. **NOT_FOUND (404)**
**What it means**: The API endpoint or deployment cannot be found.

**Possible causes:**
- API functions not being built/deployed
- Incorrect URL/path
- Deployment still in progress

**How to fix:**
1. Check Vercel dashboard → Deployments → Latest deployment → Functions tab
2. Verify `/api/health.js` appears in the functions list
3. Test: `https://dynapharm-namibia-health.vercel.app/api/health`
4. Check build logs for "Building Serverless Function: api/health.js"

### 2. **FUNCTION_INVOCATION_FAILED (500)**
**What it means**: The function ran but threw an error.

**Possible causes:**
- Syntax error in API file
- Missing dependencies
- Runtime error (e.g., file not found, undefined variable)

**How to fix:**
1. Check Vercel dashboard → Functions → View logs
2. Look for error stack traces
3. Test locally if possible
4. Check for missing `import` statements or dependencies

### 3. **FUNCTION_INVOCATION_TIMEOUT (504)**
**What it means**: Function took longer than `maxDuration` to execute.

**Current setting**: `maxDuration: 10` seconds

**How to fix:**
1. Increase `maxDuration` in `vercel.json` functions config
2. Optimize slow operations (file I/O, external API calls)
3. Add caching for repeated operations

### 4. **DEPLOYMENT_NOT_FOUND (404)**
**What it means**: The deployment doesn't exist or was deleted.

**How to fix:**
1. Check Vercel dashboard → Deployments
2. Verify deployment is active (not deleted/paused)
3. Check deployment URL matches your project domain

### 5. **FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE (500)**
**What it means**: Response exceeds Vercel's size limits.

**How to fix:**
1. Paginate large data responses
2. Filter data before sending
3. Use compression

## ✅ Quick Diagnostic Checklist

1. **Check Build Logs:**
   ```
   Vercel Dashboard → Your Project → Deployments → Latest → Build Logs
   ```
   - Look for: "Detected Serverless Functions"
   - Look for: "Building Serverless Function: api/health.js"
   - Check for any errors during build

2. **Check Function Logs:**
   ```
   Vercel Dashboard → Your Project → Functions → [function name] → Logs
   ```
   - Check for runtime errors
   - Check for timeout errors
   - Verify function is being invoked

3. **Test API Endpoints:**
   ```bash
   # Health check
   curl https://dynapharm-namibia-health.vercel.app/api/health
   
   # Clients endpoint
   curl https://dynapharm-namibia-health.vercel.app/api/clients
   
   # Users endpoint
   curl https://dynapharm-namibia-health.vercel.app/api/users
   ```

4. **Verify vercel.json:**
   - ✅ `builds` array includes `api/*.js`
   - ✅ `functions` config specifies runtime
   - ✅ No syntax errors in JSON

5. **Verify API Files:**
   - ✅ Files exist in `/api/` directory
   - ✅ Files export `export default function handler(req, res)`
   - ✅ Files are committed to git
   - ✅ Files appear in Vercel deployment files

## 🔧 Current Configuration Status

**vercel.json:**
- ✅ Explicit builds for API functions: `api/*.js` → `@vercel/node`
- ✅ Functions runtime: `nodejs18.x`
- ✅ Memory: 256MB
- ✅ Max Duration: 10 seconds

**API Files:**
- ✅ Using ES6 modules (`export default`)
- ✅ CORS headers configured
- ✅ OPTIONS method handled

## 🚨 If Errors Persist

1. **Check Vercel Project Settings:**
   - Root Directory: Should be `.` (root)
   - Framework Preset: None or "Other"
   - Build Command: (empty - Vercel auto-detects)

2. **Verify Git Repository:**
   - API files are committed
   - `vercel.json` is committed
   - Latest commit is pushed

3. **Redeploy:**
   - Go to Vercel dashboard
   - Click "Redeploy" on latest deployment
   - Or push a new commit to trigger redeploy

4. **Check Vercel Support:**
   - If functions still not building, contact Vercel support
   - Share deployment URL and build logs

## 📊 Expected Behavior

**After successful deployment:**
1. Build logs show: "Building Serverless Function: api/[filename].js" for each API file
2. Functions tab in Vercel dashboard shows all API functions
3. `/api/health` endpoint returns JSON: `{"status":"ok",...}`
4. No 404 errors for `/api/*` endpoints

## 🔗 Useful Links

- [Vercel Serverless Functions Docs](https://vercel.com/docs/functions)
- [Vercel Error Codes](https://vercel.com/docs/errors)
- [Vercel Support](https://vercel.com/support)


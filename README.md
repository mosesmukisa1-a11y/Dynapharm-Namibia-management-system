## Realtime Gateway (Railway)

Deploy the WebSocket gateway in `realtime-gateway/` to Railway to enable instant cross-location updates without serverless limits.

Steps:
1. railway login
2. railway init (or railway link if project exists)
3. cd realtime-gateway
4. railway up
5. Note the public URL, e.g. https://your-service.up.railway.app
6. In the main app HTML, set `<meta name="rt-base" content="https://your-service.up.railway.app">`

The app will connect to `wss://your-service.up.railway.app/ws` and broadcast events on report save/dispense.

# Dynapharm Namibia Health Management System

## Live URL
**https://mosesmukisa1-a11y.github.io/dynapharm-namibia-health/dynapharm-complete-system.html**

## Quick Setup Instructions

### To Enable GitHub Pages (IMPORTANT):

1. Go to your repository: https://github.com/mosesmukisa1-a11y/dynapharm-namibia-health
2. Click **Settings** (top right)
3. Scroll down to **Pages** (left sidebar)
4. Under **Build and deployment** → **Source**:
   - Select **"Deploy from a branch"**
5. Under **Branch**:
   - Select **"main"**
   - Select **"/ (root)"**
6. Click **Save**
7. Wait 1-2 minutes for deployment to complete

After this, your site will be live at:
**https://mosesmukisa1-a11y.github.io/dynapharm-namibia-health/dynapharm-complete-system.html**

---

## System Information

### Features
- Client Registration
- Consultant Portal
- Dispenser Portal  
- MIS Portal
- Stock Management
- HR Portal
- Finance Portal
- Admin Portal
- GM Portal
- Director Portal

### Default Logins
- **Consultant**: username `consultant` / password `consultant123`
- **Dispenser**: username `dispenser` / password `dispenser123`
- **Admin**: username `admin` / password `admin123`

---

## Important Notes

- The `.nojekyll` file ensures the HTML file works correctly
- No GitHub Actions workflow is needed - branch deployment is simpler and more reliable
- All updates to the `main` branch will automatically deploy to GitHub Pages


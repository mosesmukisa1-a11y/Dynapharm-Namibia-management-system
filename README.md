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

### Authentication
- User accounts now authenticate against the PostgreSQL `users` table (`migrations/004_create_users_table.sql`).
- The migration runner seeds the existing Dynapharm credentials with bcrypt hashes. Run `node migrations/run-migrations.js` after setting `DATABASE_URL` to keep defaults in sync.
- `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me` provide secure session handling with HttpOnly cookies.
- All API routes share the same CORS helper so backend data is only available to authenticated origins.

#### Required environment variables
- `DATABASE_URL`: PostgreSQL connection string used by the migration runner and API routes.
- `AUTH_SECRET`: secret key used to sign session tokens.

#### Optional environment variables
- `AUTH_ALLOWED_ORIGINS`: comma-separated list of origins allowed to send credentialed requests. Defaults to echoing any `Origin` header.
- `AUTH_TOKEN_TTL`: access token lifetime in seconds (default `3600`).
- `AUTH_REFRESH_TTL`: refresh window in seconds (default `604800`).

---

## Important Notes

- Install dependencies (`npm install`) before running migrations or local API tests.
- Run `node migrations/run-migrations.js` whenever new migrations are added.
- The `.nojekyll` file ensures the HTML file works correctly.
- No GitHub Actions workflow is needed - branch deployment is simpler and more reliable.
- All updates to the `main` branch will automatically deploy to GitHub Pages.


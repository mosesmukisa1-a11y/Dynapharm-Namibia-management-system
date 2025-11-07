# Deployment Information

## Live URL
**https://mosesmukisa1-a11y.github.io/dynapharm-namibia-health/dynapharm-complete-system.html**

## Automatic Updates Setup ✅

The system is now configured for automatic deployment:

1. **Auto-deployment workflow**: Every time code is pushed to the `main` branch, GitHub automatically deploys it to the live site
2. **Commit and push**: Any changes made to the repository will automatically appear on the live site within 1-2 minutes
3. **No manual steps needed**: Your team can continue using the same URL with all updates automatically applied

## How Updates Work

### When you make changes:
1. Edit the file(s) in the repository
2. Commit and push to GitHub
3. GitHub automatically deploys the changes
4. Users see the updates at the live URL (may take 1-2 minutes)

### Browser Cache Note
If users don't see updates immediately, they should:
- **Hard refresh**: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
- **Clear cache**: Empty browser cache for the site
- **Use incognito mode**: To bypass any cache

## Team Access

Share this URL with your entire team:
**https://mosesmukisa1-a11y.github.io/dynapharm-namibia-health/dynapharm-complete-system.html**

## Default Login Accounts

## Authentication
- User accounts authenticate against the backend PostgreSQL database (`migrations/004_create_users_table.sql`).
- Default Dynapharm credentials are seeded automatically when you run `node migrations/run-migrations.js` with `DATABASE_URL` configured.
- Login, logout, and session validation live under `/api/auth`. Sessions use HttpOnly cookies signed with `AUTH_SECRET`.

### Required environment variables
- `DATABASE_URL`
- `AUTH_SECRET`

### Optional environment variables
- `AUTH_ALLOWED_ORIGINS`
- `AUTH_TOKEN_TTL`
- `AUTH_REFRESH_TTL`

## System Features

✅ Client Registration  
✅ Consultant Portal  
✅ Dispenser Portal  
✅ MIS Portal  
✅ Stock Management  
✅ HR Portal  
✅ Finance Portal  
✅ Admin Portal  
✅ GM Portal  
✅ Director Portal  

---

**Last Updated**: $(date)  
**Commit**: $(git log -1 --oneline)

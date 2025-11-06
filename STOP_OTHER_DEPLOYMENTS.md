# Stop Other Vercel Deployments

This guide will help you stop/remove all Vercel deployments except the correct one:
**https://dynapharm-namibia-management-system-pi.vercel.app/**

## Method 1: Using Vercel CLI (Recommended)

### Step 1: Authenticate with Vercel
```bash
vercel login
```
Follow the prompts to authenticate in your browser.

### Step 2: Run the cleanup script
```bash
./stop-other-vercel-deployments.sh
```

The script will:
- List all your Vercel projects
- Identify the correct project: `dynapharm-namibia-management-system-pi`
- Show you all other projects
- Ask for confirmation
- Remove all other projects

## Method 2: Using Vercel API (Alternative)

### Step 1: Get Vercel Token
1. Go to: https://vercel.com/account/tokens
2. Click "Create Token"
3. Give it a name (e.g., "Cleanup Script")
4. Copy the token

### Step 2: Run the Node.js script
```bash
export VERCEL_TOKEN=your_token_here
node stop-other-vercel-deployments.js
```

## Method 3: Manual Removal via Vercel Dashboard

1. Go to: https://vercel.com/dashboard
2. Select your team (if you have multiple teams)
3. For each project EXCEPT `dynapharm-namibia-management-system-pi`:
   - Click on the project
   - Go to Settings
   - Scroll down to "Danger Zone"
   - Click "Delete Project"
   - Confirm deletion

## Method 4: Using Vercel CLI Commands Manually

```bash
# 1. List all projects
vercel projects list --team team_qFWDX1wCnfnvezFivR8cUUZA

# 2. For each project you want to remove (replace PROJECT_ID):
vercel projects rm PROJECT_ID --team team_qFWDX1wCnfnvezFivR8cUUZA --yes

# 3. Verify only the correct project remains
vercel projects list --team team_qFWDX1wCnfnvezFivR8cUUZA
```

## What Will Be Kept

✅ **Kept:** `dynapharm-namibia-management-system-pi`
- URL: https://dynapharm-namibia-management-system-pi.vercel.app/

❌ **Removed:** All other Vercel projects in your team

## Important Notes

- ⚠️ This action is **irreversible** - deleted projects cannot be recovered
- ⚠️ Make sure you have backups if needed
- ✅ The correct deployment will remain active and accessible
- ✅ All deployments under the correct project will remain

## Verification

After cleanup, verify:
1. Go to: https://vercel.com/dashboard
2. You should only see: `dynapharm-namibia-management-system-pi`
3. Visit: https://dynapharm-namibia-management-system-pi.vercel.app/
4. Confirm the site is working correctly


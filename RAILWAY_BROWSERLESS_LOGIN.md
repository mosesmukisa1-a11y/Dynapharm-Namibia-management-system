# Railway Browserless Login Guide

## Option 1: Get Token from Railway Dashboard

1. Go to https://railway.app
2. Click on your profile (top right)
3. Go to **Settings** or **Account Settings**
4. Look for **"Tokens"** or **"API Tokens"** section
5. Click **"Create Token"** or **"New Token"**
6. Copy the token (you'll only see it once!)

Then run:
```bash
railway login --browserless
```
When prompted, paste your token.

## Option 2: Use Token Directly

If you have a token, you can set it as an environment variable:
```bash
export RAILWAY_TOKEN='your-token-here'
railway login --browserless
```

## Option 3: Use Token in Command

```bash
RAILWAY_TOKEN='your-token-here' railway login --browserless
```

---

## After Login

Once logged in, verify with:
```bash
railway whoami
```

Then proceed with the setup commands.


# Vercel Repository Connection Fix

## Issue
The repository was renamed from `Lore-Keeper` to `Lore-Book`, which may have broken the Vercel webhook connection.

## Solution Steps

### 1. Update Git Remote (Already Done)
```bash
git remote set-url origin git@github.com:abelxmendoza/Lore-Book.git
```

### 2. Reconnect Vercel to GitHub Repository

**Option A: Via Vercel Dashboard (Recommended)**
1. Go to: https://vercel.com/dashboard
2. Select your project: `lore-keeper-web-w75p`
3. Go to: **Settings** → **Git**
4. Click **Disconnect** (if connected to old repo)
5. Click **Connect Git Repository**
6. Select: `abelxmendoza/Lore-Book`
7. Select branch: `main`
8. Click **Save**

**Option B: Via Vercel CLI**
```bash
cd apps/web
vercel link
# Follow prompts to reconnect to the new repository
```

### 3. Verify Webhook is Active
1. Go to: https://github.com/abelxmendoza/Lore-Book/settings/hooks
2. Look for Vercel webhook
3. If missing, Vercel will create it when you reconnect

### 4. Manual Deployment Options

**Option 1: Trigger GitHub Actions Workflow**
1. Go to: https://github.com/abelxmendoza/Lore-Book/actions
2. Click on **Deploy** workflow
3. Click **Run workflow** → Select `main` → **Run workflow**

**Option 2: Deploy via Vercel CLI**
```bash
cd apps/web
vercel --prod
```

**Option 3: Redeploy from Vercel Dashboard**
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click **Redeploy** on latest deployment
3. Or click **Create Deployment** → Select branch `main`

### 5. Verify Environment Variables in Vercel
1. Vercel Dashboard → Project Settings → Environment Variables
2. Ensure these are set for **Production**:
   - `VITE_SHOW_DEV_NOTICE` = `true`
   - `VITE_USE_MOCK_DATA` = `true`
   - `NODE_VERSION` = `20`

## Why This Happens
When a GitHub repository is renamed:
- Git remotes need to be updated
- Vercel webhooks may break
- GitHub Actions still work (they use the new name automatically)
- Vercel needs to be reconnected to the new repository name

## After Reconnecting
Once reconnected, future pushes to `main` will automatically trigger Vercel deployments.

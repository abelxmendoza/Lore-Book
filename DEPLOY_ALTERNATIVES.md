# Alternative Deployment Methods

Since automatic deployment didn't trigger, here are several ways to deploy:

## Method 1: Manual GitHub Actions Trigger (Recommended)

1. Go to: https://github.com/YOUR_USERNAME/Lore-Keeper/actions
2. Click on "Deploy" workflow
3. Click "Run workflow" button
4. Select branch: `main`
5. Click "Run workflow"

This will trigger the deployment via GitHub Actions.

## Method 2: Vercel CLI (Direct Deployment)

```bash
# 1. Login to Vercel
cd apps/web
vercel login

# 2. Link to your project (if not already linked)
vercel link

# 3. Deploy to production
vercel --prod
```

## Method 3: Vercel Dashboard Manual Deploy

1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to "Deployments" tab
4. Click "Redeploy" on the latest deployment
5. Or click "Create Deployment" → Select branch `main` → Deploy

## Method 4: Force Push (Trigger Webhook)

Sometimes the webhook doesn't fire. Try:

```bash
# Make a small change to trigger deployment
git commit --allow-empty -m "Trigger deployment"
git push origin main
```

## Method 5: Check Vercel Git Integration

1. Go to Vercel Dashboard → Project Settings → Git
2. Verify:
   - Repository is connected
   - Production branch is set to `main`
   - Auto-deploy is enabled
   - Webhook is active

## Method 6: Update Environment Variables in Vercel Dashboard

Even if deployment doesn't trigger, you can update environment variables:

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add/Update:
   - `VITE_SHOW_DEV_NOTICE` = `true`
   - `VITE_USE_MOCK_DATA` = `true`
   - `NODE_VERSION` = `20`
3. Redeploy manually (Method 3)

## Troubleshooting

### Check if GitHub Actions ran:
- Go to: https://github.com/YOUR_USERNAME/Lore-Keeper/actions
- Look for the "Deploy" workflow
- Check if it ran and if it failed

### Check Vercel webhook:
- Vercel Dashboard → Project Settings → Git
- Look for webhook status
- May need to reconnect repository

### Verify secrets are set:
- GitHub → Settings → Secrets and variables → Actions
- Ensure these are set:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

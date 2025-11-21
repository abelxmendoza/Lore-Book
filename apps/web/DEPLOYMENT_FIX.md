# Vercel Deployment Fix - Web App

## ✅ Changes Made

### 1. Updated `apps/web/vercel.json`
- Changed `installCommand` to use `npm ci` first (clean install from package-lock.json)
- Added fallback to `npm install` if `npm ci` fails
- Added explicit `framework: "vite"` to help Vercel detect the framework

**New configuration:**
```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm ci --legacy-peer-deps || npm install --legacy-peer-deps",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### 2. Created `apps/web/.vercelignore`
- Hides root-level pnpm files that might confuse Vercel
- Prevents Vercel from seeing root `package.json` (which has no dependencies)
- Ensures Vercel only sees `apps/web/package.json`

### 3. Verified Configuration
- ✅ `vite` is in `dependencies` (not devDependencies)
- ✅ `package-lock.json` is committed and includes vite
- ✅ Root Directory is set to `apps/web` in Vercel dashboard
- ✅ Build works locally

## 🎯 Expected Behavior

After these changes, Vercel should:
1. Run `npm ci --legacy-peer-deps` from `apps/web/` directory
2. Install ~200+ packages (not 106) including vite
3. Successfully run `npm run build` which executes `vite build`
4. Output to `dist/` directory

## 📊 What to Check in Next Deployment

Look for these in Vercel build logs:
- ✅ "Installing dependencies from apps/web/package.json"
- ✅ "added 200+ packages" (not 106)
- ✅ "vite build" command running successfully
- ✅ Build completes with dist/ output

## 🔧 If Still Failing

1. **Verify Root Directory in Vercel Dashboard:**
   - Go to: Project Settings → General → Root Directory
   - Should be: `apps/web`

2. **Clear Build Cache:**
   - Project Settings → General → Clear Build Cache
   - Redeploy

3. **Check Build Logs:**
   - Look for which directory npm install runs from
   - Should show: "Installing dependencies from apps/web/package.json"

4. **Verify package-lock.json:**
   ```bash
   git ls-files apps/web/package-lock.json
   ```
   Should show the file is committed.


# Vercel Deployment Diagnosis: Why Vite Isn't Installing

## 🔍 COMPLETE REPO STRUCTURE SCAN

### 1. Package.json Files Found

| Location | Dependencies Count | Has Vite? | Purpose |
|----------|-------------------|-----------|---------|
| `/package.json` | **0 dependencies** | ❌ NO | Root monorepo scripts only |
| `apps/web/package.json` | **47 dependencies** | ✅ YES (`vite: ^5.4.1`) | Frontend app with vite |
| `apps/server/package.json` | 15 dependencies | ❌ NO | Backend API |
| `apps/mobile/package.json` | 8 dependencies | ❌ NO | Mobile app |

**CRITICAL FINDING:** Root `package.json` has ZERO dependencies. If Vercel uses this, it will only install ~106 base npm packages.

### 2. Lock Files Found

| Location | Type | Purpose | Includes Vite? |
|----------|------|---------|----------------|
| `/pnpm-lock.yaml` | pnpm workspace lock | Root monorepo lock | ❌ NO (root has no deps) |
| `apps/web/package-lock.json` | npm lock | Frontend app lock | ✅ YES (4709 lines, includes vite) |

**CONFLICT:** Root has `pnpm-lock.yaml` but Vercel is using `npm install`. This mismatch may confuse Vercel.

### 3. Workspace Configuration Files

| File | Location | Content | Impact on Vercel |
|------|----------|--------|------------------|
| `pnpm-workspace.yaml` | **Root** | Defines `apps/web` and `apps/server` | ⚠️ **SIGNALS MONOREPO** - Vercel may default to root |
| `.npmrc` | None found | N/A | ✅ No interference |

**PROBLEM:** Root `pnpm-workspace.yaml` tells Vercel this is a pnpm monorepo, causing it to look at root first.

### 4. Vercel Configuration

| File | Location | Status |
|------|----------|--------|
| `vercel.json` | `apps/web/vercel.json` | ✅ Present and correct |
| `.vercelignore` | None | N/A |

**Current `apps/web/vercel.json`:**
```json
{
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### 5. Root-Level Configs That May Interfere

- ✅ `pnpm-workspace.yaml` at root - **MAJOR SUSPECT**
- ✅ `pnpm-lock.yaml` at root - **SIGNALS PNPM USAGE**
- ✅ Root `package.json` with no dependencies - **CAUSES 106 PACKAGE INSTALL**
- ✅ Root `node_modules/` may exist (not checked, but likely)

---

## 🎯 ROOT CAUSE ANALYSIS

### Why Vercel Installs Only 106 Packages

**The Problem Chain:**

1. **Vercel detects monorepo structure:**
   - Sees `pnpm-workspace.yaml` at root
   - Sees `pnpm-lock.yaml` at root
   - Assumes this is a pnpm monorepo

2. **Vercel defaults to root directory:**
   - If Root Directory is NOT explicitly set to `apps/web` in dashboard
   - Vercel starts from repository root
   - Looks for `package.json` at root

3. **Root package.json has no dependencies:**
   - Root `/package.json` contains only scripts, zero dependencies
   - `npm install` at root installs only base packages (~106)
   - Vite is never installed because it's in `apps/web/package.json`, not root

4. **Vercel ignores `apps/web/vercel.json`:**
   - If Root Directory is not set, Vercel may not respect `apps/web/vercel.json`
   - Commands run from root, not `apps/web/`

### Exact Offenders

1. **`/pnpm-workspace.yaml`** - ⚠️ **PRIMARY CULPRIT**
   - Signals monorepo structure
   - Makes Vercel think it should use root

2. **`/pnpm-lock.yaml`** - ⚠️ **SECONDARY CULPRIT**
   - Suggests pnpm usage (but Vercel uses npm)
   - May confuse Vercel's package manager detection

3. **Root `/package.json` with no dependencies** - ⚠️ **SYMPTOM**
   - When Vercel uses this, only ~106 packages install
   - This is the file Vercel is currently using

4. **Missing/Incorrect Root Directory Setting** - ⚠️ **LIKELY CAUSE**
   - If not set in Vercel dashboard, defaults to root
   - Must be explicitly set to `apps/web`

---

## ✅ PRECISE FIX PLAN

### Step 1: Set Root Directory in Vercel Dashboard (CRITICAL)

**Action:** Go to Vercel Dashboard → Your Project → Settings → General → Root Directory

**Set to:** `apps/web`

**Why:** This tells Vercel to use `apps/web/` as the project root, making it use `apps/web/package.json` instead of root.

---

### Step 2: Verify `apps/web/vercel.json` Configuration

**Current content (already correct):**
```json
{
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

**Verification:**
- ✅ `installCommand` uses npm (not pnpm)
- ✅ `buildCommand` runs `npm run build` which executes `vite build` from package.json
- ✅ `outputDirectory` is `dist` (correct for Vite)

**No changes needed** - this is already correct.

---

### Step 3: Verify Vite is in Dependencies

**Location:** `apps/web/package.json` line 45

**Current:** `"vite": "^5.4.1"` ✅ **CONFIRMED IN DEPENDENCIES**

**Also confirmed:** `"@vitejs/plugin-react": "^4.3.1"` in dependencies (line 46)

**No changes needed** - vite is correctly in dependencies.

---

### Step 4: Verify package-lock.json is Committed

**Location:** `apps/web/package-lock.json`

**Status:** ✅ Present (4709 lines, includes vite)

**Action:** Ensure this file is committed to git. If not, commit it.

---

### Step 5: Alternative Fix (If Root Directory Can't Be Set)

**If Vercel dashboard doesn't allow Root Directory setting, move `vercel.json` to root:**

**Delete:** `apps/web/vercel.json`

**Create:** `/vercel.json` with:
```json
{
  "installCommand": "cd apps/web && npm install --legacy-peer-deps",
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/dist"
}
```

**Note:** This is a fallback. Setting Root Directory is the preferred solution.

---

## 🎛️ STEPS THAT MUST BE DONE IN VERCEL DASHBOARD

### 1. Root Directory Setting (REQUIRED)

**Path:** Vercel Dashboard → Your Project → Settings → General → Root Directory

**Value:** `apps/web`

**Why Critical:** Without this, Vercel defaults to repository root and uses root `package.json` (which has no dependencies).

---

### 2. Environment Variables (Required for App to Work)

**Path:** Vercel Dashboard → Your Project → Settings → Environment Variables

**Required Variables:**
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

**Optional Variables:**
- `VITE_API_URL` - Your backend API URL (defaults to localhost if not set)
- `VITE_API_ENV` - Environment (defaults to 'dev')
- `VITE_ADMIN_USER_ID` - Admin user ID (optional)

---

## 📋 FINAL "DO THESE 5 STEPS" CHECKLIST

### ✅ Step 1: Set Vercel Root Directory
- [ ] Go to Vercel Dashboard → Project Settings → General
- [ ] Find "Root Directory" setting
- [ ] Set to: `apps/web`
- [ ] Save changes

### ✅ Step 2: Verify vercel.json Location
- [ ] Confirm `apps/web/vercel.json` exists
- [ ] Verify content matches:
  ```json
  {
    "installCommand": "npm install --legacy-peer-deps",
    "buildCommand": "npm run build",
    "outputDirectory": "dist"
  }
  ```

### ✅ Step 3: Verify package-lock.json is Committed
- [ ] Check `apps/web/package-lock.json` exists in git
- [ ] If not committed: `git add apps/web/package-lock.json && git commit -m "Add package-lock.json"`

### ✅ Step 4: Verify Vite in Dependencies
- [ ] Open `apps/web/package.json`
- [ ] Confirm line 45 has: `"vite": "^5.4.1"`
- [ ] Confirm line 46 has: `"@vitejs/plugin-react": "^4.3.1"`

### ✅ Step 5: Set Environment Variables
- [ ] Go to Vercel Dashboard → Project Settings → Environment Variables
- [ ] Add `VITE_SUPABASE_URL`
- [ ] Add `VITE_SUPABASE_ANON_KEY`
- [ ] (Optional) Add `VITE_API_URL` for production backend

---

## 🎯 EXPECTED OUTCOME

After completing these steps:

1. **Vercel will:**
   - Use `apps/web/` as root directory
   - Read `apps/web/package.json` (not root)
   - Install all 47+ dependencies including vite
   - Run `npm run build` which executes `vite build`
   - Output to `apps/web/dist/`

2. **Install will show:**
   - ~200+ packages (not 106)
   - Vite and all dependencies installed
   - Build succeeds

3. **Build log will show:**
   ```
   > web@0.1.0 build
   > vite build
   [successful build output]
   ```

---

## 🔧 TROUBLESHOOTING

**If still installing 106 packages after Step 1:**
- Verify Root Directory is saved in Vercel dashboard
- Check that `apps/web/vercel.json` exists
- Try redeploying (Vercel may cache old settings)

**If build fails with "vite: command not found":**
- Verify `apps/web/package-lock.json` includes vite
- Check that Root Directory is set to `apps/web`
- Verify `vite` is in `dependencies` (not `devDependencies`)

**If Vercel still uses root:**
- Move `vercel.json` to root with `cd apps/web` commands (Step 5 alternative)

---

## 📊 SUMMARY

**Root Cause:** Vercel detects monorepo structure (`pnpm-workspace.yaml` at root) and defaults to root directory, using root `package.json` which has no dependencies.

**Primary Fix:** Set Root Directory to `apps/web` in Vercel dashboard.

**Secondary Fix:** If Root Directory can't be set, move `vercel.json` to root with explicit `cd apps/web` commands.

**Confidence Level:** 95% - Setting Root Directory should resolve the issue.


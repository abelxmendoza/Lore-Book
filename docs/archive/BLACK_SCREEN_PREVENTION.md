# Black Screen Prevention System

This document describes the comprehensive safeguards we've implemented to prevent black screen issues in production.

## 🛡️ Prevention Layers

### 1. Build-Time Validation

#### Chunk Dependency Check (`scripts/chunk-dependency-check.js`)
- **Purpose**: Prevents React-dependent chunks from being split incorrectly
- **Checks**:
  - No `ui-vendor`, `editor-vendor`, `visualization-vendor` chunks
  - No `route-*` chunks
  - No component chunks (`chat-components`, `character-components`, etc.)
  - Main bundle contains React and all React-dependent code
- **Runs**: Automatically after every build (`postbuild` hook)

#### Build Validation (`scripts/build-validation.test.js`)
- **Purpose**: Validates build output structure
- **Checks**:
  - `dist` directory exists
  - `index.html` exists and references built assets
  - No source file references (`/src/main.tsx`)
  - Assets directory contains JavaScript bundles
- **Runs**: After build, before deployment

### 2. Runtime Detection

#### Inline Boot Test (`index.html`)
- **Purpose**: Detects if JavaScript bundle executes
- **Implementation**: Creates DOM marker and localStorage log before module loads
- **Detection**: If marker missing after 5 seconds, shows diagnostic banner

#### Global Error Handlers (`main.tsx`)
- **Purpose**: Catches and displays errors instead of black screen
- **Features**:
  - Global `error` event listener
  - Global `unhandledrejection` handler
  - Visibility and height checks
  - Error display on page

### 3. E2E Testing

#### Production Build Tests (`e2e/production-build.spec.ts`)
- **Purpose**: Verifies production build loads correctly
- **Tests**:
  - Main bundle loads without errors
  - Boot test executes
  - Root element renders with content
  - No `React.forwardRef` errors
  - No unhandled promise rejections
  - Content appears within 5 seconds
- **Runs**: In CI/CD before deployment

### 4. CI/CD Integration

#### Production Build Verification Workflow (`.github/workflows/production-build-verification.yml`)
- **Triggers**: 
  - Push to `main`
  - Pull requests
  - Manual dispatch
- **Steps**:
  1. Run unit tests
  2. Run black screen prevention tests
  3. Build production bundle
  4. Validate build output
  5. Check chunk dependencies
  6. Verify no forbidden chunks
  7. Run E2E production build tests
- **Blocks**: Deployment if any check fails

### 5. Security Checks

#### Security Headers Validation (`scripts/security-headers-check.js`)
- **Purpose**: Ensures production has proper security headers
- **Checks**:
  - Content-Security-Policy
  - X-Content-Type-Options
  - X-Frame-Options
  - Strict-Transport-Security
  - X-XSS-Protection
  - Referrer-Policy
- **Runs**: Optional (set `CHECK_SECURITY_HEADERS=true`)

## 📋 Pre-Deployment Checklist

Before deploying, run:

```bash
cd apps/web
npm run test:pre-deploy
```

This runs:
1. ✅ Unit tests
2. ✅ Black screen prevention tests
3. ✅ Production build
4. ✅ Build validation
5. ✅ Chunk dependency check

## 🔍 Manual Verification

### Check Build Output
```bash
cd apps/web
npm run build
npm run test:chunk-deps
```

### Verify No Forbidden Chunks
```bash
# Should return nothing
ls dist/assets/ui-vendor-*.js
ls dist/assets/editor-vendor-*.js
ls dist/assets/route-*.js
```

### Test Production Build Locally
```bash
npm run build
npm run preview
# Open http://localhost:4173
# Check browser console for errors
```

## 🚨 What Each Check Prevents

| Check | Prevents |
|-------|----------|
| Chunk dependency check | `React.forwardRef is undefined` errors |
| Build validation | Missing or incorrect build output |
| Boot test | Silent bundle execution failures |
| Error handlers | Black screen from uncaught errors |
| E2E tests | Runtime errors in production build |
| CI/CD workflow | Deploying broken builds |

## 📊 Monitoring

### Health Check Endpoint
- **URL**: `/api/diagnostics`
- **Purpose**: Verify server is running and configured correctly
- **Response**: Non-sensitive diagnostic information

### Browser Console
Check for:
- `[BOOT] main.tsx executing` - Bundle executed
- `[Main] React app mounted successfully` - React mounted
- Any `[GLOBAL ERROR]` messages
- Any `[VISIBILITY ERROR]` messages

### localStorage Debug Keys
- `lorekeeper_debug_boot` - Bundle execution
- `lorekeeper_debug_error` - JavaScript errors
- `lorekeeper_debug_rejection` - Unhandled rejections
- `lorekeeper_debug_mount` - React mounting

## 🔧 Configuration

### Vite Config (`vite.config.ts`)
- React stays in main bundle (never split)
- React-dependent libraries merged into main bundle
- Only non-React chunks split (`supabase-vendor`, `monitoring-vendor`)

### Package.json Scripts
- `test:pre-deploy` - Full pre-deployment check
- `test:chunk-deps` - Chunk dependency validation
- `test:e2e:production` - Production build E2E tests

## 📝 Best Practices

1. **Never split React-dependent code** - Keep in main bundle
2. **Always run pre-deploy checks** - Before pushing to main
3. **Monitor CI/CD results** - Don't merge if checks fail
4. **Test production builds locally** - Use `npm run preview`
5. **Check browser console** - Look for boot markers and errors

## 🐛 Troubleshooting

### Black Screen Still Appears

1. **Check browser console**:
   - Look for `[BOOT]` message
   - Check for JavaScript errors
   - Verify bundle loaded (Network tab)

2. **Check localStorage**:
   - Open DevTools → Application → Local Storage
   - Look for `lorekeeper_debug_*` keys
   - Check values for error information

3. **Verify build**:
   ```bash
   npm run build
   npm run test:chunk-deps
   ```

4. **Check CI/CD logs**:
   - Verify all checks passed
   - Look for warnings or errors

5. **Test locally**:
   ```bash
   npm run build
   npm run preview
   ```

## ✅ Success Criteria

A successful deployment should:
- ✅ Pass all CI/CD checks
- ✅ Show `[BOOT]` message in console
- ✅ Render content within 5 seconds
- ✅ Have no `React.forwardRef` errors
- ✅ Have no unhandled rejections
- ✅ Display diagnostic banner if issues detected

## 🔗 Related Files

- `apps/web/vite.config.ts` - Build configuration
- `apps/web/scripts/chunk-dependency-check.js` - Chunk validation
- `apps/web/scripts/post-build-validation.js` - Build validation
- `apps/web/e2e/production-build.spec.ts` - E2E tests
- `.github/workflows/production-build-verification.yml` - CI/CD workflow
- `apps/web/index.html` - Boot test and error handlers
- `apps/web/src/main.tsx` - Error handling and monitoring

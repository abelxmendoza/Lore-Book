# Black Screen Prevention Tests

This document describes the tests we've added to prevent black screens on Vercel deployment.

## Test Categories

### 1. App Integration Tests (`src/App.integration.test.tsx`)
Tests that the main App component:
- ✅ Renders without crashing
- ✅ Shows main content area
- ✅ Handles missing environment variables gracefully
- ✅ Catches errors via ErrorBoundary
- ✅ Renders without requiring authentication

### 2. Router Integration Tests (`src/pages/Router.integration.test.tsx`)
Tests that routing:
- ✅ Works for all routes (/, /chat, /timeline, etc.)
- ✅ Handles 404 routes gracefully
- ✅ Shows error UI instead of black screen on route errors

### 3. AuthGate Integration Tests (`src/components/AuthGate.integration.test.tsx`)
Tests that authentication gate:
- ✅ Shows loading state instead of black screen
- ✅ Times out after 5 seconds to prevent infinite loading
- ✅ Shows auth screen when not authenticated
- ✅ Renders children when authenticated
- ✅ Handles Supabase errors gracefully
- ✅ Always renders something visible, never null

### 4. Environment Configuration Tests (`src/config/env.test.ts`)
Tests that configuration:
- ✅ Has valid API URL
- ✅ Handles missing Supabase URL gracefully
- ✅ Has valid environment mode
- ✅ Has timeout configuration
- ✅ Doesn't throw when accessing properties

### 5. Main Entry Point Tests (`src/main.integration.test.tsx`)
Tests that the entry point:
- ✅ Has root element in DOM
- ✅ Handles missing root element gracefully
- ✅ Validates environment variables are accessible
- ✅ Handles module import errors gracefully
- ✅ Validates React and DOM APIs are available

### 6. Build Validation Tests (`scripts/build-validation.test.js`)
Tests that the build output:
- ✅ Has dist directory
- ✅ Has index.html
- ✅ index.html contains root div
- ✅ References built assets, not source files
- ✅ Has assets directory with JS/CSS files
- ✅ Has reasonable build size

## Running Tests

### Run all black screen prevention tests:
```bash
npm run test:black-screen
```

### Run build validation (after build):
```bash
npm run build
npm run test:build
```

### Run pre-deployment checks:
```bash
npm run test:pre-deploy
```

This runs:
1. Unit tests
2. Black screen prevention tests
3. Build
4. Build validation

## What These Tests Prevent

1. **Missing root element** - Tests ensure root div exists
2. **Build errors** - Tests verify build output is valid
3. **Infinite loading** - Tests verify AuthGate times out
4. **Missing error boundaries** - Tests verify errors are caught
5. **Environment variable issues** - Tests verify config doesn't crash
6. **Route errors** - Tests verify routing works
7. **Module import errors** - Tests verify imports don't crash
8. **Black screens** - All tests ensure something visible is rendered

## CI/CD Integration

These tests should run:
- ✅ Before deployment (pre-deploy hook)
- ✅ In CI/CD pipeline
- ✅ After build (build validation)

Add to your CI/CD:
```yaml
- name: Run black screen prevention tests
  run: npm run test:black-screen

- name: Build
  run: npm run build

- name: Validate build
  run: npm run test:build
```

## Common Black Screen Causes (Now Tested)

| Cause | Test Coverage |
|-------|--------------|
| Missing root element | ✅ main.integration.test.tsx |
| Build errors | ✅ build-validation.test.js |
| Infinite loading | ✅ AuthGate.integration.test.tsx |
| Missing error boundaries | ✅ App.integration.test.tsx |
| Environment variable issues | ✅ env.test.ts |
| Route errors | ✅ Router.integration.test.tsx |
| Module import errors | ✅ main.integration.test.tsx |
| Auth blocking | ✅ AuthGate.integration.test.tsx |

## Next Steps

If tests pass but you still see black screens:

1. Check browser console for runtime errors
2. Check network tab for failed requests
3. Verify environment variables in Vercel dashboard
4. Check Vercel build logs
5. Test locally with production build: `npm run build && npm run preview`


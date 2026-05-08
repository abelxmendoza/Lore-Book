# CI/CD Pipeline Setup

## Overview

Complete CI/CD pipeline for Lore Keeper with automated testing, building, and deployment.

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` or `develop`
- Pull requests to `main` or `develop`

**Jobs:**
1. **Lint and Test**
   - ESLint validation
   - Unit tests with coverage
   - Coverage upload to Codecov

2. **E2E Tests (Playwright)**
   - Cross-browser testing
   - Test report upload

3. **E2E Tests (Cypress)**
   - Interactive E2E testing
   - Screenshot/video upload on failure

4. **Integration Tests**
   - Component integration tests
   - Coverage reporting

5. **Build**
   - Production build verification
   - Build artifact upload

6. **Security Scan**
   - npm audit
   - Trivy vulnerability scanning

### 2. Full CI/CD Pipeline (`.github/workflows/full-ci.yml`)

**Comprehensive pipeline with:**
- Lint & Format check
- Unit tests
- Integration tests
- Build verification
- E2E tests (Playwright)
- E2E tests (Cypress)
- Security scanning
- Automatic deployment to Vercel (main branch only)

### 3. Deploy Workflow (`.github/workflows/deploy.yml`)

**Triggers:**
- Push to `main`
- Manual workflow dispatch

**Actions:**
- Deploys to Vercel production

## Test Execution

### Local Testing
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E - Playwright
npm run test:e2e

# E2E - Cypress
npm run test:cypress

# All tests
npm run test:all
```

### CI Testing
All tests run automatically on:
- Every push to `main` or `develop`
- Every pull request
- Manual workflow dispatch

## Deployment

### Automatic Deployment
- **Trigger**: Push to `main` branch
- **Platform**: Vercel
- **Environment**: Production

### Manual Deployment
```bash
# Via GitHub Actions
- Go to Actions → Deploy workflow → Run workflow

# Via Vercel CLI
vercel --prod
```

## Required Secrets

Set these in GitHub repository settings:

- `VERCEL_TOKEN` - Vercel authentication token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

## Environment Variables

### Build Time
- `VITE_USE_MOCK_DATA` - Enable mock data (default: true)
- `VITE_SHOW_DEV_NOTICE` - Show dev notice (default: true)
- `VITE_SUPABASE_URL` - Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

### Runtime
Set in Vercel dashboard:
- All `VITE_*` variables
- Any other required environment variables

## Pipeline Stages

1. **Lint** → Code quality check
2. **Unit Tests** → Fast feedback on code changes
3. **Integration Tests** → Component interaction verification
4. **Build** → Production build verification
5. **E2E Tests** → End-to-end user flow testing
6. **Security** → Vulnerability scanning
7. **Deploy** → Automatic production deployment

## Test Coverage Goals

- **Lines**: 60%
- **Functions**: 60%
- **Branches**: 50%
- **Statements**: 60%

## Status Badges

Add to README.md:
```markdown
![CI](https://github.com/your-org/lorekeeper/workflows/CI/badge.svg)
![Tests](https://github.com/your-org/lorekeeper/workflows/CI/badge.svg?branch=main)
```

## Troubleshooting

### Tests Failing in CI
1. Check test logs in GitHub Actions
2. Verify environment variables are set
3. Check for timing issues (increase timeouts)
4. Verify mocks are working correctly

### Build Failing
1. Check build logs
2. Verify Node version (should be 20.x)
3. Check for dependency issues
4. Verify environment variables

### Deployment Failing
1. Check Vercel deployment logs
2. Verify secrets are set correctly
3. Check Vercel project configuration
4. Verify build output directory

## Best Practices

1. **Always run tests locally before pushing**
2. **Keep test coverage above 60%**
3. **Fix failing tests immediately**
4. **Use meaningful commit messages**
5. **Review CI logs for any warnings**

## Next Steps

1. Set up Vercel secrets in GitHub
2. Configure Codecov (optional)
3. Add status badges to README
4. Set up branch protection rules
5. Configure deployment previews

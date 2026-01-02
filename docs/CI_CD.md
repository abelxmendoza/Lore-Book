# CI/CD Documentation

## Overview

This document consolidates all CI/CD pipeline information including setup, code quality checks, and workflow configuration.

## CI/CD Pipeline

### Main CI Pipeline (`.github/workflows/ci.yml`)

The main pipeline runs on every push/PR and includes:

1. **Lint** - Code quality checks (includes duplicate detection)
2. **Code Quality** - Dedicated quality checks
   - Duplicate import detection
   - Unused code analysis
   - Import order verification
3. **Test Server** - All server tests including security middleware
4. **Test Web** - Frontend unit tests
5. **E2E Tests** - End-to-end tests including security E2E
6. **Security Tests** - Dedicated security test suite
7. **Build** - Application builds
8. **Summary** - Test results summary (includes code quality)

### Security Tests Workflow (`.github/workflows/security-tests.yml`)

Standalone workflow for security-specific changes:
- Runs on security-related file changes
- Scheduled daily at 2 AM UTC
- Can be triggered manually via `workflow_dispatch`

### Code Quality Workflow (`.github/workflows/code-quality.yml`)

Standalone code quality checks:
- **Triggers**:
  - Push/PR to main/develop
  - Weekly schedule (Sunday 2 AM UTC)
  - Manual dispatch
- **Jobs**:
  1. **lint-check**: Comprehensive linting and duplicate detection
  2. **unused-code-check**: Unused code analysis
  3. **summary**: Quality check summary

## CI/CD Flow

```
┌─────────────────┐
│   Push / PR     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Lint Code     │◄─── Includes duplicate detection
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Code Quality    │◄─── Duplicate & unused checks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Test Server    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Test Web      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   E2E Tests     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Security Tests  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build Apps     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  All Tests      │
│    Summary      │◄─── Includes code quality status
└─────────────────┘
```

## What Runs When

### On Every Push/PR
1. **Lint** - Code quality checks (includes duplicate detection)
2. **Code Quality** - Dedicated quality checks
3. **Test Server** - All server tests
4. **Test Web** - Frontend unit tests
5. **E2E Tests** - End-to-end tests
6. **Security Tests** - Security test suite
7. **Build** - Application builds
8. **Summary** - Test results summary

### On Security File Changes
The `security-tests.yml` workflow runs when:
- Middleware files change (`apps/server/src/middleware/**`)
- Encryption service changes
- Privacy routes change
- Security test files change
- Security UI components change

### Scheduled Runs
- **Daily at 2 AM UTC** - Security tests run automatically
- **Sunday 2 AM UTC** - Code quality checks run automatically
- **Weekly** - CodeQL analysis runs on Sundays

## Code Quality Checks

### Duplicate Import Detection ✅
- **Method**: ESLint rule `import/no-duplicates`
- **Status**: Enforced in CI
- **Action**: Fails build if duplicates found
- **Location**: Both server and web apps

### Import Order Enforcement ✅
- **Method**: ESLint rule `import/order`
- **Status**: Enforced in CI
- **Action**: Warns on incorrect order
- **Location**: Both server and web apps

### Unused Code Detection ✅
- **Method**: Custom script `find-unused-code.js`
- **Status**: Informational (non-blocking)
- **Action**: Reports potentially unused exports
- **Location**: Server app
- **Note**: Always verify manually before removing

## Test Coverage in CI

### Backend Security Tests
- ✅ CSRF Protection (13 tests)
- ✅ Rate Limiting (6 tests)
- ✅ Request Validation (12 tests)
- ✅ Secure Headers (8 tests)
- ✅ Privacy API Integration (8 tests)

### Frontend Security Tests
- ✅ Security E2E Tests (12+ tests)
- ✅ Privacy Settings UI flows
- ✅ CSRF token verification
- ✅ XSS protection
- ✅ Accessibility checks

## Running Tests Locally

### Before Pushing
```bash
# Run all security tests
cd apps/server
pnpm test middleware/ integration/privacy.test.ts

# Run E2E security tests
cd apps/web
pnpm test:e2e security.spec.ts
```

### Quick Check
```bash
# From root
pnpm --filter server test middleware/
pnpm --filter server test integration/privacy.test.ts
pnpm --filter web test:e2e security.spec.ts
```

## CI/CD Features

### Artifacts
- Test results uploaded on failure
- Playwright reports for E2E tests
- Coverage reports (if configured)

### Notifications
- GitHub Actions status checks
- PR status badges
- Test summary in workflow summary

### Performance
- Parallel test execution
- Cached dependencies (pnpm)
- Fast test execution (< 1 min)

## Configuration

### Environment Variables
Set in GitHub Secrets (if needed):
- `SUPABASE_TEST_URL` - For E2E tests
- `SUPABASE_TEST_ANON_KEY` - For E2E tests
- `OPENAI_API_KEY` - For AI tests (optional)

### Node.js Version
- Uses Node.js 20 (from `.nvmrc`)
- pnpm version 8

## Workflow Triggers

### Automatic
- Push to `main` or `develop`
- Pull requests to `main` or `develop`
- Daily schedule (security tests)
- Weekly schedule (CodeQL, code quality)

### Manual
- `workflow_dispatch` - Run workflows manually
- Available in GitHub Actions UI

## Status Checks

The CI pipeline creates these status checks:
- ✅ Lint
- ✅ Code Quality
- ✅ Test Server
- ✅ Test Web
- ✅ E2E Tests
- ✅ Security Tests
- ✅ Build

All must pass before merging PRs.

## Benefits

1. **Automated Testing** - Tests run on every push
2. **Early Detection** - Catch security issues before merge
3. **Consistent Environment** - Same test environment as CI
4. **Fast Feedback** - Results in minutes
5. **Comprehensive Coverage** - All security features tested
6. **Documentation** - Test results visible in PRs
7. **Code Quality** - Duplicate and unused code detection

## Monitoring

### GitHub Actions
- View runs: `https://github.com/[owner]/[repo]/actions`
- View specific workflow: `Actions` → Workflow name
- View test results: Click on any workflow run

### Status Badges
Add to README:
```markdown
![Security Tests](https://github.com/[owner]/[repo]/workflows/Security%20Tests/badge.svg)
![CI](https://github.com/[owner]/[repo]/workflows/CI/badge.svg)
![Code Quality](https://github.com/[owner]/[repo]/workflows/Code%20Quality%20Checks/badge.svg)
```

## Related Documentation

- `TESTING.md` - Testing documentation
- `SECURITY_TESTING.md` - Security test details
- `.github/workflows/ci.yml` - Main CI workflow
- `.github/workflows/security-tests.yml` - Security workflow
- `.github/workflows/code-quality.yml` - Code quality workflow


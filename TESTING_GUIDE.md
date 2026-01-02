# Security Testing Guide

## Quick Start

### 1. Prerequisites

**Node.js 18+ Required**

```bash
# Check version
node --version

# Upgrade if needed (using nvm)
nvm install 18
nvm use 18
```

### 2. Install Dependencies

```bash
# Backend
cd apps/server
npm install

# Frontend
cd apps/web
npm install
```

### 3. Run Tests

#### Backend Unit Tests

```bash
cd apps/server

# All middleware tests
npm test middleware/

# Specific test
npm test middleware/csrf.test.ts

# With coverage
npm test -- --coverage
```

#### Backend Integration Tests

```bash
cd apps/server

# Privacy API tests
npm test integration/privacy.test.ts
```

#### Frontend E2E Tests

```bash
# Terminal 1: Start backend
cd apps/server
npm run dev

# Terminal 2: Start frontend
cd apps/web
npm run dev

# Terminal 3: Run E2E tests
cd apps/web
npm run test:e2e security.spec.ts
```

## Test Files Created

### Backend Tests

1. **`apps/server/tests/middleware/csrf.test.ts`**
   - CSRF token generation
   - Token validation
   - Development bypass
   - 12+ test cases

2. **`apps/server/tests/middleware/rateLimit.test.ts`**
   - Rate limit enforcement
   - Development vs production
   - Per-client tracking
   - 7+ test cases

3. **`apps/server/tests/middleware/requestValidation.test.ts`**
   - Request size limits
   - XSS pattern detection
   - Nested validation
   - 10+ test cases

4. **`apps/server/tests/middleware/secureHeaders.test.ts`**
   - Security headers
   - CSP nonce generation
   - Development HMR
   - 8+ test cases

5. **`apps/server/tests/integration/privacy.test.ts`**
   - Privacy API endpoints
   - Settings CRUD
   - Data export
   - Account deletion
   - 8+ test cases

### Frontend E2E Tests

1. **`apps/web/e2e/security.spec.ts`**
   - Privacy settings flows
   - CSRF protection
   - Rate limiting
   - XSS protection
   - Accessibility
   - 12+ test cases

## Test Coverage Summary

| Category | Test Files | Test Cases | Status |
|----------|-----------|------------|--------|
| CSRF Middleware | 1 | 12+ | ✅ Complete |
| Rate Limiting | 1 | 7+ | ✅ Complete |
| Request Validation | 1 | 10+ | ✅ Complete |
| Secure Headers | 1 | 8+ | ✅ Complete |
| Privacy API | 1 | 8+ | ✅ Complete |
| E2E Security | 1 | 12+ | ✅ Complete |
| **Total** | **6** | **57+** | ✅ **Complete** |

## Running Specific Test Suites

### CSRF Tests Only
```bash
cd apps/server
npm test middleware/csrf.test.ts
```

### Rate Limiting Tests Only
```bash
cd apps/server
npm test middleware/rateLimit.test.ts
```

### All Middleware Tests
```bash
cd apps/server
npm test middleware/
```

### Privacy API Tests
```bash
cd apps/server
npm test integration/privacy.test.ts
```

### E2E Security Tests
```bash
cd apps/web
npm run test:e2e security.spec.ts
```

## Debugging Tests

### Backend Tests

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Run specific test
npm test -- middleware/csrf.test.ts -t "should generate"

# Watch mode
npm test -- --watch
```

### E2E Tests

```bash
# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run with debug mode
PWDEBUG=1 npm run test:e2e

# Run specific test
npm run test:e2e -- --grep "Privacy Settings"

# Generate trace
npm run test:e2e -- --trace on
```

## Test Environment Setup

### Environment Variables

Tests use mocks and don't require real credentials, but you can set:

```bash
# For integration tests
export NODE_ENV=test
export SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=test-anon-key
export SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
```

### Mocking

All tests use mocks for:
- Supabase client
- Security logging
- External services
- Express Request/Response

## Continuous Integration

### GitHub Actions Example

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: cd apps/server && npm test
      - run: cd apps/web && npm run test:e2e
```

## Test Maintenance

### Adding New Tests

1. Follow existing patterns
2. Mock external dependencies
3. Test both dev and prod modes
4. Include edge cases
5. Update this guide

### Test Best Practices

- ✅ One assertion per test (when possible)
- ✅ Descriptive test names
- ✅ Setup/teardown in beforeEach/afterEach
- ✅ Isolated tests (no shared state)
- ✅ Fast execution (use mocks)

## Troubleshooting

### Node Version Issues

If you see `stripVTControlCharacters` error:
```bash
# Upgrade Node.js to 18+
nvm install 18
nvm use 18
```

### E2E Tests Failing

1. Ensure servers are running
2. Check port conflicts
3. Verify test selectors match UI
4. Run with `--headed` to see what's happening

### Mock Issues

If mocks aren't working:
1. Check import order (mocks before imports)
2. Verify mock paths match actual paths
3. Clear vitest cache: `rm -rf node_modules/.vite`

## Next Steps

1. ✅ All tests created
2. ⏳ Upgrade Node.js to 18+
3. ⏳ Run tests to verify
4. ⏳ Add to CI/CD pipeline
5. ⏳ Set up coverage reporting
6. ⏳ Add performance benchmarks

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)


# Security Test Suite

## Overview

Comprehensive test suite for security middleware and privacy API endpoints.

## Test Structure

### Unit Tests (`tests/middleware/`)

- **`csrf.test.ts`** - CSRF protection middleware
  - Token generation
  - Development mode bypass
  - Token validation
  - Header and cookie support

- **`rateLimit.test.ts`** - Rate limiting middleware
  - Request counting
  - Development vs production limits
  - Per-client tracking
  - Retry-after headers

- **`requestValidation.test.ts`** - Request validation middleware
  - Size limit validation
  - XSS pattern detection
  - Development mode bypass
  - Nested object validation

- **`secureHeaders.test.ts`** - Secure headers middleware
  - CSP header generation
  - Nonce generation
  - Development HMR support
  - Security header verification

### Integration Tests (`tests/integration/`)

- **`privacy.test.ts`** - Privacy API endpoints
  - GET /settings - Fetch privacy settings
  - PUT /settings - Update privacy settings
  - POST /export - Data export (GDPR)
  - DELETE /delete-account - Account deletion

## Running Tests

```bash
# Run all tests
cd apps/server
npm test

# Run specific test file
npm test csrf.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Test Coverage Goals

- **Unit Tests**: >90% coverage for middleware
- **Integration Tests**: All API endpoints covered
- **E2E Tests**: Critical user flows

## Environment Variables

Tests use mock data and don't require real database connections. Set these for integration tests:

```bash
NODE_ENV=test
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
```

## Writing New Tests

1. Follow existing test patterns
2. Mock external dependencies (Supabase, etc.)
3. Test both development and production modes
4. Include edge cases and error scenarios
5. Use descriptive test names

## Test Best Practices

- Use `beforeEach` to reset mocks
- Clean up after tests with `afterEach`
- Test both success and failure paths
- Verify error messages and status codes
- Test development mode bypasses


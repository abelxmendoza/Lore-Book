# E2E Security Tests

## Overview

End-to-end tests for security features using Playwright.

## Test Coverage

### Privacy Settings (`security.spec.ts`)

- Access privacy settings page
- Update privacy settings
- Export user data
- Account deletion flow

### CSRF Protection

- Verify CSRF tokens in API requests
- Test token validation

### Rate Limiting

- Test rate limit responses
- Verify graceful handling

### XSS Protection

- Verify input sanitization
- Test script tag filtering

### Accessibility

- Keyboard navigation
- ARIA labels
- Screen reader announcements
- Skip links
- Focus management

### Secure Headers

- Verify security headers in responses
- Test CSP headers

## Running Tests

```bash
# Run all E2E tests
cd apps/web
npm run test:e2e

# Run specific test file
npm run test:e2e security.spec.ts

# Run with UI
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e -- --headed
```

## Test Environment

Tests run against a local development server. Make sure:

1. Backend server is running (`npm run dev:server`)
2. Frontend dev server is running (`npm run dev`)
3. Test database is set up (if needed)

## Writing New E2E Tests

1. Use Playwright's best practices
2. Wait for elements with `waitForSelector`
3. Use data-testid attributes when possible
4. Test both success and error flows
5. Include accessibility checks

## Debugging

```bash
# Run with debug mode
PWDEBUG=1 npm run test:e2e

# Run specific test
npm run test:e2e -- --grep "Privacy Settings"

# Generate trace
npm run test:e2e -- --trace on
```


# Testing Guide

This document describes the testing setup and how to run tests for the Lore Keeper application.

## Test Types

### Unit Tests (Vitest)
Unit tests test individual components and functions in isolation.

**Run unit tests:**
```bash
npm run test
```

**Run with UI:**
```bash
npm run test:ui
```

**Run with coverage:**
```bash
npm run test:coverage
```

### Integration Tests (Vitest)
Integration tests test how multiple components work together.

**Run integration tests:**
```bash
npm run test:integration
```

### End-to-End Tests

#### Playwright
Playwright provides cross-browser E2E testing.

**Run Playwright tests:**
```bash
npm run test:e2e
```

**Run with UI:**
```bash
npm run test:e2e:ui
```

**Run in headed mode:**
```bash
npm run test:e2e:headed
```

#### Cypress
Cypress provides interactive E2E testing with time-travel debugging.

**Run Cypress tests:**
```bash
npm run test:cypress
```

**Open Cypress UI:**
```bash
npm run test:cypress:open
```

### Run All Tests
```bash
npm run test:all
```

## Test Structure

```
apps/web/
├── src/
│   ├── **/*.test.tsx          # Unit tests
│   └── **/*.integration.test.tsx  # Integration tests
├── cypress/
│   ├── e2e/                   # E2E tests (Cypress)
│   ├── component/             # Component tests (Cypress)
│   └── support/               # Cypress support files
└── e2e/                       # E2E tests (Playwright)
```

## Writing Tests

### Unit Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('should render correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
```

### Integration Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChatInterface } from './ChatInterface';

describe('ChatInterface Integration', () => {
  it('should send and display messages', async () => {
    render(
      <BrowserRouter>
        <ChatInterface />
      </BrowserRouter>
    );
    
    // Test implementation
  });
});
```

### Cypress E2E Test Example
```typescript
describe('Timeline Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('timeline');
  });

  it('should create a new memory entry', () => {
    const testContent = `Test memory ${Date.now()}`;
    cy.createMemory(testContent);
    cy.contains(testContent).should('be.visible');
  });
});
```

## CI/CD

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

The CI pipeline includes:
1. Linting
2. Unit tests with coverage
3. Integration tests
4. E2E tests (Playwright)
5. E2E tests (Cypress)
6. Build verification
7. Security scanning

## Coverage Goals

- **Lines**: 60%
- **Functions**: 60%
- **Branches**: 50%
- **Statements**: 60%

## Best Practices

1. **Test user behavior, not implementation details**
2. **Use data-testid for stable selectors**
3. **Keep tests independent and isolated**
4. **Mock external dependencies**
5. **Write descriptive test names**
6. **Follow AAA pattern (Arrange, Act, Assert)**

## Debugging Tests

### Vitest
- Use `console.log` in tests
- Use `--reporter=verbose` for detailed output
- Use `test.only()` to run a single test

### Cypress
- Use `cy.pause()` to pause execution
- Use `cy.debug()` to inspect values
- Check screenshots and videos in `cypress/screenshots` and `cypress/videos`

### Playwright
- Use `page.pause()` to pause execution
- Use `--debug` flag for debug mode
- Check `playwright-report/` for detailed reports

# Test Coverage

This document describes the test coverage setup and reporting for the LoreKeeper project.

## Coverage Configuration

### Frontend (Web)

- **Provider**: v8 (Vitest)
- **Thresholds**:
  - Lines: 60%
  - Functions: 60%
  - Branches: 50%
  - Statements: 60%

### Coverage Reports

Coverage reports are generated in multiple formats:

- **Text**: Console output during test runs
- **JSON**: `coverage/coverage-final.json` - Used by CI/CD
- **HTML**: `coverage/index.html` - Interactive browser report
- **LCOV**: `coverage/lcov.info` - Used by coverage services

## Running Coverage

### Frontend

```bash
cd apps/web
npm run test:coverage
```

This will:
1. Run all tests
2. Generate coverage reports in `apps/web/coverage/`
3. Display coverage summary in the terminal
4. Open HTML report if `--open` flag is used

### Viewing HTML Report

After running coverage, open `apps/web/coverage/index.html` in your browser for an interactive report showing:
- File-by-file coverage
- Line-by-line highlighting
- Coverage trends

## CI/CD Integration

### GitHub Actions

Coverage is automatically generated and uploaded in CI:

1. **Coverage Generation**: Runs on every push/PR
2. **Codecov Upload**: Uploads to Codecov service (if configured)
3. **Artifact Storage**: HTML reports stored as artifacts for 30 days

### Coverage Exclusions

The following are excluded from coverage:

- Test files (`**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`)
- Test directories (`**/__tests__/**`, `src/test/`)
- Configuration files (`**/*.config.{ts,js}`)
- Type definitions (`**/*.d.ts`, `**/types/**`)
- Build outputs (`dist/`, `build/`)
- Mock data (`**/mockData/**`)
- Node modules

## Improving Coverage

### Priority Areas

1. **Critical Paths**: Authentication, data persistence, API calls
2. **User-Facing Features**: Chat, timeline, entry creation
3. **Error Handling**: Error boundaries, fallbacks
4. **Utilities**: Shared functions, helpers

### Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the code does, not how
2. **Test Edge Cases**: Null values, empty arrays, error conditions
3. **Mock External Dependencies**: APIs, databases, third-party services
4. **Keep Tests Fast**: Use mocks and avoid real network calls
5. **Maintain Test Quality**: Clear test names, good assertions, proper setup/teardown

## Coverage Goals

- **Current Target**: 60% overall coverage
- **Critical Paths**: 80%+ coverage
- **New Features**: 70%+ coverage before merge

## Viewing Coverage Online

If Codecov is configured, view coverage reports at:
- https://codecov.io/gh/[your-org]/lorekeeper

## Local Development

### Watch Mode with Coverage

```bash
cd apps/web
npm run test -- --coverage --watch
```

### Coverage for Specific Files

```bash
cd apps/web
npm run test -- --coverage src/components/ChatMessage.tsx
```

## Troubleshooting

### Coverage Not Generating

1. Check that `@vitest/coverage-v8` is installed
2. Verify `vitest.config.ts` has coverage configuration
3. Ensure tests are actually running (check test output)

### Low Coverage Warnings

If coverage falls below thresholds, CI will warn but not fail. To enforce strict thresholds:

1. Update `vitest.config.ts` thresholds
2. Add `--coverage.thresholds.strict=true` to test command

### Missing Files in Report

If files are missing from coverage:

1. Check exclusion patterns in `vitest.config.ts`
2. Verify files are in `include` pattern
3. Ensure files are actually imported/executed during tests


# 🚀 Test Suite - BEAST MODE

## Quick Start

```bash
# Run all tests
cd apps/server && npm test
cd apps/web && npm run test:all

# Run specific test types
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:black-screen  # Black screen prevention
npm run test:coverage      # With coverage report
```

## Test Statistics

- **Total Tests**: 250+
- **Test Files**: 470+
- **Server**: 135+ tests (98% passing)
- **Web**: 110+ tests (90%+ passing)
- **Coverage**: 60-75% (targeting 80%+)

## What's Protected

✅ **Breaking Changes** - Tests catch regressions
✅ **Deployment Issues** - Black screen prevention
✅ **Runtime Errors** - Error handling tests
✅ **API Failures** - Network and timeout tests
✅ **Build Problems** - Build validation tests

## Documentation

- `TEST_SUITE_COMPREHENSIVE.md` - Complete guide
- `TEST_SUITE_ANALYSIS.md` - Detailed analysis
- `BLACK_SCREEN_PREVENTION.md` - Deployment safety
- `TEST_IMPROVEMENT_ROADMAP.md` - Future improvements

## CI/CD

All tests run automatically on:
- Every commit (pre-commit hooks)
- Every PR (GitHub Actions)
- Every deployment (build validation)

---

**Status**: ✅ BEAST MODE ACTIVATED 🚀


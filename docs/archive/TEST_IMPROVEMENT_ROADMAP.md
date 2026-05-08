# Test Suite Improvement Roadmap

## 🎯 Quick Wins (Do First)

### 1. Fix Immediate Issues
- [x] Fix TimelinePanel import path
- [ ] Run full test suite and document all failures
- [ ] Fix any remaining import/path issues
- [ ] Verify all tests run successfully

### 2. Add Missing Core Tests
Priority order:
1. **omegaChatService.test.ts** - Core chat functionality
2. **useTaskEngine.test.ts** - Task management hook
3. **Character components** - User-facing features
4. **Timeline components** - Core UI feature

### 3. Standardize Test Patterns
- [ ] Create `test-helpers.ts` with common utilities
- [ ] Create `mock-factories.ts` for reusable mocks
- [ ] Document test patterns in `TESTING.md`
- [ ] Add examples for common scenarios

## 🚀 High-Impact Improvements

### 1. Test Coverage Expansion

#### Server Tests (Priority: HIGH)
```typescript
// Missing service tests:
- omegaChatService.test.ts
- timelineManager.test.ts
- truthVerificationService.test.ts
- evolutionService.test.ts

// Missing route tests:
- /api/characters routes
- /api/locations routes
- /api/tasks routes
- /api/timeline routes
- /api/chapters routes
- /api/evolution routes
```

#### Web Tests (Priority: HIGH)
```typescript
// Missing hook tests:
- useTaskEngine.test.ts
- useTimelineHierarchy.test.ts
- useCharacterIndexer.test.ts
- useNotebookEngine.test.ts
- useOrchestratorStream.test.ts

// Missing component tests:
- Character components (CharacterCard, CharacterList, etc.)
- Location components
- Task components
- Chapter components
- Search components
```

### 2. Test Quality Improvements

#### Fix Flaky Tests
- [ ] Identify all flaky tests
- [ ] Add proper waitFor/timeout handling
- [ ] Fix race conditions
- [ ] Add retry logic for known flaky tests

#### Improve Mocks
- [ ] Create mock factories for common patterns
- [ ] Standardize Supabase mocks
- [ ] Standardize API mocks
- [ ] Add edge case mocks

#### Better Test Organization
- [ ] Group related tests
- [ ] Use describe blocks effectively
- [ ] Consistent naming conventions
- [ ] Remove duplicate tests

### 3. Add Missing Test Types

#### Accessibility Tests
```bash
npm install --save-dev @testing-library/jest-dom @axe-core/react
```

```typescript
// Example a11y test:
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('should have no accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### Performance Tests
```typescript
// Example performance test:
it('should render within performance budget', () => {
  const start = performance.now();
  render(<Component />);
  const end = performance.now();
  expect(end - start).toBeLessThan(100); // 100ms budget
});
```

#### Visual Regression Tests
```bash
npm install --save-dev @storybook/test-runner chromatic
```

## 📊 Coverage Goals

### Current vs Target

| Metric | Current | Target | Priority |
|--------|---------|--------|----------|
| Lines | ~60% | 80% | HIGH |
| Functions | ~60% | 80% | HIGH |
| Branches | ~50% | 70% | MEDIUM |
| Statements | ~60% | 80% | HIGH |
| Components | ~40% | 80% | HIGH |
| Hooks | ~30% | 80% | HIGH |
| Services | ~70% | 90% | MEDIUM |
| Routes | ~50% | 80% | HIGH |

## 🛠️ Infrastructure Improvements

### 1. Test Utilities Enhancement

Create comprehensive test utilities:

```typescript
// src/test/utils/test-helpers.ts
export const createMockUser = (overrides?: Partial<User>) => ({
  id: 'test-user',
  email: 'test@example.com',
  ...overrides
});

export const createMockEntry = (overrides?: Partial<JournalEntry>) => ({
  id: 'test-entry',
  content: 'Test content',
  date: new Date().toISOString(),
  tags: [],
  ...overrides
});

// ... more helpers
```

### 2. Mock Factories

```typescript
// src/test/utils/mock-factories.ts
export const createSupabaseMock = () => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  from: vi.fn(),
  // ... more mocks
});

export const createApiMock = (endpoint: string, response: any) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response)
  });
};
```

### 3. Test Data Builders

```typescript
// src/test/utils/test-data-builders.ts
export class EntryBuilder {
  private entry: Partial<JournalEntry> = {};

  withId(id: string) {
    this.entry.id = id;
    return this;
  }

  withContent(content: string) {
    this.entry.content = content;
    return this;
  }

  withTags(tags: string[]) {
    this.entry.tags = tags;
    return this;
  }

  build(): JournalEntry {
    return {
      id: this.entry.id || 'default-id',
      content: this.entry.content || 'Default content',
      date: new Date().toISOString(),
      tags: this.entry.tags || [],
      source: 'manual',
      ...this.entry
    };
  }
}
```

## 📝 Implementation Plan

### Week 1: Foundation
- [ ] Fix all failing tests
- [ ] Add omegaChatService tests
- [ ] Add useTaskEngine tests
- [ ] Create test utilities

### Week 2: Expansion
- [ ] Add missing component tests
- [ ] Add missing hook tests
- [ ] Add missing route tests
- [ ] Improve mock quality

### Week 3: Quality
- [ ] Add accessibility tests
- [ ] Fix flaky tests
- [ ] Standardize test patterns
- [ ] Improve test organization

### Week 4: Advanced
- [ ] Add performance tests
- [ ] Add visual regression tests
- [ ] Optimize test execution
- [ ] Document everything

## 🎓 Best Practices to Follow

### 1. Test Structure
```typescript
describe('ComponentName', () => {
  describe('when condition', () => {
    it('should do something', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### 2. Test Naming
- ✅ Good: `should render loading state when data is fetching`
- ❌ Bad: `test1` or `renders correctly`

### 3. Test Isolation
- Each test should be independent
- No shared state between tests
- Clean up after each test

### 4. Mock Strategy
- Mock external dependencies
- Don't mock what you're testing
- Use factories for complex mocks
- Keep mocks simple and focused

### 5. Assertions
- One concept per test
- Test behavior, not implementation
- Use descriptive assertions
- Test edge cases

## 📈 Metrics to Track

### Test Health
- Pass rate: Target 95%+
- Flaky test rate: Target <5%
- Test execution time: Target <5min
- Coverage: Target 80%+

### Test Quality
- Average test length: Target <50 lines
- Test complexity: Target low
- Test maintainability: Target high
- Test documentation: Target 100%

## 🔄 Continuous Improvement

### Regular Reviews
- Weekly: Review failing tests
- Monthly: Review test coverage
- Quarterly: Review test strategy
- Annually: Major test infrastructure updates

### Feedback Loop
- Track test failures
- Identify patterns
- Improve test quality
- Share learnings

---

**Status**: 🟡 In Progress
**Last Updated**: $(date)
**Next Review**: Weekly


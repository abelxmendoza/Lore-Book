# Love & Relationships Testing Documentation

## Overview

This document describes the testing strategy and implementation for the Love & Relationships feature in Lore Book.

## Test Structure

### Unit Tests

All unit tests are located in `apps/web/src/components/love/__tests__/` and `apps/web/src/mocks/__tests__/`.

#### Component Tests

1. **LoveAndRelationshipsView.test.tsx**
   - Tests main view component
   - Filter functionality (all, active, past, situationships, crushes, rankings)
   - Search functionality
   - Mock data integration
   - Loading and error states

2. **RelationshipCard.test.tsx**
   - Tests relationship card rendering
   - Score display
   - Status badges
   - Click handlers
   - Red/green flags display

3. **RelationshipDetailModal.test.tsx**
   - Tests modal opening/closing
   - Tab navigation (overview, timeline, pros-cons, analytics, chat)
   - Data loading
   - Chat functionality
   - Mock data integration

4. **RankingView.test.tsx**
   - Tests ranking display
   - Category switching (overall, active, compatibility, intensity, health)
   - Badge alignment verification (#1 and #2 alignment)
   - Comparison mode
   - Sorting logic
   - Mock data integration

5. **ProsConsView.test.tsx**
   - Tests pros/cons display
   - Red/green flags display
   - Empty states

6. **RelationshipTimeline.test.tsx**
   - Tests timeline rendering
   - Date event display
   - Chronological sorting
   - Relationship period display

7. **RelationshipAnalytics.test.tsx**
   - Tests analytics display
   - Score visualization
   - Insights and recommendations
   - Trend indicators

#### Mock Data Tests

8. **romanticRelationships.test.ts**
   - Tests mock data generation
   - Filtering functions
   - Ranking functions
   - Analytics generation
   - Date events generation

### Integration Tests

**integration.test.tsx**
- Full user flow: load relationships → filter → open detail → view analytics
- Chat integration with relationship context
- API integration with mock data fallback
- Search functionality
- Filter switching

### E2E Tests

**love-relationships.spec.ts** (Playwright)
- Navigate to Love & Relationships section
- View relationships list
- Filter by category
- Open relationship detail modal
- View rankings
- Test chat functionality within relationship context
- Verify mock data works when enabled
- Verify ranking badge alignment

## Running Tests

### Unit Tests
```bash
cd apps/web
npm run test:unit
```

### Integration Tests
```bash
cd apps/web
npm run test:integration
```

### E2E Tests
```bash
cd apps/web
npm run test:e2e
```

### All Tests
```bash
cd apps/web
npm run test:all
```

### Coverage
```bash
cd apps/web
npm run test:coverage
```

## Test Coverage Goals

- **Components**: 80%+ coverage
- **Mock Data Utilities**: 90%+ coverage
- **Integration Tests**: Cover all main user flows
- **E2E Tests**: Verify end-to-end functionality

## Mock Data

Mock data is provided in `apps/web/src/mocks/romanticRelationships.ts` and includes:
- 6 mock relationships (active, past, situationships, crushes)
- Date events for relationships
- Analytics data
- Rankings data

Mock data is automatically used when:
- Mock data toggle is enabled
- API calls fail and mock data is enabled
- URL parameter `?mockData=true` is set

## CI/CD Integration

All tests are automatically run in CI:
- **Unit tests**: Run on every push/PR via `lint-and-test` job
- **Integration tests**: Run via `test:integration` script
- **E2E tests**: Run via `e2e-tests-playwright` job
- **Coverage**: Uploaded to Codecov

## Test Files Location

```
apps/web/src/
├── components/love/
│   ├── __tests__/
│   │   ├── LoveAndRelationshipsView.test.tsx
│   │   ├── RelationshipCard.test.tsx
│   │   ├── RelationshipDetailModal.test.tsx
│   │   ├── RankingView.test.tsx
│   │   ├── ProsConsView.test.tsx
│   │   ├── RelationshipTimeline.test.tsx
│   │   ├── RelationshipAnalytics.test.tsx
│   │   └── integration.test.tsx
│   └── ...
├── mocks/
│   ├── __tests__/
│   │   └── romanticRelationships.test.ts
│   └── romanticRelationships.ts
└── e2e/
    └── love-relationships.spec.ts
```

## Key Testing Scenarios

### Badge Alignment
The RankingView tests specifically verify that rank badges #1 and #2 are properly aligned using consistent `min-w-[100px]` classes and flexbox alignment.

### Mock Data Integration
All components test both real API integration and mock data fallback to ensure the feature works in all scenarios.

### User Flows
Integration tests cover complete user journeys:
1. Load relationships
2. Filter by category
3. Search for relationships
4. Open relationship detail
5. View analytics
6. Chat about relationship

## Notes

- All tests use Vitest with React Testing Library
- E2E tests use Playwright
- Mock data context is used to toggle between real and mock data
- Tests are designed to be resilient to API failures

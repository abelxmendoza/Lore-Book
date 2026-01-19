# Comprehensive Test Plan

**Goal**: Achieve 80%+ test coverage across the entire codebase

## Current Status

### Test Infrastructure ✅
- **Backend**: Vitest configured with coverage reporting
- **Frontend**: Vitest + React Testing Library + Playwright
- **E2E**: Playwright configured for multiple browsers
- **Coverage**: v8 provider with HTML/JSON/LCOV reports

### Existing Tests
- **Backend**: 51 test files (compiler tests, service tests, route tests)
- **Frontend**: 15 test files (component tests, hook tests, integration tests)
- **E2E**: 4 spec files (auth, chat, security, timeline)

## Test Coverage Goals

### Backend (apps/server)
- **Routes**: 100+ routes → Target: 80% coverage
- **Services**: 50+ services → Target: 80% coverage
- **Middleware**: All middleware → Target: 100% coverage
- **Utilities**: All utilities → Target: 70% coverage

### Frontend (apps/web)
- **Components**: 100+ components → Target: 70% coverage
- **Hooks**: All hooks → Target: 80% coverage
- **Pages**: All pages → Target: 60% coverage
- **Utils**: All utilities → Target: 70% coverage

## Priority Order

### Phase 1: Critical Paths (Week 1)
1. **API Routes** (High traffic, user-facing)
   - `/api/chat` - Core chat functionality
   - `/api/entries` - Journal entries CRUD
   - `/api/characters` - Character management
   - `/api/locations` - Location management
   - `/api/timeline` - Timeline views
   - `/api/tasks` - Task management
   - `/api/biography` - Biography generation

2. **Core Services** (Business logic)
   - `omegaChatService` - Chat orchestration
   - `memoryService` - Memory management
   - `characterService` - Character operations
   - `locationService` - Location operations
   - `biographyGenerationEngine` - Biography generation
   - `taskEngineService` - Task management

3. **Critical Components** (User-facing)
   - `CharacterDetailModal` - Character viewing/editing
   - `EventDetailModal` - Event viewing
   - `ChatPanel` - Chat interface
   - `TimelinePanel` - Timeline display
   - `JournalComposer` - Entry creation

### Phase 2: Secondary Paths (Week 2)
1. **Secondary Routes**
   - `/api/chapters` - Chapter management
   - `/api/insights` - Insights generation
   - `/api/continuity` - Continuity engine
   - `/api/perceptions` - Perception tracking
   - `/api/skills` - Skill tracking
   - `/api/organizations` - Organization management

2. **Secondary Services**
   - `chapterService` - Chapter operations
   - `continuityService` - Continuity detection
   - `insightService` - Insight generation
   - `perceptionService` - Perception tracking

3. **Secondary Components**
   - All modal components
   - All panel components
   - Form components
   - List components

### Phase 3: Edge Cases & Integration (Week 3)
1. **Error Handling**
   - All error paths
   - Edge cases
   - Boundary conditions

2. **Integration Tests**
   - Full user flows
   - Cross-service interactions
   - Database operations

3. **E2E Tests**
   - Critical user journeys
   - Authentication flows
   - Data persistence

## Test Structure

### Backend Route Tests
```typescript
describe('POST /api/characters', () => {
  it('should create a character', async () => {});
  it('should validate required fields', async () => {});
  it('should handle duplicate names', async () => {});
  it('should return 401 if not authenticated', async () => {});
  it('should handle database errors', async () => {});
});
```

### Backend Service Tests
```typescript
describe('CharacterService', () => {
  describe('createCharacter', () => {
    it('should create character with valid data', async () => {});
    it('should validate input', async () => {});
    it('should handle errors', async () => {});
  });
});
```

### Frontend Component Tests
```typescript
describe('CharacterDetailModal', () => {
  it('should render character information', () => {});
  it('should handle character updates', () => {});
  it('should display loading state', () => {});
  it('should handle errors', () => {});
});
```

### Frontend Hook Tests
```typescript
describe('useCharacter', () => {
  it('should fetch character data', async () => {});
  it('should handle loading state', () => {});
  it('should handle errors', () => {});
  it('should update character', async () => {});
});
```

## Test Utilities

### Backend Test Utilities
- Mock Supabase client
- Mock OpenAI client
- Test database helpers
- Request/response helpers

### Frontend Test Utilities
- Test providers (React Router, Auth, etc.)
- Mock API responses (MSW)
- Component render helpers
- User interaction helpers

## Coverage Thresholds

### Backend
- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 70%
- **Statements**: 80%

### Frontend
- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 60%
- **Statements**: 70%

## Implementation Checklist

### Backend Routes (100+ routes)
- [ ] `/api/chat` - ✅ Has tests
- [ ] `/api/entries` - ✅ Has tests
- [ ] `/api/characters` - ✅ Has tests
- [ ] `/api/locations` - ✅ Has tests
- [ ] `/api/timeline` - ✅ Has tests
- [ ] `/api/tasks` - ✅ Has tests
- [ ] `/api/biography` - ⚠️ Needs tests
- [ ] `/api/chapters` - ⚠️ Needs tests
- [ ] `/api/insights` - ⚠️ Needs tests
- [ ] `/api/continuity` - ⚠️ Needs tests
- [ ] `/api/perceptions` - ⚠️ Needs tests
- [ ] `/api/skills` - ⚠️ Needs tests
- [ ] `/api/organizations` - ⚠️ Needs tests
- [ ] ... (90+ more routes)

### Backend Services (50+ services)
- [ ] `omegaChatService` - ✅ Has tests
- [ ] `memoryService` - ✅ Has tests
- [ ] `characterService` - ⚠️ Needs tests
- [ ] `locationService` - ✅ Has tests
- [ ] `biographyGenerationEngine` - ⚠️ Needs tests
- [ ] `taskEngineService` - ✅ Has tests
- [ ] `chapterService` - ✅ Has tests
- [ ] `continuityService` - ✅ Has tests
- [ ] ... (40+ more services)

### Frontend Components (100+ components)
- [ ] `CharacterDetailModal` - ⚠️ Needs tests
- [ ] `EventDetailModal` - ⚠️ Needs tests
- [ ] `ChatPanel` - ✅ Has tests
- [ ] `TimelinePanel` - ✅ Has tests
- [ ] `JournalComposer` - ⚠️ Needs tests
- [ ] ... (95+ more components)

### Frontend Hooks
- [ ] `useTaskEngine` - ✅ Has tests
- [ ] `useLoreKeeper` - ✅ Has tests
- [ ] `useCharacter` - ⚠️ Needs tests
- [ ] `useLocation` - ⚠️ Needs tests
- [ ] ... (20+ more hooks)

## Next Steps

1. **Create test utilities** (shared mocks, helpers)
2. **Add route tests** (priority routes first)
3. **Add service tests** (core services first)
4. **Add component tests** (critical components first)
5. **Add hook tests** (all hooks)
6. **Add E2E tests** (critical user journeys)
7. **Set up CI/CD** (run tests on PR/commit)
8. **Monitor coverage** (track progress)

# Memory Explorer Implementation Plan

## Overview

Transform the Memory Explorer (currently HQIPanel) into a comprehensive memory browsing and search interface with:
- Default view showing recent memories in card format
- Real-time search with semantic, keyword, and cluster results
- Expandable memory cards showing linked memories
- Comprehensive filter sidebar

## Architecture

### Components Structure

```
apps/web/src/components/memory-explorer/
├── MemoryExplorer.tsx          # Main component
├── MemoryCard.tsx              # Individual memory card with linked memories
├── MemoryFiltersSidebar.tsx    # Filter sidebar
├── SearchResults.tsx            # Search results with three sections
├── SemanticMatches.tsx         # Top section - semantic matches
├── KeywordMatches.tsx          # Middle section - keyword matches
├── RelatedClusters.tsx         # Bottom section - contextual clusters
└── LinkedMemoriesSection.tsx  # Expandable linked memories in cards
```

### Data Types

```typescript
// apps/web/src/types/memory.ts
export type MemoryCard = {
  id: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
  mood?: string;
  source: 'journal' | 'x' | 'task' | 'photo' | 'calendar' | 'chat';
  sourceIcon: string;
  chapterId?: string;
  chapterTitle?: string;
  eraId?: string;
  eraTitle?: string;
  sagaId?: string;
  sagaTitle?: string;
  arcId?: string;
  arcTitle?: string;
  characters: string[];
  linkedMemories?: LinkedMemory[];
};

export type LinkedMemory = {
  id: string;
  title: string;
  date: string;
  linkType: 'era' | 'saga' | 'arc' | 'character' | 'temporal' | 'tag' | 'source';
  linkLabel: string;
  daysDiff?: number;
};

export type MemorySearchResult = {
  type: 'semantic' | 'keyword' | 'cluster';
  memories: MemoryCard[];
  clusterLabel?: string;
  clusterReason?: string;
};

export type MemoryFilters = {
  eras: string[];
  sagas: string[];
  arcs: string[];
  characters: string[];
  sources: string[];
  tags: string[];
  dateFrom?: string;
  dateTo?: string;
};
```

## Implementation Steps

### Phase 1: Backend API Endpoints

#### 1.1 Recent Memories Endpoint
**File**: `apps/server/src/routes/entries.ts`
**Endpoint**: `GET /api/entries/recent`
**Query Params**: `limit=20`, filters (eras, sagas, arcs, characters, sources, tags, dateFrom, dateTo)

**Implementation**:
- Query journal_entries with filters
- Join with timeline hierarchy tables to get era/saga/arc info
- Join with characters table
- Return MemoryCard format

#### 1.2 Keyword Search Endpoint
**File**: `apps/server/src/routes/entries.ts`
**Endpoint**: `GET /api/entries/search/keyword`
**Query Params**: `query`, `limit`, filters

**Implementation**:
- Use PostgreSQL full-text search on content and summary
- Use ILIKE for title matching
- Apply filters
- Return ranked by keyword density + recency

#### 1.3 Related Clusters Endpoint
**File**: `apps/server/src/routes/entries.ts`
**Endpoint**: `POST /api/entries/clusters`
**Body**: `{ memoryIds: string[], limit: number }`

**Implementation**:
- For each memory ID, find related memories:
  - Same era/saga/arc (within date range)
  - Same characters (from relationships)
  - Temporal proximity (±5 days)
  - Shared tags
  - Same source type
- Group by cluster type
- Return clusters with labels

#### 1.4 Linked Memories Endpoint
**File**: `apps/server/src/routes/entries.ts`
**Endpoint**: `GET /api/entries/:id/linked`
**Query Params**: `limit=10`

**Implementation**:
- Find memories linked by:
  - Same era/saga/arc
  - Same characters
  - Temporal proximity (±5 days)
  - Shared tags
  - Same source
- Return LinkedMemory[] with linkType and linkLabel

### Phase 2: Frontend Components

#### 2.1 MemoryCard Component
**File**: `apps/web/src/components/memory-explorer/MemoryCard.tsx`

**Features**:
- Display memory title, date, tags, mood, source icon
- Show era/saga/arc badges if available
- Expandable section for linked memories
- Click to view full memory modal
- Hover effects and transitions

**Props**:
```typescript
type MemoryCardProps = {
  memory: MemoryCard;
  onSelect?: (memory: MemoryCard) => void;
  showLinked?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
};
```

#### 2.2 MemoryFiltersSidebar Component
**File**: `apps/web/src/components/memory-explorer/MemoryFiltersSidebar.tsx`

**Features**:
- Filter sections:
  - Eras (multi-select)
  - Sagas (multi-select)
  - Arcs (multi-select)
  - Characters (multi-select with avatars)
  - Sources (checkboxes: Journal, X, Tasks, Photos, Calendar)
  - Tags (multi-select with search)
  - Date range (slider or date pickers)
- Clear all filters button
- Active filter count badge
- Collapsible sections

**Props**:
```typescript
type MemoryFiltersSidebarProps = {
  filters: MemoryFilters;
  onFiltersChange: (filters: MemoryFilters) => void;
  availableEras: TimelineNode[];
  availableSagas: TimelineNode[];
  availableArcs: TimelineNode[];
  availableCharacters: Character[];
  availableTags: string[];
};
```

#### 2.3 SearchResults Component
**File**: `apps/web/src/components/memory-explorer/SearchResults.tsx`

**Features**:
- Three stacked sections:
  - Semantic Matches (top, highlighted)
  - Keyword Matches (middle)
  - Related Clusters (bottom)
- Section headers with counts
- Visual distinction between sections

#### 2.4 MemoryExplorer Main Component
**File**: `apps/web/src/components/memory-explorer/MemoryExplorer.tsx`

**Features**:
- Default view: Recent 20 memories in grid
- Search mode: Real-time search as user types
- Search bar at top
- Filters sidebar on left
- Main content area (cards or search results)
- Loading states
- Empty states

**State Management**:
```typescript
const [query, setQuery] = useState('');
const [filters, setFilters] = useState<MemoryFilters>({...});
const [recentMemories, setRecentMemories] = useState<MemoryCard[]>([]);
const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
const [loading, setLoading] = useState(false);
const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
```

### Phase 3: Integration

#### 3.1 Replace HQIPanel
**File**: `apps/web/src/pages/App.tsx`
- Replace `HQIPanel` with `MemoryExplorer` in search surface
- Keep HQI API for semantic search backend

#### 3.2 Update Routes
- Ensure all API endpoints are registered
- Add error handling

#### 3.3 Styling
- Use masonry grid or uniform grid for cards
- Cyberpunk theme consistency
- Smooth transitions and animations
- Responsive design

## API Endpoints Summary

### New Endpoints

1. `GET /api/entries/recent`
   - Returns recent memories with filters
   - Supports all filter types

2. `GET /api/entries/search/keyword`
   - Full-text keyword search
   - Returns ranked results

3. `POST /api/entries/clusters`
   - Finds related memory clusters
   - Groups by relationship type

4. `GET /api/entries/:id/linked`
   - Returns linked memories for a specific memory
   - Used for expandable card sections

### Existing Endpoints (Enhanced)

1. `POST /api/hqi/search`
   - Already exists for semantic search
   - Will be used for semantic matches section

2. `GET /api/entries`
   - Already exists
   - May need enhancements for filter support

## Data Flow

### Default View Flow
```
User opens Memory Explorer
  → Fetch recent 20 memories (GET /api/entries/recent)
  → Apply filters if any
  → Display in grid
  → User clicks card → Expand linked memories (GET /api/entries/:id/linked)
```

### Search Flow
```
User types in search bar
  → Debounce (300ms)
  → If query.length > 0:
      → Parallel requests:
          → Semantic search (POST /api/hqi/search)
          → Keyword search (GET /api/entries/search/keyword)
      → Get clusters (POST /api/entries/clusters) with top results
  → Display in three sections
  → User clicks card → Expand linked memories
```

## Visual Design

### Memory Card Layout
```
┌─────────────────────────────────┐
│ [Source Icon] Date    [Mood Badge]│
│ Title or First Sentence          │
│ Content preview (2-3 lines)...   │
│                                  │
│ [Tag] [Tag] [Tag]                │
│                                  │
│ [Era/Saga/Arc Badge]            │
│                                  │
│ ▼ Linked Memories (3)            │
│   └─ Related memory 1            │
│   └─ Related memory 2            │
│   └─ Related memory 3            │
└─────────────────────────────────┘
```

### Filter Sidebar Layout
```
┌─────────────────────┐
│ Filters              │
├─────────────────────┤
│ ▼ Eras               │
│   ☐ Era 1           │
│   ☐ Era 2           │
│                      │
│ ▼ Sagas              │
│   ☐ Saga 1           │
│                      │
│ ▼ Arcs               │
│                      │
│ ▼ Characters         │
│   [Avatar] Name      │
│                      │
│ ▼ Sources            │
│   ☐ Journal          │
│   ☐ X/Twitter        │
│   ☐ Tasks            │
│                      │
│ ▼ Tags               │
│   [Search tags...]   │
│                      │
│ ▼ Date Range         │
│   [Slider]           │
│                      │
│ [Clear All]          │
└─────────────────────┘
```

## Testing Checklist

- [ ] Default view loads recent memories
- [ ] Filters apply correctly
- [ ] Search triggers on typing
- [ ] Semantic matches appear in top section
- [ ] Keyword matches appear in middle section
- [ ] Related clusters appear in bottom section
- [ ] Memory cards expand to show linked memories
- [ ] Linked memories load correctly
- [ ] Clicking memory opens detail modal
- [ ] Grid layout works (masonry or uniform)
- [ ] Responsive design works on mobile
- [ ] Loading states display correctly
- [ ] Error states handle gracefully
- [ ] Empty states show helpful messages

## Performance Considerations

- Debounce search input (300ms)
- Limit initial memory load (20 items)
- Lazy load linked memories (only when expanded)
- Virtual scrolling for large result sets
- Cache filter options
- Optimize database queries with indexes

## Future Enhancements

- Memory card preview on hover
- Drag and drop to organize memories
- Bulk actions (tag, archive, delete)
- Export memories
- Memory comparison view
- Timeline integration
- Memory relationships graph view


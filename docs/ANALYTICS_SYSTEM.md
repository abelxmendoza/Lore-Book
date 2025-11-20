# Analytics System Documentation

## Overview

The Analytics System is Lore Keeper's **life intelligence engine**—providing deep insights into your patterns, relationships, emotional trajectory, and predictive modeling. These 10 comprehensive analytics modules transform your journal entries into actionable intelligence about your past, present, and future. All modules are fully implemented and ready for use.

## Modules

All 10 analytics modules are fully functional:

1. ✅ **Identity Pulse** - Sentiment trajectory, drift detection, mood volatility
2. ✅ **Relationship Analytics** - Graph algorithms, centrality, lifecycle phases
3. ✅ **Saga Engine** - Memory clustering, arc detection, saga generation
4. ✅ **Memory Fabric** - Similarity graph, community detection, outliers
5. ✅ **Insight Engine** - Correlations, behavioral loops, patterns
6. ✅ **Prediction Engine** - Mood forecasting, risk zones, predictions
7. ✅ **Shadow Engine** - Suppressed topics, shadow archetypes, negative patterns
8. ✅ **XP Engine** - Gamification system with levels and breakdowns
9. ✅ **Life Map** - Global view combining all analytics
10. ✅ **Search Engine** - Combined keyword/semantic search

## File Structure

```
apps/server/src/services/analytics/
├── base.ts                    # Base class with caching & utilities
├── types.ts                   # TypeScript interfaces
├── index.ts                   # Module exports
├── identityPulse.ts          # ✅ Complete
├── relationshipAnalytics.ts   # ✅ Complete
├── sagaEngine.ts             # ✅ Complete
├── memoryFabric.ts           # ✅ Complete
├── insightEngine.ts          # ✅ Complete
├── predictionEngine.ts       # ✅ Complete
├── shadowEngine.ts           # ✅ Complete
├── xpEngine.ts               # ✅ Complete
├── lifeMap.ts                # ✅ Complete
└── searchEngine.ts           # ✅ Complete

apps/server/src/routes/
└── analytics.ts               # ✅ All API endpoints

migrations/
└── 20250201_analytics_system.sql  # ✅ Database schema
```

## Quick Start

1. **Run Migration**:
   ```sql
   -- In Supabase SQL Editor
   -- Copy/paste contents of migrations/20250201_analytics_system.sql
   ```

2. **Test Endpoints**:
   ```bash
   # Start server
   pnpm dev:server

   # Test analytics (with auth token)
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/analytics/identity
   
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/analytics/relationships
   
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/analytics/saga
   ```

3. **Force Cache Refresh**:
   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"type": "identity_pulse"}' \
     http://localhost:3000/api/analytics/refresh
   ```

## API Endpoints

All endpoints return `AnalyticsPayload` with:
- `metrics`: Key performance indicators
- `charts`: Visualization data
- `clusters`: Cluster information (if applicable)
- `graph`: Graph data (if applicable)
- `insights`: AI-generated insights
- `summary`: Text summary

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics/identity` | GET | Identity pulse analytics |
| `/api/analytics/relationships` | GET | Relationship analytics |
| `/api/analytics/saga` | GET | Saga/arc analytics |
| `/api/analytics/memory-fabric` | GET | Memory fabric graph |
| `/api/analytics/insights` | GET | Insight analytics |
| `/api/analytics/predictions` | GET | Prediction analytics |
| `/api/analytics/shadow` | GET | Shadow analytics |
| `/api/analytics/xp` | GET | XP gamification |
| `/api/analytics/map` | GET | Life map (combines all) |
| `/api/analytics/search` | GET/POST | Search memories |
| `/api/analytics/refresh` | POST | Force cache refresh |

## Features

### Caching
- 6-hour TTL for all analytics
- Automatic invalidation on new memory creation
- Manual refresh endpoint

### Performance
- Efficient algorithms (cosine similarity, EMA, rolling windows)
- Indexed database queries
- Pagination-ready results

### Algorithms Implemented
- ✅ Cosine similarity for embeddings
- ✅ Exponential Moving Average (EMA) for smoothing
- ✅ Pearson correlation for relationships
- ✅ Autocorrelation (ACF) for loops
- ✅ KMeans clustering (upgradeable to HDBSCAN)
- ✅ Connected components for communities
- ✅ Trend analysis (slope calculation)
- ✅ Standard deviation for volatility
- ✅ Logarithmic level scaling

## Database Schema

### Migration: `migrations/20250201_analytics_system.sql`

**Enhanced Tables**:
- `journal_entries` - Added `sentiment` (FLOAT) and `people` (TEXT[]) fields
- `characters` - Added `interaction_score` and `sentiment_toward` fields
- `insights` - Enhanced with `category` and `score` fields

**New Tables**:
- `analytics_cache` - Caching expensive computations
- `arcs` - Saga/arc storage

**Indexes**:
- HNSW-ready indexes for vectors
- GIN indexes for arrays
- BTREE indexes for time-series
- Triggers for cache invalidation

## Module Details

### 1. Identity Pulse
- Sentiment trajectory with EMA smoothing
- Identity statement extraction (regex patterns)
- Identity drift detection via centroid shift
- Mood volatility computation
- Emotional trigger detection

### 2. Relationship Analytics
- Relationship graph building (adjacency lists)
- Character co-occurrence detection
- Centrality scores (degree-based)
- Closeness graph from database
- Lifecycle phase detection (Rise, Peak, Drift, Decline)
- Emotional impact ranking

### 3. Saga Engine
- Memory clustering using KMeans (HDBSCAN-ready)
- Arc boundary detection (sentiment/topic shifts)
- Saga label generation and storage
- Timeline band creation for visualization
- Arc duration and density metrics

### 4. Memory Fabric
- Similarity graph building using cosine similarity
- Community detection (connected components)
- Outlier detection based on edge connectivity
- Cluster summarization

### 5. Insight Engine
- Correlation matrix (Pearson correlation)
- Autocorrelation (ACF) for behavioral loops
- Pattern detection (writing frequency, sentiment trends, topic diversity)
- Weekly highlights generation

### 6. Prediction Engine
- Rolling-average mood forecast (7-day projection)
- Risk zone detection (negative periods, volatility, positive surges)
- Trajectory forecasting using trend analysis
- Topic continuation predictions

### 7. Shadow Engine
- Suppressed topic detection (rarity + negative sentiment)
- Shadow archetype inference (Perfectionist, Abandoned, Hidden, etc.)
- Negative pattern detection (recurring cycles, negative topic loops)

### 8. XP Engine
- XP calculation per memory (sentiment-weighted, topic/people bonuses)
- Level system (logarithmic scaling)
- Daily XP tracking and timeline
- Breakdown by life domain (topics)
- Streak calculation

### 9. Life Map
- Integration of all analytics modules
- Turning point detection (emotional, arc shifts, identity, relationships)
- Global life graph construction
- Master narrative summary

### 10. Search Engine
- Combined keyword and semantic search
- Ranking formula (60% semantic + 30% keyword + 10% recency)
- Related memories discovery
- Result clustering
- Filter support (date, people, topics)

## Data Flow

```
User Request
  ↓
API Route (/api/analytics/*)
  ↓
Check Cache (analytics_cache table)
  ↓
If expired/missing:
  ↓
Fetch Memories (journal_entries)
  ↓
Run Analytics Module
  ↓
Store in Cache
  ↓
Return Payload
```

## Module Interface

All modules follow this interface:
```typescript
class AnalyticsModule extends BaseAnalyticsModule {
  protected readonly moduleType: AnalyticsModuleType;
  
  async run(userId: string): Promise<AnalyticsPayload> {
    // 1. Check cache
    // 2. Fetch data
    // 3. Compute analytics
    // 4. Generate payload
    // 5. Cache result
    // 6. Return payload
  }
}
```

## Next Steps

### Immediate
1. ✅ **Run Migration**: Execute `migrations/20250201_analytics_system.sql`
2. ✅ **Test All Endpoints**: All 10 modules are ready

### Short Term
1. **Frontend UI Panels**: Create React components for each analytics type
2. **Performance Optimization**: Add background workers for heavy computations
3. **Enhanced Algorithms**: Upgrade to HDBSCAN, DTW, advanced graph algorithms

### Medium Term
1. **Real-time Updates**: WebSocket support for live analytics
2. **Export Features**: PDF/CSV export of analytics
3. **Comparison Analytics**: Period-over-period comparisons

### Long Term
1. **Optimize Performance**: Add background workers for heavy computations
2. **Add UI Panels**: Create frontend components for each analytics type
3. **Expand Algorithms**: Add HDBSCAN, DTW, advanced graph algorithms

## Technical Notes

### Caching Strategy
- All modules use 6-hour TTL cache
- Cache automatically invalidates on new memory creation (trigger)
- Manual refresh via `/api/analytics/refresh` endpoint

### Performance Considerations
- Embeddings use IVFFlat index (can upgrade to HNSW)
- GIN indexes for array fields (topics, people)
- BRIN indexes recommended for large time-series
- Consider background job queue for heavy computations

### Algorithm Choices
- **Clustering**: KMeans (simple, fast) → Can upgrade to HDBSCAN
- **Similarity**: Cosine similarity (standard for embeddings)
- **Smoothing**: EMA (Exponential Moving Average)
- **Centrality**: Degree centrality (simple) → Can upgrade to eigenvector

## Testing

To test the system:

1. **Run migration**:
   ```bash
   psql $DATABASE_URL -f migrations/20250201_analytics_system.sql
   ```

2. **Start server**:
   ```bash
   pnpm dev:server
   ```

3. **Test endpoints** (with auth token):
   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/analytics/identity
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/analytics/relationships
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/analytics/saga
   ```

## Future Enhancements

- Background workers for heavy computations
- Real-time analytics updates (WebSocket)
- Advanced ML models for predictions
- Custom algorithm plugins
- Export analytics as PDF/CSV
- Comparison analytics (period over period)


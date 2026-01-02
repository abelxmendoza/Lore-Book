# Full Lore Keeper Engine Implementation Summary

## ✅ Completed Implementation

### Database Schema Extensions

**Migration**: `migrations/20250126_knowledge_graph_insights.sql`

1. **graph_edges** table
   - Stores relationships between memory components
   - Relationship types: semantic, social, thematic, narrative, temporal, emotional, character, location, tag
   - Weight field (0-1) for relationship strength
   - Optimized indexes for fast queries

2. **insights** table
   - Stores automatically generated insights
   - Insight types: pattern, correlation, cyclic_behavior, identity_shift, motif, prediction, trend, relationship, emotional, behavioral
   - Confidence scores, source component/entry tracking
   - GIN indexes for array fields

3. **conversation_sessions** enhancements
   - Added `embeddings` column (VECTOR(1536))
   - Added `topics` column (TEXT[])
   - IVFFlat index for semantic search

### Core Services

1. **knowledgeGraphService.ts**
   - Builds graph edges automatically
   - Semantic links (embedding similarity > 0.7)
   - Social links (shared characters)
   - Thematic links (shared tags)
   - Narrative links (shared timeline nodes)
   - Temporal links (close timestamps)
   - Graph query utilities (neighbors, path finding)

2. **insightStorageService.ts**
   - Store and retrieve insights
   - Query by type, confidence, component, entry
   - Trend analysis
   - Cleanup utilities

3. **Enhanced conversationService.ts**
   - Session-level embedding generation
   - Topic extraction from conversations
   - Automatic topic tagging

4. **Enhanced memoryExtractionService.ts**
   - Automatic graph edge creation when components are created
   - Background graph building (non-blocking)

### API Endpoints

**Knowledge Graph** (`/api/graph`):
- `GET /component/:id/neighbors` - Get neighbors for a component
- `GET /path` - Get path between two components
- `GET /edges` - Get graph edges with filters
- `POST /build` - Manually trigger graph building

**Insights** (`/api/insights`):
- `GET /stored` - Get stored insights from database
- `GET /trends` - Get trend insights
- `GET /component/:componentId` - Get insights for a component
- `GET /entry/:entryId` - Get insights for an entry
- `POST /generate` - Generate and store new insights
- Existing endpoints enhanced to return stored insights

### Background Jobs

1. **insightGenerationJob.ts**
   - Daily cron job (2:30 AM)
   - Generates insights for all active users
   - Cleans up old insights (>90 days)
   - Integrates with Python insight engine

2. **graphUpdateJob.ts**
   - Weekly cron job (Sunday 3:00 AM)
   - Rebuilds graph edges for recent components
   - Updates edge weights
   - Processes users in batches

3. **memoryExtractionWorker.ts** (already existed)
   - Processes memory extraction every 1 minute
   - Now triggers graph building automatically

## Architecture Decisions

### Cost Optimization

1. **Rule-Based First**: Graph edges built using rule-based algorithms (FREE)
   - Semantic similarity uses existing embeddings (no new API calls)
   - Social/thematic links use set operations
   - Only embeddings already generated are used

2. **Background Processing**: Graph building happens asynchronously
   - Non-blocking for user requests
   - Batch processing for efficiency

3. **Caching**: Reuses existing embedding cache
   - No duplicate embedding generation
   - Session embeddings generated once

### Graph Building Strategy

- **Semantic Links**: Cosine similarity > 0.7 threshold
- **Social Links**: Shared characters (weighted by intersection size)
- **Thematic Links**: Shared tags (weighted by intersection size)
- **Narrative Links**: Shared timeline nodes at any level
- **Temporal Links**: Components within 7 days (decay function)

### Insight Integration

- Integrates with existing Python `insight_engine.py`
- Stores insights in database for persistence
- Supports both Python-generated and TypeScript-generated insights
- Cleanup job prevents database bloat

## Usage Examples

### Building Graph Edges

```typescript
// Automatically happens when components are created
const result = await memoryExtractionService.extractMemory({
  sessionId: '...',
  userId: '...',
});

// Or manually trigger
POST /api/graph/build
{
  "entryId": "...",
  // or
  "componentIds": ["...", "..."]
}
```

### Querying Graph

```typescript
// Get neighbors
GET /api/graph/component/{componentId}/neighbors?type=semantic&limit=20

// Find path
GET /api/graph/path?source={id1}&target={id2}&maxDepth=3

// Get edges
GET /api/graph/edges?componentId={id}&relationshipType=social&minWeight=0.5
```

### Storing Insights

```typescript
await insightStorageService.storeInsight({
  user_id: '...',
  insight_type: 'pattern',
  text: 'You tend to reflect more on weekends',
  confidence: 0.8,
  source_component_ids: ['...'],
  source_entry_ids: ['...'],
  tags: ['reflection', 'pattern'],
});
```

## Performance Considerations

- **Graph Building**: Processes 10 components at a time
- **Batch Size**: 100 edges per insert batch
- **Query Limits**: Default 20-50 results
- **Indexes**: Optimized for common queries
- **RLS**: All tables have proper row-level security

## Next Steps (Future Enhancements)

1. **Frontend Components**
   - Graph visualization (D3.js or similar)
   - Component relationship viewer
   - Insight dashboard UI
   - Trend charts

2. **Advanced Features**
   - Graph clustering algorithms
   - Community detection
   - Influence scoring
   - Temporal graph analysis

3. **ML Enhancements**
   - Local embedding models (sentence-transformers)
   - Sentiment analysis (DistilBERT)
   - Clustering algorithms (KMeans/DBSCAN)

## Files Created/Modified

### New Files
- `migrations/20250126_knowledge_graph_insights.sql`
- `apps/server/src/services/knowledgeGraphService.ts`
- `apps/server/src/services/insightStorageService.ts`
- `apps/server/src/routes/knowledgeGraph.ts`
- `apps/server/src/jobs/insightGenerationJob.ts`
- `apps/server/src/jobs/graphUpdateJob.ts`

### Modified Files
- `apps/server/src/types.ts` - Added GraphEdge and Insight types
- `apps/server/src/services/memoryExtractionService.ts` - Added graph building
- `apps/server/src/services/conversationService.ts` - Added embedding/topic generation
- `apps/server/src/routes/insights.ts` - Enhanced with storage endpoints
- `apps/server/src/index.ts` - Registered new routers and jobs

## Testing

To test the implementation:

1. **Run Migration**:
   ```bash
   psql $DATABASE_URL -f migrations/20250126_knowledge_graph_insights.sql
   ```

2. **Create Memory Components**:
   - Extract memory from conversation session
   - Graph edges will be built automatically

3. **Query Graph**:
   ```bash
   GET /api/graph/component/{componentId}/neighbors
   ```

4. **Generate Insights**:
   ```bash
   POST /api/insights/generate
   ```

5. **Check Background Jobs**:
   - Daily insight generation (2:30 AM)
   - Weekly graph updates (Sunday 3:00 AM)

## Cost Analysis

- **Graph Building**: FREE (uses existing embeddings, set operations)
- **Session Embeddings**: One API call per session (cached)
- **Insight Generation**: Uses existing Python engine (no additional cost)
- **Background Jobs**: Minimal CPU usage, runs during off-peak hours

Total additional cost: **~$0-5/month** (only session embeddings)


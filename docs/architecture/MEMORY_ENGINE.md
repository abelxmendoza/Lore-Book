# Memory Engine Documentation

## Overview

The Memory Engine automatically extracts memories from chat conversations, breaks them into components, and links them to the timeline hierarchy. This document consolidates implementation details, API reference, and technical specifications.

## Architecture

### Database Schema

**Migration**: `migrations/20250125_memory_engine.sql`

**Tables Created**:
- `conversation_sessions` - Groups chat message sessions
- `conversation_messages` - Stores individual chat turns
- `memory_components` - Stores sub-memories extracted from journal entries
- `timeline_links` - Links memory components to 9-level timeline hierarchy

**Indexes**: Optimized composite, GIN (arrays), IVFFlat (vectors), partial, covering indexes  
**RLS**: Full row-level security policies for all tables  
**Constraints**: Check constraints for data integrity

### Core Services

1. **ruleBasedMemoryDetectionService.ts**
   - Pattern matching for memory detection (FREE, no API calls)
   - Keyword detection, emotional indicators, relationship mentions
   - Confidence scoring (0-1)
   - Returns detection results with reasons

2. **conversationService.ts**
   - Session management (create, end, get active)
   - Message storage and retrieval
   - Session queries with messages

3. **memoryDetectionCacheService.ts**
   - LRU cache for detection results (500 items)
   - Content hash-based caching
   - Memory + potential database cache

4. **componentExtractionCacheService.ts**
   - LRU cache for component extractions (500 items)
   - Reduces redundant processing

5. **memoryExtractionService.ts**
   - Main extraction pipeline
   - Summarizes conversations into journal entries
   - Extracts memory components
   - Integrates with caching and timeline assignment
   - LLM fallback when rule-based insufficient

6. **timelineAssignmentService.ts**
   - Assigns components to timeline hierarchy
   - Rule-based inference using dates and chapter relationships
   - Batch processing support
   - Query components by timeline level

7. **llmMemoryExtractionService.ts**
   - LLM fallback for low-confidence cases
   - Uses gpt-3.5-turbo (cheaper model)
   - Detection, component extraction, timeline assignment prompts
   - Only called when rule-based fails

### Background Worker

**memoryExtractionWorker.ts**
- Processes unprocessed sessions in batches (10 at a time)
- Runs every 1 minute
- Tracks extraction status in session metadata
- Handles errors gracefully
- Can process specific sessions on-demand

## API Reference

**Base Path**: `/api/memory-engine`

### Session Management

#### Start Conversation Session
```bash
POST /api/memory-engine/session/start
Content-Type: application/json

{
  "title": "Optional session title",
  "metadata": {}
}
```

#### Save Messages
```bash
POST /api/memory-engine/message
Content-Type: application/json

{
  "sessionId": "session-uuid",
  "role": "user",
  "content": "Bro yesterday I went to the pier with my cousin..."
}
```

**Note**: If `sessionId` is omitted, automatically creates/uses active session.

#### End Session (Auto-queues Extraction)
```bash
POST /api/memory-engine/session/end
Content-Type: application/json

{
  "sessionId": "session-uuid",
  "summary": "Optional summary"
}
```

**Note**: Ending a session automatically queues it for background memory extraction.

### Memory Extraction

#### Extract Memory Immediately (Optional)
```bash
POST /api/memory-engine/extract
Content-Type: application/json

{
  "sessionId": "session-uuid",
  "immediate": true
}
```

**Response**:
```json
{
  "success": true,
  "journalEntry": { ... },
  "components": [
    {
      "id": "uuid",
      "component_type": "event",
      "text": "...",
      "importance_score": 8,
      ...
    }
  ],
  "timelineLinks": [ ... ],
  "extractionConfidence": 0.85
}
```

### Query Results

#### Get components for a journal entry
```bash
GET /api/memory-engine/entry/{entryId}/components
```

#### Get timeline links for a component
```bash
GET /api/memory-engine/component/{componentId}/timeline
```

#### Get components for a timeline level
```bash
GET /api/memory-engine/timeline/chapter/{chapterId}/components
GET /api/memory-engine/timeline/arc/{arcId}/components
```

### Other Endpoints

- `GET /api/memory-engine/session/:id` - Get session with messages
- `GET /api/memory-engine/sessions` - List recent sessions
- `GET /api/memory-engine/session/:id/messages` - Get messages for session
- `POST /api/memory-engine/detect` - Test memory detection (debugging)

## Cost Optimization

### Rule-Based First Approach
- ✅ Pattern matching for memory detection (FREE)
- ✅ Rule-based component extraction (FREE)
- ✅ Rule-based timeline assignment (FREE)
- ✅ LLM only called when confidence < 0.4 or extraction fails

### Aggressive Caching
- ✅ Memory detection cache (500 items)
- ✅ Component extraction cache (500 items)
- ✅ Reuses existing embeddingCacheService
- ✅ Content hash-based keys for consistency

### Batch Processing
- ✅ Background worker processes 10 sessions per batch
- ✅ Batch timeline assignment
- ✅ Batch embedding generation

### Smart LLM Usage
- ✅ Uses gpt-3.5-turbo (cheaper model)
- ✅ Only called when rule-based insufficient
- ✅ All LLM responses cached
- ✅ Fallback to rule-based on LLM failure

### Deferred Processing
- ✅ Messages stored immediately (fast, free)
- ✅ Extraction queued for background processing
- ✅ User can trigger immediate extraction if needed
- ✅ Worker runs every 1 minute

## Performance Targets

- **Cache hit rate**: >80% (for repeated content)
- **Rule-based extraction**: >60% of cases (avoid LLM calls)
- **API cost**: <$5/month additional costs
- **Processing time**: <500ms for cached, <2s for rule-based, <5s with LLM

## Usage Flow

### 1. Start Conversation Session
```bash
POST /api/memory-engine/session/start
{ "title": "Chat about yesterday" }
```

### 2. Save Messages
```bash
POST /api/memory-engine/message
{
  "sessionId": "...",
  "role": "user",
  "content": "Bro yesterday I went to the pier with my cousin and we talked about our family history."
}
```

### 3. End Session (Auto-queues Extraction)
```bash
POST /api/memory-engine/session/end
{ "sessionId": "...", "summary": "Family history conversation" }
```

### 4. Extract Memory (or let background worker handle it)
```bash
POST /api/memory-engine/extract
{ "sessionId": "...", "immediate": false }
```

### 5. View Results
```bash
GET /api/memory-engine/entry/{entryId}/components
GET /api/memory-engine/component/{componentId}/timeline
```

## Technical Implementation

### Data Structures

#### LRU Cache
- **Implementation**: `Map<string, T>` with doubly-linked list for O(1) access and eviction
- **Size**: 500 items per cache type
- **Eviction**: Least recently used when capacity exceeded

#### Content Hash Map
- **Algorithm**: SHA-256 hashing for cache keys
- **Normalization**: Trim, lowercase, slice(0, 8000) before hashing

### Algorithms

#### Content-Based Hashing
- **Algorithm**: SHA-256(content_normalized)
- **Normalization**: trim, lowercase, slice(0, 8000)

#### Cosine Similarity
- **Formula**: dot(a,b) / (||a|| * ||b||)
- **Use for**: Semantic matching of components, timeline assignment
- **Database**: Use pgvector `<=>` operator for efficient similarity search

#### Batch Processing Algorithm
- **Strategy**: Group by user_id, process in chunks of 10-50
- **Benefits**: Reduce API overhead, amortize costs

### Database Design Patterns

#### Index Strategy

**Composite Indexes**:
```sql
CREATE INDEX idx_sessions_user_time ON conversation_sessions(user_id, started_at DESC);
CREATE INDEX idx_messages_session_time ON conversation_messages(session_id, created_at ASC);
CREATE INDEX idx_components_entry_type ON memory_components(journal_entry_id, component_type);
```

**GIN Indexes** (Array fields):
```sql
CREATE INDEX idx_components_characters_gin ON memory_components USING GIN(characters_involved);
CREATE INDEX idx_components_tags_gin ON memory_components USING GIN(tags);
```

**IVFFlat Indexes** (Vector similarity):
```sql
CREATE INDEX idx_components_embedding ON memory_components 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## Background Processing

The background worker automatically:
- Processes ended sessions every 1 minute
- Extracts memories in batches of 10
- Updates session metadata with extraction status
- Handles errors gracefully

**Extraction Status** (in session.metadata):
- `pending` - Queued for processing
- `processing` - Currently being processed
- `completed` - Successfully extracted
- `failed` - Extraction failed (error in metadata)

## Testing

To test the implementation:

1. **Run Migration**:
   ```bash
   psql $DATABASE_URL -f migrations/20250125_memory_engine.sql
   ```

2. **Start Server**:
   ```bash
   npm run dev
   ```

3. **Test Flow**:
   - Create session
   - Send messages
   - End session
   - Extract memory (or wait for background worker)
   - Query components and timeline links

## Next Steps (Future Enhancements)

1. **Frontend Integration**
   - Update Memory Explorer to show components
   - Session grouping views
   - Timeline hierarchy sidebar
   - Component previews

2. **Advanced Features**
   - Component relationships/graph
   - Component merging/deduplication
   - Timeline conflict detection
   - Component importance learning

3. **Optimization**
   - Database cache for detection results
   - Materialized views for aggregations
   - More sophisticated batch processing
   - Priority queue for extraction jobs

## Files Created/Modified

### New Files
- `migrations/20250125_memory_engine.sql`
- `apps/server/src/services/ruleBasedMemoryDetection.ts`
- `apps/server/src/services/conversationService.ts`
- `apps/server/src/services/memoryDetectionCacheService.ts`
- `apps/server/src/services/componentExtractionCacheService.ts`
- `apps/server/src/services/memoryExtractionService.ts`
- `apps/server/src/services/timelineAssignmentService.ts`
- `apps/server/src/services/llmMemoryExtraction.ts`
- `apps/server/src/jobs/memoryExtractionWorker.ts`
- `apps/server/src/routes/memoryEngine.ts`

### Modified Files
- `apps/server/src/types.ts` - Added new types
- `apps/server/src/index.ts` - Registered router and worker


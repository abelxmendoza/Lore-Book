# Continuity Engine Implementation Summary

> **The Continuity Engine is the core intelligence of Lore Keeper—the "Jarvis of your life."**  
> It tracks your life as a continuous narrative, spotting contradictions, emotional changes, identity drift, abandoned goals, and repeating loops. This is the system that provides self-awareness, continuity, and identity clarity—helping you understand your past, navigate your present, and predict your future.

## ✅ Implementation Complete

### Database Schema
- **Migration**: `migrations/20250127_continuity_engine.sql`
- **Table**: `continuity_events`
  - Stores all detected continuity signals
  - Event types: contradiction, abandoned_goal, arc_shift, identity_drift, emotional_transition, thematic_drift, goal_progress, goal_reappearance, behavioral_loop
  - Optimized indexes for fast queries
  - Full RLS policies

### Core Detection Services

All services in `apps/server/src/services/continuity/`:

1. **contradictionDetection.ts**
   - Semantic clustering + similarity comparison
   - Keyword pattern matching ("I don't want X" vs "I'm doing X")
   - Threshold: similarity < 0.45 AND same topic

2. **abandonedGoalDetection.ts**
   - Goal extraction using keywords (goal, want to, plan, working on, etc.)
   - Temporal tracking (30-day default threshold)
   - Progress checking to avoid false positives

3. **arcShiftDetection.ts**
   - Novelty scoring (1 - max(similarity_to_past))
   - Topic shift detection (>40% threshold)
   - Major life event detection (job change, relationship change, move, crisis)
   - High-emotion cluster detection

4. **identityDriftDetection.ts**
   - Identity statement extraction ("I am", "I'm", "I feel like", etc.)
   - Centroid comparison over time
   - Threshold: cosine similarity < 0.60
   - Specific dimension changes (confidence, outlook, independence, creativity)

5. **emotionalArcDetection.ts**
   - Rule-based sentiment analysis (can be enhanced with DistilBERT)
   - 14-day moving average
   - Slope detection (positive→negative = downturn, negative→positive = recovery)
   - Emotional loop detection (recurring patterns)

6. **thematicDriftDetection.ts**
   - TF-IDF keyword extraction
   - Embedding cluster comparison
   - Topic change detection
   - Dominant theme shifts

### Main Orchestrator

**continuityService.ts**:
- Runs all detection algorithms
- Fetches components from 7, 30, 90-day windows
- Stores events in database
- Generates insights automatically
- Provides query methods

### Background Job

**continuityEngineJob.ts**:
- Daily cron job (runs at 3:00 AM)
- Processes all active users
- Batch processing (3 users at a time)
- Error handling and logging

### API Endpoints

**Base Path**: `/api/continuity`

- `GET /events` - Get continuity events (with optional type filter)
- `POST /run` - Manually trigger continuity analysis
- `GET /goals` - Get goals (active and abandoned)
- `GET /contradictions` - Get contradictions

## Detection Algorithms Summary

### Contradiction Detection
- **Method**: Semantic clustering + keyword patterns
- **Threshold**: Similarity < 0.45 AND same topic
- **Patterns**: "I don't want X" vs "I'm doing X", "I'll never..." vs later doing it

### Abandoned Goal Detection
- **Method**: Goal extraction + temporal tracking
- **Threshold**: 30 days since last mention (default)
- **Enhancement**: Checks for progress indicators

### Arc Shift Detection
- **Method**: Novelty scoring + topic shift + major events
- **Threshold**: Novelty > 0.55 OR topic shift > 40%
- **Events**: Job change, relationship change, move, crisis

### Identity Drift Detection
- **Method**: Identity statement clustering + centroid comparison
- **Threshold**: Cosine similarity < 0.60
- **Dimensions**: Confidence, outlook, independence, creativity

### Emotional Arc Detection
- **Method**: Sentiment analysis + moving averages
- **Window**: 14 days
- **Threshold**: Slope > 0.3
- **Transitions**: Recovery (positive slope) or downturn (negative slope)

### Thematic Drift Detection
- **Method**: TF-IDF keywords + embedding clusters
- **Comparison**: Recent vs historical topics
- **Detection**: Dominant topic changes

## Cost Optimization

✅ **Rule-Based First**: All detection uses rule-based algorithms (FREE)
✅ **Existing Embeddings**: Reuses OpenAI embeddings already generated (no new API calls)
✅ **Local Sentiment**: Rule-based sentiment analysis (can add DistilBERT later)
✅ **Batch Processing**: Processes users in batches
✅ **Background Jobs**: Runs during off-peak hours (3:00 AM)

**Current cost**: ~$0/month (no additional API calls)

## Usage Examples

### Run Analysis Manually
```bash
POST /api/continuity/run
```

### Get Events
```bash
GET /api/continuity/events?type=contradiction&limit=20
```

### Get Goals
```bash
GET /api/continuity/goals
```

### Get Contradictions
```bash
GET /api/continuity/contradictions
```

## Integration Points

1. **Insights**: Automatically generates insights from continuity events
2. **Timeline**: Can trigger timeline updates based on arc shifts
3. **Memory Components**: Uses memory components as input
4. **Graph**: Can integrate with knowledge graph for enhanced detection

## Future Enhancements

1. **Local ML Models**: Add sentence-transformers, DistilBERT, sklearn
2. **GPT Explanations**: Use GPT for human-readable explanations (minimal usage)
3. **Active Goal Tracking**: Implement active goal detection (currently only abandoned)
4. **Goal Reappearance**: Detect when abandoned goals resurface
5. **Behavioral Loops**: Enhanced pattern detection for recurring behaviors

## Files Created

- `migrations/20250127_continuity_engine.sql`
- `apps/server/src/services/continuity/contradictionDetection.ts`
- `apps/server/src/services/continuity/abandonedGoalDetection.ts`
- `apps/server/src/services/continuity/arcShiftDetection.ts`
- `apps/server/src/services/continuity/identityDriftDetection.ts`
- `apps/server/src/services/continuity/emotionalArcDetection.ts`
- `apps/server/src/services/continuity/thematicDriftDetection.ts`
- `apps/server/src/services/continuity/continuityService.ts`
- `apps/server/src/jobs/continuityEngineJob.ts`
- `apps/server/src/routes/continuity.ts`

## Files Modified

- `apps/server/src/types.ts` - Added ContinuityEvent types
- `apps/server/src/index.ts` - Registered router and job

## Testing

To test the implementation:

1. **Run Migration**:
   ```bash
   psql $DATABASE_URL -f migrations/20250127_continuity_engine.sql
   ```

2. **Trigger Analysis**:
   ```bash
   POST /api/continuity/run
   ```

3. **Check Events**:
   ```bash
   GET /api/continuity/events
   ```

4. **Check Background Job**: Runs daily at 3:00 AM automatically

## Performance Notes

- Processes components in batches
- Uses efficient database queries with indexes
- Background processing (non-blocking)
- Batch size: 3 users at a time (intensive analysis)
- Time windows: 7, 30, 90 days for different analyses


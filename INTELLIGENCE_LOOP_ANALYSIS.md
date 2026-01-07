# LoreKeeper Intelligence Loop Analysis
## Patterns → Arcs → Personas → Memory Recall

**Status**: Confidence foundation is complete. This analysis identifies minimal diffs to complete the intelligence loop.

---

## 1. MEMORY RECALL ENGINE

### ✅ What Exists
- `memoryRetriever.ts` - Semantic search via `match_journal_entries` RPC
- `memoryService.semanticSearchEntries()` - Vector similarity search
- `memoryRecall/types.ts` - Types defined (RecallEntry has `confidence` field)
- Embeddings infrastructure (`journal_entries.embedding` column)

### ❌ What's Missing
**Gap**: Recall results don't weight by entity confidence or surface uncertainty.

### 📋 Minimal Diff Required

**File**: `apps/server/src/services/chat/memoryRetriever.ts`

**Change**: Enhance `searchRelevantEntries()` to:
1. Load entity confidence for each entry's related entities
2. Calculate confidence-weighted rank score
3. Attach confidence metadata to results

```typescript
async searchRelevantEntries(
  userId: string,
  query: string,
  limit: number = 10
): Promise<MemoryEntry[]> {
  // ... existing vector search ...
  
  // NEW: Load entity confidence for each entry
  const entriesWithConfidence = await Promise.all(
    entries.map(async (entry) => {
      // Extract entity IDs from entry metadata/tags
      const entityIds = extractEntityIds(entry);
      
      // Get confidence for each entity
      const confidences = await Promise.all(
        entityIds.map(id => 
          entityConfidenceService.getCurrentEntityConfidence(userId, id, 'CHARACTER')
        )
      );
      
      // Calculate aggregate confidence
      const avgConfidence = confidences.length > 0
        ? confidences.reduce((a, b) => (a || 0) + (b || 0), 0) / confidences.length
        : 0.5;
      
      return {
        ...entry,
        _confidence: avgConfidence,
        _confidence_mode: avgConfidence < 0.5 ? 'UNCERTAIN' : 'NORMAL'
      };
    })
  );
  
  // Re-rank by: similarity * recency_weight * confidence_weight
  return entriesWithConfidence
    .sort((a, b) => {
      const scoreA = (a.similarity || 0) * recencyWeight(a.date) * (a._confidence || 0.5);
      const scoreB = (b.similarity || 0) * recencyWeight(b.date) * (b._confidence || 0.5);
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
```

**Impact**: Low. Extends existing function, no breaking changes.

---

## 2. PATTERN ENGINE

### ✅ What Exists
- Multiple pattern detectors: `chronology/patternDetector.ts`, `decisions/patternDetector.ts`, `habits/patternDetector.ts`
- `insightReflectionService.detectPatterns()` - Entity-level pattern detection
- Pattern types: recurrence, correlation, cycle

### ❌ What's Missing
**Gap**: Patterns don't inherit uncertainty from low-confidence entities. No unified pattern engine.

### 📋 Minimal Diff Required

**File**: `apps/server/src/services/insightReflectionService.ts`

**Change**: Add confidence weighting to `detectPatterns()`:

```typescript
async detectPatterns(userId: string, entityId: string): Promise<Insight[]> {
  // ... existing pattern detection ...
  
  // NEW: Get entity confidence
  const entityConfidence = await entityConfidenceService.getCurrentEntityConfidence(
    userId, entityId, 'CHARACTER'
  );
  
  // NEW: Attach confidence to patterns
  const patternsWithConfidence = patterns.map(pattern => ({
    ...pattern,
    avg_confidence: entityConfidence || 0.5,
    confidence_mode: entityConfidence < 0.5 ? 'UNCERTAIN' : 'NORMAL',
    // Soften description if uncertain
    description: entityConfidence < 0.5 
      ? `[Tentative] ${pattern.description}`
      : pattern.description
  }));
  
  return patternsWithConfidence;
}
```

**Impact**: Low. Adds metadata, doesn't change core logic.

---

## 3. LORE ARCS

### ✅ What Exists
- `arcs` table (simplified, analytics-focused)
- `lifeArcService.ts` - Generates narrative summaries
- `timelineAssignmentService.ts` - Assigns entries to timeline hierarchy
- Entry metadata can store `arc_id`

### ❌ What's Missing
**Gap**: No arc-level confidence aggregation. No "arc intelligence" that uses confidence.

### 📋 Minimal Diff Required

**File**: `apps/server/src/services/lifeArcService.ts`

**Change**: Add confidence aggregation to arc summaries:

```typescript
async getRecentLifeArc(userId: string, timeframe: Timeframe): Promise<LifeArcResult> {
  // ... existing logic ...
  
  // NEW: Aggregate entity confidence for this arc
  const arcConfidences = await Promise.all(
    events.flatMap(e => e.people || []).map(async (personId) => {
      return await entityConfidenceService.getCurrentEntityConfidence(
        userId, personId, 'CHARACTER'
      );
    })
  );
  
  const avgArcConfidence = arcConfidences.length > 0
    ? arcConfidences.reduce((a, b) => (a || 0) + (b || 0), 0) / arcConfidences.length
    : 0.5;
  
  // NEW: Add confidence context to narrative
  const narrativeSummary: NarrativeSummary = {
    text: generatedNarrative,
    event_ids: events.map(e => e.id),
    confidence: avgArcConfidence,
    // NEW: Add uncertainty disclaimer if needed
    uncertainty_note: avgArcConfidence < 0.5 
      ? "This arc contains high ambiguity overall"
      : undefined
  };
  
  return {
    timeframe,
    event_groups,
    narrative_summary: narrativeSummary,
    change_signals,
    // NEW: Add confidence metadata
    confidence_metadata: {
      avg_confidence: avgArcConfidence,
      confidence_mode: avgArcConfidence < 0.5 ? 'UNCERTAIN' : 'NORMAL',
      entity_count: arcConfidences.length
    }
  };
}
```

**Impact**: Low. Adds metadata layer, doesn't change core narrative generation.

---

## 4. AI PERSONAS

### ✅ What Exists
- Multi-persona system in `omegaChatService.ts`:
  - Therapist
  - Strategist
  - Biography Writer
  - Soul Capturer
  - Gossip Buddy
- Persona blending (automatic based on context)
- System prompt includes persona instructions

### ❌ What's Missing
**Gap**: No **Archivist** persona (strict read-only). No persona enforcement boundaries.

### 📋 Minimal Diff Required

**File**: `apps/server/src/services/omegaChatService.ts`

**Change**: Add Archivist persona and enforcement:

```typescript
// In buildSystemPrompt(), add Archivist persona:
**YOUR PERSONAS** (adapt naturally based on conversation):

0. **Archivist** (when user requests factual recall only):
   - Can ONLY retrieve, summarize, and reference past data
   - Must respect confidence modes (UNCERTAIN/SOFT/NORMAL)
   - Must explain uncertainty when present
   - NO advice, NO interpretation beyond evidence
   - NO predictions, NO suggestions
   - Format: "According to your entries on [date]..." or "I found [X] mentions of [Y]"
   - If confidence < 0.5: "The data suggests [X], though this is tentative"

1. **Therapist**: ...
```

**Enforcement**: Add persona detection in `chatStream()`:

```typescript
// Detect Archivist intent
const isArchivistQuery = this.detectArchivistIntent(message);
const activePersona = isArchivistQuery ? 'ARCHIVIST' : 'AUTO_BLEND';

// In system prompt, conditionally emphasize Archivist rules
if (activePersona === 'ARCHIVIST') {
  systemPrompt += `
  
**ACTIVE PERSONA: ARCHIVIST**
- You are in READ-ONLY mode
- Retrieve facts only, no advice
- Surface uncertainty explicitly
- If confidence is low, say so: "This is tentative due to limited clarity"
`;
}
```

**Helper Method**:
```typescript
private detectArchivistIntent(message: string): boolean {
  const archivistKeywords = [
    'when did', 'when was', 'have i', 'did i', 'what did',
    'tell me about', 'show me', 'find', 'search', 'recall',
    'what happened', 'what was', 'when did i'
  ];
  const lowerMessage = message.toLowerCase();
  return archivistKeywords.some(keyword => lowerMessage.includes(keyword)) &&
         !message.toLowerCase().includes('should') &&
         !message.toLowerCase().includes('advice');
}
```

**Impact**: Low. Adds persona detection, extends system prompt.

---

## 5. RECALL SUMMARY (PERSONA-CONSTRAINED)

### ❌ What's Missing
**Gap**: No structured recall summary that respects persona and confidence.

### 📋 Minimal Diff Required

**New File**: `apps/server/src/services/memoryRecall/recallEngine.ts`

**Purpose**: Unified recall engine that:
- Uses confidence-weighted ranking
- Generates persona-constrained summaries
- Surfaces uncertainty disclaimers

```typescript
export class MemoryRecallEngine {
  async recall(
    userId: string,
    query: RecallQuery
  ): Promise<RecallResult> {
    // 1. Embed query
    const queryEmbedding = await embeddingService.embedText(query.raw_text);
    
    // 2. Vector search
    const candidates = await memoryService.semanticSearchEntries(
      userId, query.raw_text, 20, 0.4
    );
    
    // 3. Load entity confidence for each candidate
    const entriesWithConfidence = await this.attachConfidence(
      userId, candidates
    );
    
    // 4. Score: similarity * recency * confidence
    const scored = entriesWithConfidence.map(entry => ({
      ...entry,
      rank_score: this.calculateRankScore(entry)
    }));
    
    // 5. Generate persona-constrained summary
    const summary = await this.generateSummary(
      scored.slice(0, 5),
      query.persona || 'DEFAULT'
    );
    
    // 6. Check if we should surface uncertainty
    const avgConfidence = this.calculateAvgConfidence(scored);
    const uncertainty = avgConfidence < 0.5
      ? { message: "Results are tentative due to limited clarity", confidence: avgConfidence }
      : undefined;
    
    return {
      entries: scored.slice(0, 10),
      events: [], // Can be populated from resolved_events
      confidence: avgConfidence,
      explanation: summary,
      silence: uncertainty
    };
  }
  
  private async attachConfidence(
    userId: string,
    entries: MemoryEntry[]
  ): Promise<Array<MemoryEntry & { _confidence: number }>> {
    // Extract entity IDs from entries
    // Load confidence for each
    // Return entries with confidence attached
  }
  
  private calculateRankScore(entry: any): number {
    const similarity = entry.similarity || 0;
    const recency = this.recencyWeight(entry.date);
    const confidence = entry._confidence || 0.5;
    return similarity * recency * confidence;
  }
  
  private async generateSummary(
    entries: any[],
    persona: PersonaMode
  ): Promise<string> {
    if (persona === 'ARCHIVIST') {
      // Factual summary only
      return `Found ${entries.length} relevant entries. ${entries.map(e => 
        `On ${e.date}, you wrote: "${e.content.substring(0, 100)}..."`
      ).join(' ')}`;
    }
    // Default: More interpretive summary
    // ...
  }
}
```

**Impact**: Medium. New service, but leverages existing infrastructure.

---

## 6. ENTRY ↔ ARC LINKING

### ✅ What Exists
- Entry metadata can store `arc_id` (JSONB)
- `timelineAssignmentService` assigns to timeline hierarchy

### ❌ What's Missing
**Gap**: No direct `entry.arc_id` foreign key. No confidence-aware arc assignment.

### 📋 Minimal Diff Required

**Migration**: Add `lore_arc_id` column to `journal_entries`:

```sql
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS lore_arc_id UUID REFERENCES public.arcs(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_lore_arc 
  ON public.journal_entries(lore_arc_id);
```

**File**: `apps/server/src/services/lifeArcService.ts`

**Change**: When generating arc summary, consider entity confidence:

```typescript
// Only include entries with sufficient entity confidence
const highConfidenceEvents = events.filter(e => {
  const eventConfidence = calculateEventConfidence(e, entityConfidences);
  return eventConfidence >= 0.3; // Threshold for inclusion
});
```

**Impact**: Low. Adds column, extends existing logic.

---

## SUMMARY: MINIMAL DIFFS REQUIRED

### Priority 1 (Core Intelligence Loop)
1. ✅ **Memory Recall Confidence Weighting** - Enhance `memoryRetriever.ts`
2. ✅ **Pattern Confidence Inheritance** - Update `insightReflectionService.ts`
3. ✅ **Arc Confidence Aggregation** - Extend `lifeArcService.ts`
4. ✅ **Archivist Persona** - Add to `omegaChatService.ts`

### Priority 2 (Polish)
5. **Recall Engine Service** - New unified service (optional, can use existing)
6. **Entry-Arc Linking** - Migration + confidence-aware assignment

### Estimated Effort
- Priority 1: ~4-6 hours (incremental changes to existing services)
- Priority 2: ~2-3 hours (new service + migration)

### Risk Assessment
- **Low Risk**: All changes are additive, no breaking changes
- **Backward Compatible**: Existing functionality preserved
- **Incremental**: Can be implemented one service at a time

---

## IMPLEMENTATION ORDER

1. **Memory Recall** (highest impact, users ask "when did I...")
2. **Archivist Persona** (enables strict recall mode)
3. **Pattern Confidence** (improves pattern reliability)
4. **Arc Intelligence** (completes narrative layer)

---

## TESTING CHECKLIST

- [ ] Recall results show confidence-weighted ranking
- [ ] Low-confidence entries surface uncertainty disclaimers
- [ ] Archivist persona only retrieves facts, no advice
- [ ] Patterns inherit uncertainty from entities
- [ ] Arc summaries include confidence metadata
- [ ] No breaking changes to existing APIs


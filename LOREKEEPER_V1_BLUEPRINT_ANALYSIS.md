# LoreKeeper v1 Blueprint Analysis & Implementation Plan

## Executive Summary

**Current State**: LoreKeeper has a solid foundation with embeddings, semantic search, and pattern detection, but needs refactoring to align with the v1 blueprint's core intelligence system.

**Phase 1 Readiness**: ~70% - Core infrastructure exists, needs consolidation and persona control.

---

## 1. ENTRY MODEL ANALYSIS

### ✅ What Exists
- `journal_entries` table with: `id`, `user_id`, `content`, `date`, `tags[]`, `mood`, `summary`, `source`, `embedding`, `metadata`
- Embeddings column (`vector(1536)`) with pgvector index
- `chapter_id` foreign key (but not `arc_id` directly)

### ❌ What's Missing (Blueprint Requirements)
- `emotions: string[]` - Currently only `mood: string` (single value)
- `themes: string[]` - Partially covered by `tags[]`, but not explicitly themes
- `people: string[]` - Stored in `character_memories` join table, not on entry
- `arc_id` - Stored in `metadata.arc_id`, not as direct column
- `belief_snapshot: string` - Not present

### 📋 Recommendations

**Option A: Minimal (Recommended for Phase 1)**
- Keep current structure
- Extract `emotions[]`, `themes[]`, `people[]` from content via AI on entry creation
- Store in `metadata` JSONB field (already flexible)
- Use `metadata.arc_id` for arc assignment (already exists)

**Option B: Schema Extension**
```sql
ALTER TABLE journal_entries 
  ADD COLUMN emotions TEXT[] DEFAULT '{}',
  ADD COLUMN themes TEXT[] DEFAULT '{}',
  ADD COLUMN people TEXT[] DEFAULT '{}',
  ADD COLUMN arc_id UUID REFERENCES timeline_arcs(id),
  ADD COLUMN belief_snapshot TEXT;
```

**Decision**: Use **Option A** for Phase 1. The `metadata` field is flexible enough, and we can migrate to explicit columns later if needed.

---

## 2. PATTERN ENGINE ANALYSIS

### ✅ What Exists
- Multiple pattern detection services:
  - `patternAnalyzer.ts` - General entry patterns
  - `emotionalIntelligence/patterns.ts` - Emotional patterns
  - `financial/patternDetector.ts` - Money mindset patterns
  - `decisions/patternDetector.ts` - Decision patterns
  - `chronology/patternDetector.ts` - Temporal patterns
  - Python `lorekeeper/intervention/patterns.py` - Basic pattern detection

### ❌ What's Missing
- **Unified Pattern Engine** as described in blueprint
- Centralized pattern storage/retrieval
- Pattern confidence scoring
- Pattern → entry linkage

### 📋 Recommendations

**Create Unified Pattern Engine** (`apps/server/src/services/patternEngine/`):

```typescript
// apps/server/src/services/patternEngine/patternEngine.ts
export type PatternType = 'recurrence' | 'correlation' | 'cycle';
export type Pattern = {
  id: string;
  user_id: string;
  pattern_type: PatternType;
  description: string;
  supporting_entry_ids: string[];
  confidence_score: number;
  detected_at: string;
  metadata: Record<string, unknown>;
};

export class PatternEngine {
  async detectPatterns(userId: string, lookbackDays: number = 90): Promise<Pattern[]>
  async getPatternsForEntry(entryId: string): Promise<Pattern[]>
  async getWeeklySummary(userId: string): Promise<PatternSummary>
}
```

**Database Schema**:
```sql
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('recurrence', 'correlation', 'cycle')),
  description TEXT NOT NULL,
  supporting_entry_ids UUID[] NOT NULL,
  confidence_score FLOAT NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX patterns_user_id_idx ON patterns(user_id);
CREATE INDEX patterns_entry_ids_idx ON patterns USING GIN(supporting_entry_ids);
```

**Integration**: Refactor existing pattern detectors to use this unified engine.

---

## 3. LORE ARCS ANALYSIS

### ✅ What Exists
- `timeline_arcs` table (part of 9-layer hierarchy)
- `metadata.arc_id` on entries (stored in JSONB)
- Arc assignment logic in `timelineAssignmentService.ts`

### ❌ What's Missing (Blueprint Requirements)
- Simple "Lore Arc" concept (not tied to complex hierarchy)
- `protagonist_state`, `antagonists`, `allies`, `core_belief_at_time` fields
- Direct `entry.arc_id` foreign key
- Arc summary generation
- "Lessons learned" / "What changed" outputs

### 📋 Recommendations

**Option A: Extend Existing `timeline_arcs` Table**
```sql
ALTER TABLE timeline_arcs
  ADD COLUMN protagonist_state TEXT,
  ADD COLUMN antagonists JSONB DEFAULT '[]',
  ADD COLUMN allies JSONB DEFAULT '[]',
  ADD COLUMN core_belief_at_time TEXT;
```

**Option B: Create Separate `lore_arcs` Table** (Recommended)
```sql
CREATE TABLE lore_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  protagonist_state TEXT,
  antagonists JSONB DEFAULT '[]',
  allies JSONB DEFAULT '[]',
  core_belief_at_time TEXT,
  summary TEXT,
  lessons_learned TEXT,
  what_changed TEXT,
  what_persisted TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE journal_entries
  ADD COLUMN lore_arc_id UUID REFERENCES lore_arcs(id);
```

**Decision**: Use **Option B** for Phase 1. Keep it simple and separate from the complex timeline hierarchy. Users can manually create arcs and link entries.

---

## 4. AI PERSONAS ANALYSIS

### ✅ What Exists
- Multi-persona system in `omegaChatService.ts`:
  - Therapist
  - Strategist
  - Biography Writer
  - Soul Capturer
  - Gossip Buddy
- Persona blending (automatic based on context)

### ❌ What's Missing (Blueprint Requirements)
- **Archivist persona** (strict read-only mode)
- **Persona control/selection** (user can't choose persona)
- Strict mode enforcement (personas blend automatically)

### 📋 Recommendations

**Implement Persona Control System**:

1. **Add Persona Selection**:
```typescript
// apps/server/src/services/persona/personaController.ts
export type PersonaMode = 
  | 'archivist'      // Read-only, factual recall
  | 'therapist'      // Emotional support
  | 'strategist'     // Goal-oriented
  | 'biography'      // Narrative crafting
  | 'soul_capturer'  // Essence tracking
  | 'gossip_buddy'   // Relationship focus
  | 'auto';          // Current blending behavior

export class PersonaController {
  async setPersona(userId: string, persona: PersonaMode): Promise<void>
  async getPersona(userId: string): Promise<PersonaMode>
  buildSystemPrompt(persona: PersonaMode, context: ChatContext): string
}
```

2. **Archivist Persona Implementation**:
```typescript
const ARCHIVIST_PROMPT = `
You are the Archivist. Your role is STRICT:

- You can ONLY retrieve, summarize, and reference past entries
- NO advice, NO interpretation beyond factual recall
- NO emotional support, NO strategic guidance
- When asked "what happened", cite specific entries with dates
- When asked "when did X happen", search entries and report findings
- If user asks for advice, respond: "As the Archivist, I can only recall facts. Would you like me to search your entries for similar past experiences?"

Your responses must be:
- Factual and observational
- Cite entry dates and content
- No judgment, no suggestions
- Pure information retrieval
`;
```

3. **Database Schema**:
```sql
CREATE TABLE user_persona_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  active_persona TEXT NOT NULL DEFAULT 'auto',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

4. **UI Integration**: Add persona selector to chat interface.

---

## 5. MEMORY RECALL ENGINE ANALYSIS

### ✅ What Exists
- `semanticSearchEntries()` in `memoryService.ts`
- `match_journal_entries()` SQL function
- Embeddings infrastructure
- `MemoryRetriever` class

### ❌ What's Missing (Blueprint Requirements)
- Natural language query interface ("When was the last time I felt like this?")
- Cross-reference with emotions, arcs, outcomes
- Contextual summary generation
- Pattern linkage in results

### 📋 Recommendations

**Create Memory Recall Engine** (`apps/server/src/services/memoryRecall/`):

```typescript
// apps/server/src/services/memoryRecall/memoryRecallEngine.ts
export type MemoryRecallQuery = {
  query: string;  // "When was the last time I felt like this?"
  filters?: {
    emotions?: string[];
    arc_id?: string;
    date_range?: { start: string; end: string };
  };
};

export type MemoryRecallResult = {
  entries: MemoryEntry[];
  contextual_summary: string;
  pattern_linkage?: Pattern[];
  similarity_scores: number[];
};

export class MemoryRecallEngine {
  async recall(userId: string, query: MemoryRecallQuery): Promise<MemoryRecallResult>
  
  private async interpretQuery(query: string): Promise<{
    semantic_embedding: number[];
    extracted_emotions?: string[];
    extracted_themes?: string[];
  }>
  
  private async crossReference(
    entries: MemoryEntry[],
    emotions?: string[],
    arc_id?: string
  ): Promise<MemoryRecallResult>
}
```

**Implementation Steps**:
1. Use LLM to interpret natural language queries
2. Extract emotions/themes from query
3. Semantic search with embeddings
4. Filter by emotions/arcs if specified
5. Generate contextual summary
6. Link to patterns if found

**API Endpoint**:
```typescript
POST /api/memory-recall/query
{
  "query": "When was the last time I felt anxious about work?",
  "filters": {
    "emotions": ["anxious"],
    "date_range": { "start": "2024-01-01", "end": "2025-01-01" }
  }
}
```

---

## 6. DATA FLOW ANALYSIS

### Current Flow
```
Entry Creation → Auto-tagging → Embedding → Storage
                ↓
         Pattern Detection (scattered)
                ↓
         Timeline Assignment
                ↓
         Chat RAG (uses embeddings)
```

### Blueprint Flow
```
Entries → Tag Extraction → Pattern Engine
Entries → Arc Assignment → Arc Summaries
Entries + Tags + Arcs → Memory Recall
Memory Recall + Persona → User Response
```

### 📋 Recommendations

**Refactor to Blueprint Flow**:

1. **Entry Creation Pipeline**:
```typescript
// apps/server/src/services/entryPipeline/entryPipeline.ts
export class EntryPipeline {
  async processEntry(userId: string, content: string): Promise<ProcessedEntry> {
    // 1. Extract tags, emotions, themes, people
    const extracted = await this.extractComponents(content);
    
    // 2. Generate embedding
    const embedding = await embeddingService.embedText(content);
    
    // 3. Suggest arc assignment
    const arcSuggestion = await this.suggestArc(userId, extracted);
    
    // 4. Store entry
    const entry = await memoryService.saveEntry({
      ...extracted,
      embedding,
      metadata: { arc_id: arcSuggestion?.id }
    });
    
    // 5. Trigger pattern detection (async)
    patternEngine.detectPatterns(userId).catch(console.error);
    
    return entry;
  }
}
```

2. **Memory Recall Integration**:
```typescript
// In chat service
const recallResult = await memoryRecallEngine.recall(userId, {
  query: userMessage,
  filters: { emotions: extractedEmotions }
});

// Use recallResult in RAG context
```

---

## PHASE 1 IMPLEMENTATION PLAN

### Priority 1: Core Infrastructure (Week 1-2)

1. **Entry Model Extension**
   - [ ] Add emotion extraction to entry pipeline
   - [ ] Add theme extraction to entry pipeline
   - [ ] Store in `metadata` (emotions, themes, people arrays)
   - [ ] Ensure all entries have embeddings

2. **Archivist Persona**
   - [ ] Create `PersonaController` service
   - [ ] Implement Archivist prompt
   - [ ] Add persona selection to user settings
   - [ ] Update chat service to respect persona mode
   - [ ] Add UI persona selector

3. **Basic Memory Recall**
   - [ ] Create `MemoryRecallEngine`
   - [ ] Implement natural language query interpretation
   - [ ] Add cross-referencing with emotions
   - [ ] Create API endpoint `/api/memory-recall/query`
   - [ ] Add UI for memory recall queries

### Priority 2: Pattern & Arc Foundation (Week 3-4)

4. **Unified Pattern Engine**
   - [ ] Create `patterns` table
   - [ ] Create `PatternEngine` service
   - [ ] Refactor existing pattern detectors to use unified engine
   - [ ] Add pattern → entry linkage
   - [ ] Create weekly pattern summary endpoint

5. **Lore Arcs (Simple)**
   - [ ] Create `lore_arcs` table
   - [ ] Add `lore_arc_id` to `journal_entries`
   - [ ] Create arc management service
   - [ ] Add manual arc creation UI
   - [ ] Add entry → arc linking UI

### Priority 3: Integration & Polish (Week 5-6)

6. **Data Flow Integration**
   - [ ] Refactor entry pipeline to use new flow
   - [ ] Integrate pattern engine into entry creation
   - [ ] Integrate memory recall into chat
   - [ ] Add arc summaries generation

7. **Testing & Documentation**
   - [ ] Test all Phase 1 features
   - [ ] Document API endpoints
   - [ ] Create user guide for new features

---

## MIGRATION STRATEGY

### Backward Compatibility
- Keep existing `journal_entries` structure
- Use `metadata` JSONB for new fields initially
- Gradually migrate to explicit columns if needed

### Data Migration
- Extract emotions/themes from existing entries (optional, can be done on-demand)
- Generate embeddings for entries missing them (background job)
- Link existing entries to arcs (manual or AI-suggested)

---

## NON-GOALS (Already Met)
- ✅ No social feed (private by design)
- ✅ No public sharing (RLS enforced)
- ✅ No generic AI advice (persona-controlled)

---

## SUCCESS METRICS

**Phase 1 Success Criteria**:
1. User can select "Archivist" persona and get read-only factual recall
2. User can ask "When was the last time I felt X?" and get relevant entries
3. System detects and surfaces recurring patterns weekly
4. User can create a Lore Arc and link entries to it
5. All new entries have embeddings and extracted emotions/themes

**Long-term Success**:
- "This remembers me better than I do" - Memory recall accuracy
- "I can't replace this with another app" - Unique pattern/arc insights
- "Time spent here compounds in value" - Increasing pattern confidence over time

---

## FILES TO CREATE/MODIFY

### New Files
- `apps/server/src/services/patternEngine/patternEngine.ts`
- `apps/server/src/services/patternEngine/types.ts`
- `apps/server/src/services/persona/personaController.ts`
- `apps/server/src/services/persona/archivistPrompt.ts`
- `apps/server/src/services/memoryRecall/memoryRecallEngine.ts`
- `apps/server/src/services/memoryRecall/types.ts`
- `apps/server/src/services/entryPipeline/entryPipeline.ts`
- `apps/server/src/services/loreArcs/loreArcService.ts`
- `migrations/YYYYMMDD_pattern_engine.sql`
- `migrations/YYYYMMDD_lore_arcs.sql`
- `migrations/YYYYMMDD_persona_settings.sql`

### Modified Files
- `apps/server/src/services/memoryService.ts` - Add emotion/theme extraction
- `apps/server/src/services/omegaChatService.ts` - Integrate persona controller
- `apps/server/src/routes/chat.ts` - Add persona selection
- `apps/web/src/components/chat/ChatInterface.tsx` - Add persona selector
- `apps/web/src/components/memory-recall/MemoryRecallPanel.tsx` - New component

---

## NEXT STEPS

1. **Review this analysis** with team
2. **Prioritize Phase 1 tasks** based on user needs
3. **Create GitHub issues** for each task
4. **Start with Entry Model Extension** (foundation for everything else)
5. **Implement Archivist Persona** (quick win, demonstrates persona control)

---

**Last Updated**: 2025-01-XX
**Status**: Ready for Implementation


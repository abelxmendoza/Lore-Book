# 4-Mode Router System Implementation

## Overview

Complete implementation of a unified mode router that routes every chat message to one of 4 distinct modes BEFORE any processing. This ensures the system knows which mode it's in before responding, separating concerns cleanly.

## Architecture

The system follows this flow:

```
User Message → Mode Router → Mode Handler → Response
```

### 4 Modes

1. **EMOTIONAL_EXISTENTIAL** - Thoughts, fears, insecurities (no memory check)
2. **MEMORY_RECALL** - Factual questions ("what did I eat?", "when did X?")
3. **NARRATIVE_RECALL** - Complex story questions ("what happened with X?")
4. **EVENT_INGESTION** - Journaling/dumping events (capture first, interpret later)

## Implementation Details

### 1. Mode Router Service

**File**: `apps/server/src/services/modeRouter/modeRouterService.ts`

- Fast pattern-based detection (<50ms)
- LLM-based classification for ambiguous cases (<300ms)
- Returns `ModeRoutingResult` with mode, confidence, reasoning
- Handles `MIXED` and `UNKNOWN` modes

**Pattern Detection**:
- EVENT_INGESTION: Long messages (>300 chars), past-tense, narrative structure
- MEMORY_RECALL: Specific factual questions
- NARRATIVE_RECALL: Story questions
- EMOTIONAL_EXISTENTIAL: Short messages (<200 chars), present-tense, emotional

### 2. Mode Handlers

**File**: `apps/server/src/services/modeRouter/modeHandlers.ts`

#### Emotional/Existential Handler
- Uses `thoughtOrchestrationService.processThought()`
- NO memory check - just classification + response
- Response posture: reflect, clarify, stabilize, reframe

#### Memory Recall Handler
- Uses `memoryRecallEngine.executeRecall()` with ARCHIVIST persona
- Hard rule: If doesn't know, returns explicit silence message
- Low confidence (<0.5) returns: "I don't have a clear record of that. If you want, you can tell me now and I'll remember it."

#### Narrative Recall Handler
- Uses `storyAccountService.getStoryAccounts()`
- Retrieves all accounts of a story/event
- Groups by perspective: at_the_time, others_perspective, later_interpretation
- Builds multi-layered response showing different perspectives

#### Event Ingestion Handler
- Minimal acknowledgment: "Got it. I'm capturing this."
- Fire-and-forget event extraction (non-blocking)
- Uses `eventExtractionService.extractEventStructure()`

### 3. Story Account Service

**File**: `apps/server/src/services/storyAccount/storyAccountService.ts`

- `getStoryAccounts(userId, storyName)` - Retrieve all accounts
- `groupByPerspective(accounts)` - Group by account_type
- `buildNarrativeResponse(accounts)` - Build multi-layered response
- Extracts story name from message using patterns + LLM

### 4. Event Extraction Service

**File**: `apps/server/src/services/eventExtraction/eventExtractionService.ts`

- Extracts structured event data from journaling messages
- Creates `event_records` entries (date, location, participants, tags)
- Creates `narrative_accounts` entries (at_the_time perspective)
- Extracts emotions → `event_emotions` table
- Extracts cognitions → `event_cognitions` table
- Extracts identity impacts → `event_identity_impacts` table
- Uses LLM for structured extraction with schema

### 5. Database Schema

**File**: `migrations/20250324_mode_router_events.sql`

**Tables Created**:
- `event_records` - Factual event layer
- `narrative_accounts` - Perspective layer
- `event_emotions` - Emotional layer
- `event_cognitions` - Cognitive layer
- `event_identity_impacts` - Identity impact

All tables include RLS policies, indexes, and foreign keys.

### 6. Integration with omegaChatService

**File**: `apps/server/src/services/omegaChatService.ts`

**Changes**:
- Mode router added as FIRST gate (before recall gate)
- Routes to appropriate handler based on mode
- For UNKNOWN mode, falls through to existing chat flow
- Preserves streaming response format
- Adds mode metadata to response

**Integration Point** (line ~1213):
```typescript
// MODE ROUTER (NEW - FIRST GATE)
const routing = await modeRouterService.routeMessage(userId, message, conversationHistory);

if (routing.mode !== 'UNKNOWN') {
  // Route to handler and return response
}
// Fall through to existing flow for UNKNOWN
```

### 7. Response Formatter

**File**: `apps/server/src/services/modeRouter/responseFormatter.ts`

- Converts handler responses to `StreamingChatResponse` format
- Ensures all modes return consistent structure
- Adds mode metadata to response
- Handles silence responses properly

## Key Design Decisions

1. **Router First**: Mode is determined BEFORE any processing (no mixing concerns)
2. **Explicit Silence**: "I don't know" is a valid, explicit response
3. **Events Before Interpretation**: Ingestion mode captures structure first, interpretation later
4. **Multiple Truths**: Narrative accounts preserve different perspectives
5. **Non-Blocking**: Event extraction is fire-and-forget, doesn't slow chat
6. **Backward Compatible**: UNKNOWN mode falls through to existing chat flow

## Usage Examples

### Example 1: Emotional/Existential

**Input**: "I feel behind"

**Routing**: `EMOTIONAL_EXISTENTIAL` (confidence: 0.8)

**Handler**: Thought classification → Response posture: clarify

**Response**: "Behind who — people from high school, or where you thought you'd be by now?"

### Example 2: Memory Recall

**Input**: "What did I eat last Sunday morning?"

**Routing**: `MEMORY_RECALL` (confidence: 0.9)

**Handler**: Memory recall engine → ARCHIVIST persona

**Response**: "I don't have a clear record of that. If you want, you can tell me now and I'll remember it." (if not found)

### Example 3: Narrative Recall

**Input**: "What happened with Punk Rock Fight Club?"

**Routing**: `NARRATIVE_RECALL` (confidence: 0.85)

**Handler**: Story account service → Multiple perspectives

**Response**: "Yes. There are multiple layers to that story.\n\nAt the time, you experienced it as: X\n\nOthers involved described it as: Y\n\nLater, you interpreted it as: Z\n\nDo you want the short version, the full account, or a specific angle?"

### Example 4: Event Ingestion

**Input**: "I just got home, here's everything that happened..."

**Routing**: `EVENT_INGESTION` (confidence: 0.85)

**Handler**: Event extraction (async) → Minimal acknowledgment

**Response**: "Got it. I'm capturing this."

## Files Created

1. `apps/server/src/services/modeRouter/modeRouterService.ts`
2. `apps/server/src/services/modeRouter/modeHandlers.ts`
3. `apps/server/src/services/modeRouter/responseFormatter.ts`
4. `apps/server/src/services/storyAccount/storyAccountService.ts`
5. `apps/server/src/services/eventExtraction/eventExtractionService.ts`
6. `migrations/20250324_mode_router_events.sql`

## Files Modified

1. `apps/server/src/services/omegaChatService.ts` - Added mode router integration

## Testing

To test the implementation:

1. **Run Migration**:
   ```bash
   psql -d your_database -f migrations/20250324_mode_router_events.sql
   ```

2. **Test Mode Detection**:
   - Emotional: "I feel behind" → Should route to EMOTIONAL_EXISTENTIAL
   - Memory: "What did I eat?" → Should route to MEMORY_RECALL
   - Narrative: "What happened with X?" → Should route to NARRATIVE_RECALL
   - Ingestion: Long past-tense narrative → Should route to EVENT_INGESTION

3. **Test Handlers**:
   - Each handler should return appropriate response
   - Event ingestion should extract and store event structure
   - Memory recall should return silence if not found

## Notes

- All services are non-blocking where possible
- Event extraction is fire-and-forget
- Mode router is fast (<100ms pattern, <300ms with LLM)
- UNKNOWN mode preserves existing chat behavior
- All tables include RLS for security

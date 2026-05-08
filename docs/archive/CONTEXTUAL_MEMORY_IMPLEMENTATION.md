# Contextual Memory Implementation

## Overview

This implementation adds three key services that enable the system to:
1. **Link events to previous stories** - Connect current events to related past events (e.g., "tia lourdes at post acute center" → "abuelo's West Nile virus story")
2. **Resolve ambiguous references** - Automatically resolve references like "the kids" to specific characters (e.g., "the kids" → Michael + Luis)
3. **Build household knowledge** - Learn who lives where over time from conversations

## Services

### 1. ContextualEventLinker (`contextualEventLinker.ts`)

**Purpose**: Links current events to previous related stories/context.

**How it works**:
- Searches past events for:
  - Same people (overlapping character IDs)
  - Related locations (medical facilities, hospitals, etc.)
  - Semantic similarity (health, illness, care themes)
- Creates `event_continuity_links` in the database
- Generates human-readable explanations for the links

**Example**:
```
Input: "tia lourdes is at the post acute center with abuelo"
→ Finds past event: "abuelo got West Nile virus in September"
→ Creates link: "This relates to abuelo's previous health event. The current situation is likely a continuation of that story."
```

**Integration**: Called after event assembly in `ingestionPipeline.ts` (Step 12.5)

### 2. HouseholdKnowledgeService (`householdKnowledgeService.ts`)

**Purpose**: Builds and tracks household membership over time.

**How it works**:
- Extracts household information from messages using LLM
- Identifies:
  - Household locations ("grandma's house", "my house")
  - Household members (who lives there, who stays there)
  - Ambiguous references ("the kids", "everyone")
- Stores household metadata in character records
- Updates aliases for household members

**Example**:
```
Input: "the kids are in the room they stay at my grandma's house"
→ Extracts: household = "grandma's house", members = ["Michael", "Luis"]
→ Updates character metadata: { households: [{ name: "grandma's house", relationship: "lives with" }] }
→ Adds alias: "the kids" → [Michael, Luis]
```

**Integration**: Called early in `ingestionPipeline.ts` (Step 2) before entity extraction

### 3. ContextualEntityResolver (`contextualEntityResolver.ts`)

**Purpose**: Resolves ambiguous references using context.

**How it works**:
- Uses multiple resolution methods (in order of preference):
  1. **Household context** - Checks household membership
  2. **Previous conversations** - Searches chat history for previous uses
  3. **Alias matching** - Checks existing character aliases
  4. **LLM inference** - Uses full context to infer resolution
- Updates character aliases when resolution is successful

**Example**:
```
Input: "the kids" + context: { location: "at my grandma's house" }
→ Method 1: Checks household members at "grandma's house"
→ Finds: Michael and Luis
→ Resolves: "the kids" → [Michael, Luis]
→ Updates aliases: Adds "the kids" to both characters' alias arrays
```

**Integration**: Called during household knowledge extraction in `ingestionPipeline.ts` (Step 2)

## Data Flow

```
User Message
    ↓
Step 2: Extract Household Knowledge
    ├─→ HouseholdKnowledgeService.extractHouseholdInfo()
    ├─→ Update character metadata with household info
    └─→ ContextualEntityResolver.resolveAmbiguousReference()
         └─→ Update character aliases
    ↓
Step 3-11: Normal Pipeline (utterances, entities, semantic units, etc.)
    ↓
Step 12: Event Assembly
    ├─→ eventAssemblyService.assembleEvents()
    └─→ Step 12.5: ContextualEventLinker.linkToPreviousContext()
         └─→ Create event_continuity_links
```

## Database Changes

### Character Metadata
Characters now store household information in `metadata`:
```json
{
  "households": [
    {
      "name": "grandma's house",
      "relationship": "lives with",
      "confidence": 0.8
    }
  ],
  "aliases_learned_from_context": true,
  "last_household_update": "2024-01-15T10:30:00Z",
  "last_alias_update": "2024-01-15T10:30:00Z"
}
```

### Event Continuity Links
New links are created in `event_continuity_links` table:
- `current_event_id` → Current event
- `past_event_id` → Related past event
- `continuity_type` → "CONTINUATION" (for now)
- `metadata.reason` → Human-readable explanation

## Usage Examples

### Example 1: Linking Events

**User says**: "tia lourdes is at the post acute center with abuelo"

**System processes**:
1. Creates journal entry for current event
2. Assembles event: "tia lourdes visits abuelo at post acute center"
3. Searches past events for:
   - Same people: abuelo
   - Related locations: hospital, medical facility
   - Health themes: virus, illness, brain damage
4. Finds: "abuelo got West Nile virus in September"
5. Creates link with explanation: "This relates to abuelo's previous health event. The current situation is likely a continuation of that story."

### Example 2: Resolving "the kids"

**User says**: "the kids are in the room they stay at my grandma's house"

**System processes**:
1. Extracts household: "grandma's house"
2. Identifies ambiguous reference: "the kids"
3. Resolves using household context:
   - Gets household members at "grandma's house"
   - Finds: Michael and Luis
   - Resolves: "the kids" → [Michael, Luis]
4. Updates character aliases:
   - Michael: aliases = ["the kids", "Angel", "Michael"]
   - Luis: aliases = ["the kids"]
5. Stores household membership in character metadata

**Future messages**: When user says "the kids", system automatically resolves to Michael + Luis

### Example 3: Learning Over Time

**First conversation**:
- User: "Michael and Luis live with us at grandma's house"
- System: Learns household membership, stores in metadata

**Later conversation**:
- User: "the kids are playing outside"
- System: Resolves "the kids" → Michael + Luis (using household context)

**Even later**:
- User: "the kids" (in any context)
- System: Resolves using alias match (fastest method)

## Configuration

### Thresholds
- **Household confidence**: 0.8 (default)
- **Entity resolution confidence**: 0.7 (minimum for acceptance)
- **Semantic similarity threshold**: 0.7 (for event linking)
- **Health keyword matching**: Case-insensitive substring match

### Fallbacks
- If semantic RPC (`match_resolved_events`) doesn't exist, falls back to keyword-based search
- If household extraction fails, continues without household context
- If entity resolution fails, continues without resolution (doesn't block pipeline)

## Future Enhancements

1. **Multi-household support**: Track multiple households per character
2. **Household relationships**: Learn family relationships from household context
3. **Temporal household changes**: Track when people move in/out
4. **Event explanation generation**: Use LLM to generate more detailed explanations
5. **Confidence decay**: Reduce confidence for old household information
6. **Household entity creation**: Create explicit "household" entities in database

## Testing

To test the implementation:

1. **Test event linking**:
   - Create an event about a health issue
   - Later mention related health event
   - Check `event_continuity_links` table for link

2. **Test household resolution**:
   - Mention "the kids" with household context
   - Check character aliases are updated
   - Mention "the kids" again (should resolve automatically)

3. **Test household learning**:
   - Mention household members in different ways
   - Check character metadata for household info
   - Verify ambiguous references resolve correctly

## Files Modified

- `apps/server/src/services/conversationCentered/contextualEventLinker.ts` (NEW)
- `apps/server/src/services/conversationCentered/householdKnowledgeService.ts` (NEW)
- `apps/server/src/services/conversationCentered/contextualEntityResolver.ts` (NEW)
- `apps/server/src/services/conversationCentered/ingestionPipeline.ts` (MODIFIED)

## Dependencies

- OpenAI API (for LLM-based extraction and resolution)
- Supabase (for database operations)
- Existing services:
  - `embeddingService` (for semantic search)
  - `narrativeContinuityService` (for continuity link creation)
  - `eventAssemblyService` (for event assembly)

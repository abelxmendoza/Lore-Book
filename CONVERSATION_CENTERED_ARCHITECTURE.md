# Conversation-Centered Memory Architecture

## Overview

This architecture treats **chat threads as the ONLY primary input**. All structure (events, decisions, insights, truth) is **DERIVED** from messy conversational data.

## Core Principles

1. **User only creates conversations** - No manual memory/event creation
2. **Conversations are never "wrong"** - Grammar, spelling, contradictions allowed
3. **System extracts structure AFTER the fact** - All structure is derived
4. **Sloppy input is expected and respected** - Normalization handles cleanup

## Data Flow

```
User Message (raw, messy)
  ↓
Message Saved (conversation_messages)
  ↓
Split into Utterances (sentences/phrases)
  ↓
Normalize Text (spelling, abbreviations, slang)
  ↓
Extract Semantic Units (EXPERIENCE, FEELING, THOUGHT, etc.)
  ↓
Detect Contradictions
  ↓
Enqueue for Memory Review (if needed)
  ↓
Assemble Events (from EXPERIENCE units)
  ↓
Link Everything Back to Source Messages
```

## Data Models

### Primary (User-Facing)

- **ConversationThread** (`conversation_sessions`)
  - User's chat threads
  - Has scope (PRIVATE, SHARED, PUBLIC)
  - Auto-generated titles

- **Message** (`conversation_messages`)
  - Raw chat messages (USER or AI)
  - Unfiltered, unprocessed
  - Preserves original text

### Internal (Hidden)

- **Utterance** (`utterances`)
  - Normalized text units from messages
  - Cleaned, corrected, but preserves meaning
  - Links back to message

- **ExtractedUnit** (`extracted_units`)
  - Semantic units extracted from utterances
  - Types: EXPERIENCE, FEELING, THOUGHT, PERCEPTION, CLAIM, DECISION, CORRECTION
  - Has confidence, temporal context, entity links

### Derived (Read-Only)

- **Event** (`resolved_events`)
  - Assembled from multiple EXPERIENCE units
  - WHO + WHERE + WHAT + WHEN structure
  - Links back to source units → messages

## Services

### 1. NormalizationService
- Cleans text (spelling, abbreviations, slang)
- Preserves original meaning
- Splits into utterances

### 2. SemanticExtractionService
- Extracts semantic units from normalized text
- Rule-based (free, fast) + LLM fallback (complex cases)
- Classifies: EXPERIENCE, FEELING, THOUGHT, PERCEPTION, CLAIM, DECISION, CORRECTION

### 3. ConversationIngestionPipeline
- Main pipeline orchestrator
- Processes messages through full pipeline
- Handles contradiction detection
- Enqueues for memory review

### 4. EventAssemblyService
- Assembles structured events from EXPERIENCE units
- Groups by WHO/WHERE/WHEN
- Creates resolved_events
- Links back to source units

## API Endpoints

- `POST /api/conversation/ingest` - Ingest a message
- `POST /api/conversation/assemble-events` - Assemble events from units
- `GET /api/conversation/threads` - Get all threads
- `GET /api/conversation/threads/:id/messages` - Get messages in thread
- `GET /api/conversation/threads/:id/units` - Get extracted units from thread

## Integration Points

### Chat Service Integration

The chat service should call the ingestion pipeline after saving messages:

```typescript
// After saving message
await conversationIngestionPipeline.ingestMessage(
  userId,
  threadId,
  'USER',
  rawText,
  conversationHistory
);
```

### Event Assembly

Events are assembled periodically or on-demand:

```typescript
// Assemble events from all EXPERIENCE units
await eventAssemblyService.assembleEvents(userId);
```

## Next Steps

1. ✅ Database migration created
2. ✅ Types defined
3. ✅ Services implemented
4. ✅ API routes created
5. ⏳ Integrate with chat service
6. ⏳ Create Conversations view component
7. ⏳ Update Memory Explorer to show derived events
8. ⏳ Add chronological sorting
9. ⏳ Implement time-keeping system enhancements

## Migration

Run the migration:
```bash
psql -d your_database -f migrations/20250106_conversation_centered_memory.sql
```

## Testing

Test the ingestion pipeline:
```bash
curl -X POST http://localhost:3000/api/conversation/ingest \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "thread-uuid",
    "sender": "USER",
    "raw_text": "I went to the store yesterday and felt really happy about it."
  }'
```


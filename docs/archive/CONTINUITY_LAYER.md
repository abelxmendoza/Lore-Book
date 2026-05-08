# LORE-KEEPER EXPLAINABILITY & META CONTINUITY LAYER

## Overview

The **Continuity Layer** makes every engine output auditable, reversible, and traceable with human-friendly explanations. Every system action becomes a "Continuity Card" that users can inspect, understand, and potentially reverse.

## Core Concepts

### Continuity Events
Every significant system action generates a **Continuity Event** that includes:
- **Type**: What happened (e.g., CLAIM_CREATED, ENTITY_MERGED)
- **Explanation**: Human-readable summary
- **Context**: Full context of the original input + metadata
- **Related IDs**: Links to affected claims, entities, locations
- **Severity**: INFO, WARNING, or ALERT
- **Reversible**: Whether the action can be undone

### Reversal Logs
When a reversible event is undone, a **Reversal Log** is created that includes:
- **Before Snapshot**: State before reversal
- **After Snapshot**: State after reversal
- **Reason**: Why it was reversed
- **Timestamp**: When it was reversed

## Event Types

### CLAIM_CREATED
- **Triggered**: When a new claim is created
- **Reversible**: ✅ Yes
- **Context**: Claim data, source text, entity
- **Example**: "Claim created about John Doe from input: 'John is a software engineer'"

### CLAIM_UPDATED
- **Triggered**: When a claim is modified
- **Reversible**: ✅ Yes
- **Context**: Updated claim, previous state, reason
- **Example**: "Claim updated: 'John works at Microsoft'"

### CLAIM_ENDED
- **Triggered**: When a claim is marked inactive
- **Reversible**: ✅ Yes
- **Context**: Ended claim, reason
- **Example**: "Claim ended: 'John worked at Google' (conflict detected)"

### ENTITY_RESOLVED
- **Triggered**: When an entity is found/resolved
- **Reversible**: ❌ No
- **Context**: Entity, resolution method (exact_match, alias_match, semantic_match)
- **Example**: "Entity resolved: John Doe (semantic_match)"

### ENTITY_MERGED
- **Triggered**: When two entities are merged
- **Reversible**: ✅ Yes (complex)
- **Context**: Source entity, target entity, merged claims
- **Example**: "Entity merge: John into John Doe"

### CONTRADICTION_FOUND
- **Triggered**: When conflicting claims are detected
- **Reversible**: ❌ No
- **Context**: Conflicting claims
- **Example**: "Contradiction detected between claim 'John is good' and claim 'John is not good'"

### CONTINUITY_ALERT
- **Triggered**: When system detects an important issue
- **Reversible**: ❌ No
- **Context**: Alert details
- **Example**: "Multiple entities with similar names detected"

### TIMELINE_SEGMENTED
- **Triggered**: When timeline is segmented
- **Reversible**: ❌ No
- **Context**: Entity, segments
- **Example**: "Segmented timeline for John Doe into 5 segments"

### NARRATIVE_TRANSITION
- **Triggered**: When narrative arc changes
- **Reversible**: ✅ Yes
- **Context**: Entity, arc change
- **Example**: "Narrative transition detected for John Doe: hero → mentor"

## API Endpoints

### GET `/api/continuity/events`
List continuity events with optional filters.

**Query Parameters:**
- `type`: Filter by event type
- `severity`: Filter by severity (INFO, WARNING, ALERT)
- `reversible`: Filter by reversible status (true/false)
- `start_date`: Filter by start date (ISO timestamp)
- `end_date`: Filter by end date (ISO timestamp)
- `limit`: Limit results (default: 50)
- `offset`: Pagination offset

**Response:**
```json
{
  "events": [
    {
      "id": "event-123",
      "type": "CLAIM_CREATED",
      "timestamp": "2025-01-02T12:00:00Z",
      "explanation": "Claim created about John Doe...",
      "severity": "INFO",
      "reversible": true,
      "related_claim_ids": ["claim-1"],
      "related_entity_ids": ["entity-1"]
    }
  ]
}
```

### GET `/api/continuity/events/:id`
Get event explanation with related context.

**Response:**
```json
{
  "id": "event-123",
  "timestamp": "2025-01-02T12:00:00Z",
  "type": "CLAIM_CREATED",
  "explanation": "Claim created about John Doe...",
  "context": { ... },
  "reversible": true,
  "related_context": {
    "claims": [ ... ],
    "entities": [ ... ],
    "locations": [ ... ]
  }
}
```

### POST `/api/continuity/events/:id/revert`
Revert a reversible event.

**Request:**
```json
{
  "reason": "User requested reversal"
}
```

**Response:**
```json
{
  "reversal": {
    "id": "reversal-123",
    "event_id": "event-123",
    "reversal_timestamp": "2025-01-02T13:00:00Z",
    "reversed_by": "USER",
    "reason": "User requested reversal",
    "snapshot_before": { ... },
    "snapshot_after": { ... }
  },
  "success": true
}
```

### GET `/api/continuity/events/:id/reversal`
Get reversal log for an event.

**Response:**
```json
{
  "reversal": {
    "id": "reversal-123",
    "event_id": "event-123",
    "reversal_timestamp": "2025-01-02T13:00:00Z",
    "reversed_by": "USER",
    "reason": "User requested reversal",
    "snapshot_before": { ... },
    "snapshot_after": { ... }
  }
}
```

## Integration with OMEGA MEMORY ENGINE

The continuity layer is automatically integrated with the OMEGA MEMORY ENGINE:

- **Claim Creation**: Automatically records when claims are created
- **Contradiction Detection**: Logs when contradictions are found
- **Entity Resolution**: Tracks how entities are resolved
- **Entity Merges**: Records entity merge operations

## UI Contract

### Continuity Cards
Every system action becomes a "Continuity Card" that displays:
- **Icon**: Based on event type
- **Title**: Event explanation (truncated)
- **Timestamp**: When it happened
- **Severity Badge**: Color-coded (INFO = grey, WARNING = amber, ALERT = red)
- **Reversible Badge**: Shows if action can be undone

### Card Expansion
Users can expand a card to see:
- **Full Explanation**: Complete human-readable description
- **Related Context**: Links to affected claims, entities, locations
- **Full Context**: Original input and metadata
- **Reversal Button**: If reversible, shows "Revert" button

### Continuity Timeline
A timeline view sits beside the Memory Explorer showing:
- **Chronological Events**: All events in time order
- **Filtering**: By type, severity, reversible status
- **Search**: Find events by explanation text
- **Grouping**: By date, entity, or type

### Reversal Flow
1. User clicks "Revert" on a reversible event
2. System shows confirmation with reason prompt
3. User provides reason and confirms
4. System creates reversal log and updates state
5. Event is marked as reversed (reversal_id set)
6. User sees updated state and reversal log

## Database Schema

### continuity_events
- `id`: UUID (primary key)
- `user_id`: UUID (foreign key to auth.users)
- `type`: Event type (enum)
- `timestamp`: When event occurred
- `context`: Full context (JSONB)
- `explanation`: Human-readable summary
- `related_claim_ids`: Array of claim UUIDs
- `related_entity_ids`: Array of entity UUIDs
- `related_location_ids`: Array of location UUIDs
- `initiated_by`: SYSTEM, USER, or AI
- `severity`: INFO, WARNING, or ALERT
- `reversible`: Boolean
- `reversal_id`: UUID (if reversed)

### reversal_logs
- `id`: UUID (primary key)
- `user_id`: UUID (foreign key)
- `event_id`: UUID (foreign key to continuity_events)
- `reversal_timestamp`: When reversal occurred
- `reversed_by`: USER or SYSTEM
- `reason`: Why it was reversed
- `snapshot_before`: State before reversal (JSONB)
- `snapshot_after`: State after reversal (JSONB)

## Usage Examples

### Recording a Claim Creation
```typescript
// Automatically called by omegaMemoryService
await continuityService.recordClaimCreation(
  userId,
  claim,
  sourceText,
  entity
);
```

### Recording a Contradiction
```typescript
// Automatically called when conflict detected
await continuityService.recordContradiction(
  userId,
  claimA,
  claimB
);
```

### Reverting an Event
```typescript
const reversalLog = await continuityService.revertEvent(
  userId,
  eventId,
  "User requested reversal"
);
```

### Getting Event Explanation
```typescript
const explanation = await continuityService.explainEvent(
  eventId,
  userId
);
// Returns full explanation with related context
```

## Design Principles

1. **Auditability**: Every action is logged and traceable
2. **Reversibility**: Reversible actions can be undone
3. **Explainability**: Human-friendly explanations for all events
4. **Context Preservation**: Full context saved for future reference
5. **User Control**: Users can inspect and reverse their actions

## Future Enhancements

1. **Event Grouping**: Group related events together
2. **Event Search**: Full-text search across explanations
3. **Event Analytics**: Statistics on event types and patterns
4. **Bulk Reversal**: Reverse multiple events at once
5. **Event Templates**: Pre-defined explanations for common events
6. **Notification System**: Alert users about important events
7. **Event Export**: Export events for external analysis

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


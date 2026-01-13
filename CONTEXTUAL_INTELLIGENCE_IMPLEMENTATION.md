# Contextual Intelligence Implementation (Phase-Safe)

## Overview

This implementation provides **phase-safe** contextual intelligence that builds hypotheses about relationships, events, and references without corrupting existing memory. All operations are:

- **Confidence-scored** (0.0 - 1.0)
- **Reversible** (stored as metadata, not facts)
- **Metadata-only** (never overwrites IDs or merges entities)

## Core Design Rules

### Hard Invariants

❌ **No entity merging**  
❌ **No event merging**  
❌ **No overwriting IDs**  
❌ **No "facts"** — only hypotheses  
❌ **No response-time authority**

Everything created here is:
- Confidence-scored
- Reversible
- Metadata-only

## Services

### 1. Contextual Event Linker (`contextualEventLinker.ts`)

**Purpose**: Create continuity links between events when context overlaps.

**How it works**:
- Fetches recent events (last 90 days)
- Scores overlap (people, locations, temporal proximity, topic similarity)
- Creates `event_continuity_links` only if confidence >= 0.6
- Never merges events, only creates links

**Example**:
```typescript
await linkContextualEvents(userId, newEventId);
// Returns: EventContinuityLink[]
// Creates links in database with confidence scores
```

**Scoring**:
- People overlap: 40% weight
- Location overlap: 30% weight
- Temporal proximity: 20% weight (decays over 30 days)
- Topic similarity: 10% weight (keyword matching)

### 2. Context-Aware Entity Resolver (`contextAwareEntityResolver.ts`)

**Purpose**: Resolve ambiguous references using local context only.

**Rules**:
- Only resolves if **single dominant candidate**
- Only resolves if **confidence >= 0.7**
- Never auto-applies, only assists resolution

**How it works**:
1. Checks if single candidate in context
2. If multiple, tries to narrow down using:
   - Household context
   - Alias matches
3. Calculates confidence (base 0.5, +0.3 for alias, +0.2 for household, +0.1 for recent mentions)
4. Only returns resolution if confidence >= 0.7

**Example**:
```typescript
const resolution = await resolveAmbiguousEntity(
  userId,
  "the kids",
  [michaelId, luisId],
  { household: "grandma's house" }
);
// Returns: EntityResolutionCandidate | null
// Only if confidence >= 0.7
```

### 3. Household Knowledge Builder (`householdKnowledgeBuilder.ts`)

**Purpose**: Build hypotheses about living arrangements and dependency.

**Rules**:
- Confidence increases with repetition (+0.1 per observation)
- Confidence decays without reinforcement (-0.05 per 30 days)
- Never treated as fact
- Max confidence: 0.8
- Min confidence: 0.2

**How it works**:
- Creates/updates `HouseholdHypothesis` in character metadata
- Stores as `metadata.household_hypotheses[]`
- Confidence increases with evidence
- Confidence decays over time if not reinforced

**Example**:
```typescript
await updateHouseholdHypotheses(userId, {
  subject_entity_id: michaelId,
  related_entity_id: luisId,
  hypothesis_type: 'cohabitation',
  location: "grandma's house"
});
// Returns: HouseholdHypothesis
// Stored in character metadata, not as fact
```

**Hypothesis Types**:
- `cohabitation`: Living together
- `dependency`: One depends on the other
- `caregiver`: One cares for the other

### 4. Alias Learning Service (`aliasLearningService.ts`)

**Purpose**: Learn soft alias mappings like "the kids".

**Rules**:
- Never auto-applies
- Only assists resolution later
- Requires repetition (min 2 observations)
- Minimum confidence for use: 0.5

**How it works**:
- Creates `AliasHypothesis` in character metadata
- Stores as `metadata.alias_hypotheses[]`
- Confidence increases with repetition
- Only used for resolution if confidence >= 0.5 and evidence_count >= 2

**Example**:
```typescript
await learnAlias(
  userId,
  "the kids",
  [michaelId, luisId],
  'household',
  { household: "grandma's house" }
);
// Returns: AliasHypothesis | null
// Stored in metadata, not applied automatically
```

**Scopes**:
- `conversation`: Only valid in current conversation
- `household`: Valid within household context
- `global`: Valid everywhere (requires high confidence)

## Integration

### Integration Point

**Location**: `ingestionPipeline.ts`

**After**: Semantic → Memory conversion (Step 6.7)  
**Before**: Event assembly (Step 12)

### Execution Order

1. **Contextual Event Linker** (after event assembly)
2. **Context-Aware Entity Resolver** (during unit processing)
3. **Household Knowledge Builder** (during unit processing)
4. **Alias Learning** (during unit processing)

### Code Flow

```typescript
// Step 6.8: Contextual Intelligence (Phase-Safe)
// After semantic conversion, before event assembly

// 1. Resolve ambiguous references
const resolution = await resolveAmbiguousEntity(
  userId,
  referenceText,
  unitEntityIds,
  { location, household, recentConversations }
);

// 2. Learn alias if multiple entities
if (unitEntityIds.length >= 2) {
  await learnAlias(userId, referenceText, unitEntityIds, 'household', { location, household });
}

// 3. Build household hypotheses
if (unitEntityIds.length >= 2 && location.includes('house')) {
  await updateHouseholdHypotheses(userId, {
    subject_entity_id: unitEntityIds[i],
    related_entity_id: unitEntityIds[j],
    hypothesis_type: 'cohabitation',
    location,
  });
}

// Step 12.5: Link events (after event assembly)
const links = await linkContextualEvents(userId, eventId);
```

## Data Storage

### Character Metadata

All hypotheses stored in `characters.metadata`:

```json
{
  "household_hypotheses": [
    {
      "hypothesis_type": "cohabitation",
      "subject_entity_id": "uuid",
      "related_entity_id": "uuid",
      "confidence": 0.6,
      "evidence_count": 3,
      "last_observed_at": "2024-01-15T10:30:00Z",
      "first_observed_at": "2024-01-10T08:00:00Z"
    }
  ],
  "alias_hypotheses": [
    {
      "alias": "the kids",
      "refers_to_entity_ids": ["uuid1", "uuid2"],
      "scope": "household",
      "confidence": 0.65,
      "evidence_count": 2,
      "last_observed_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Event Continuity Links

Stored in `event_continuity_links` table:

```sql
CREATE TABLE event_continuity_links (
  id UUID PRIMARY KEY,
  user_id UUID,
  current_event_id UUID,
  past_event_id UUID,
  continuity_type TEXT,
  metadata JSONB -- Contains confidence, explanation, overlap scores
);
```

## Confidence Management

### Initial Confidence
- Event links: Based on overlap score (0.6+ required)
- Entity resolution: Base 0.5, +0.3 alias, +0.2 household, +0.1 recent
- Household hypotheses: 0.4 initial
- Alias hypotheses: 0.35 initial

### Confidence Growth
- Household: +0.1 per observation (max 0.8)
- Alias: +0.1 per observation (max 0.75)

### Confidence Decay
- Household: -0.05 per 30 days without reinforcement (min 0.2)
- Alias: No decay (but requires min evidence_count)

## Safety Guarantees

✅ **No entity merging** - Only creates links  
✅ **No event merging** - Only creates continuity links  
✅ **No overwriting IDs** - All stored as metadata  
✅ **No "facts"** - Everything is a hypothesis  
✅ **Reversible** - Can be removed/updated without corruption  
✅ **Confidence-gated** - Only acts when confidence is high enough

## Usage Examples

### Example 1: Linking Events

**Input**: New event "tia lourdes at post acute center with abuelo"

**Process**:
1. Event assembly creates event
2. `linkContextualEvents()` searches past events
3. Finds "abuelo got West Nile virus" (shared people, health topic)
4. Creates link with confidence 0.75
5. Stores in `event_continuity_links`

**Result**: Link created, events remain separate

### Example 2: Resolving "the kids"

**Input**: "the kids are in the room" + context: household = "grandma's house"

**Process**:
1. `resolveAmbiguousEntity()` checks household members
2. Finds Michael and Luis in household
3. Calculates confidence: 0.5 (base) + 0.2 (household) = 0.7
4. Returns resolution (confidence >= 0.7)

**Result**: Resolution returned, can be used for entity linking

### Example 3: Learning Household

**Input**: "Michael and Luis live with us at grandma's house"

**Process**:
1. Entities extracted: [Michael, Luis]
2. `updateHouseholdHypotheses()` called for each pair
3. Creates cohabitation hypothesis (confidence 0.4)
4. Stored in character metadata

**Result**: Hypothesis stored, confidence increases with repetition

### Example 4: Learning Alias

**Input**: "the kids" mentioned with Michael + Luis multiple times

**Process**:
1. `learnAlias()` called each time
2. Confidence increases: 0.35 → 0.45 → 0.55
3. After 2+ observations, can be used for resolution
4. Stored in character metadata

**Result**: Alias hypothesis stored, assists future resolution

## Future Enhancements

1. **Confidence decay cron job** - Periodically decay household hypotheses
2. **Hypothesis visualization** - Show confidence scores in UI
3. **Manual hypothesis adjustment** - Allow user to correct/confirm hypotheses
4. **Multi-household support** - Track multiple households per character
5. **Temporal household changes** - Track when people move in/out
6. **Relationship inference** - Infer family relationships from household context

## Files

- `contextualIntelligence/types.ts` - Shared contracts
- `contextualIntelligence/contextualEventLinker.ts` - Event linking
- `contextualIntelligence/contextAwareEntityResolver.ts` - Entity resolution
- `contextualIntelligence/householdKnowledgeBuilder.ts` - Household hypotheses
- `contextualIntelligence/aliasLearningService.ts` - Alias learning
- `contextualIntelligence/index.ts` - Public interface

## Testing

To test:

1. **Event linking**: Create related events, check `event_continuity_links`
2. **Entity resolution**: Use ambiguous reference, check resolution confidence
3. **Household learning**: Mention household members, check metadata
4. **Alias learning**: Use alias multiple times, check hypothesis confidence

All operations are non-blocking and fail gracefully.

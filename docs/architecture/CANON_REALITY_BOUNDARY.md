# Canon & Reality Boundary System (Phase 3.6)

## Overview

The Canon & Reality Boundary System prevents fictional, hypothetical, and roleplay content from polluting real memory and analytics. It operates orthogonally to knowledge types, answering "does this represent real life?" rather than "what kind of knowing is this?"

## Canon Status Types

### CANON (Default)
- **Real-life content** - Default classification
- **Confidence**: 0.6 (lower for default)
- **Usage**: All contracts allow CANON

### ROLEPLAY
- **Explicit roleplay / characters**
- **Confidence**: 0.8
- **Usage**: Stored but excluded from real-life views

### HYPOTHETICAL
- **"What if..." exploration**
- **Confidence**: 0.7
- **Usage**: Allowed in REFLECTOR contract only

### FICTIONAL
- **Creative writing / stories**
- **Confidence**: 0.7
- **Usage**: Stored but excluded from real-life views

### THOUGHT_EXPERIMENT
- **Philosophical exploration**
- **Confidence**: 0.7
- **Usage**: Allowed in REFLECTOR contract only

### META
- **Discussion about the system**
- **Confidence**: 0.9
- **Usage**: Excluded from all real-life views

## Canon Metadata

Every entry carries canon metadata:

```typescript
interface CanonMetadata {
  status: CanonStatus;
  source: 'USER' | 'SYSTEM';
  confidence: number;        // 0.0 - 1.0
  classified_at?: string;   // ISO timestamp
  overridden_at?: string;   // ISO timestamp if user overrode
}
```

## Classification (Ingestion-Time)

**Conservative by design**: Default is CANON unless strong signal detected.

### Detection Patterns

**ROLEPLAY:**
- "let's pretend", "roleplay", "acting as", "in character"

**HYPOTHETICAL:**
- "what if", "imagine if", "suppose that", "if I were"

**FICTIONAL:**
- "once upon a time", third-person narrative, chapter markers

**THOUGHT_EXPERIMENT:**
- "thought experiment", "philosophically", "abstract reasoning"

**META:**
- "how does lorekeeper", "the system does", "meta"

## User Override

Users can explicitly override canon status:

```typescript
overrideCanon(entryId, status, userId)
```

- User override always wins
- Confidence set to 1.0 (certain)
- `overridden_at` timestamp tracked
- Fully auditable

## Contract + Canon Gating

**No bypass possible** - canon gating is enforced at contract layer.

### ARCHIVIST & ANALYST
- **Only CANON** - Real life only

### REFLECTOR
- **CANON, HYPOTHETICAL, THOUGHT_EXPERIMENT** - Allows internal exploration

### THERAPIST
- **CANON, HYPOTHETICAL** - Allows exploration

### STRATEGIST
- **Only CANON** - Real life only

### Default
- **Only CANON** - Safest option

## Memory Recall Integration

Recall automatically filters by canon:

```typescript
recall(query, contract) {
  entries = allCompiledEntries
    .filter(e => canonAllowed(contract, e))  // Phase 3.6
    .filter(e => epistemicEligible(contract, e))  // Phase 2
  return rankAndFormat(entries, query)
}
```

## Analytics & Pattern Hard Rules

### Invariant 7: Non-CANON never in analytics
- Pattern detection: Only CANON + EXPERIENCE
- Analytics: Only CANON entries
- Narrative diffs: Only CANON entries
- Identity modeling: Only CANON entries

### Invariant 8: ROLEPLAY/FICTIONAL never interpreted as lived experience
- Stored but excluded from real-life views
- Recallable only if explicitly requested
- Never interpreted as lived experience

## UI Surface

**Transparency, not friction:**

- **Chat toggle**: "This is roleplay / hypothetical"
- **Canon badge**: Visual indicator on messages & entries
- **Memory filters**: Filter by canon status
- **Lorebooks**: Show CANON only by default

## Failure Modes (Explicitly Accepted)

1. **Misclassification**: User can override
2. **Mixed canon in same conversation**: Tracked, not prevented
3. **Delayed correction**: Canon status can be updated later

These are tracked, not hidden.

## Integration Points

### IR Compiler
- Classifies canon at ingestion
- Stores canon metadata
- User override supported

### Contract Layer
- Enforces canon gating
- No bypass possible
- Contract-specific canon rules

### Memory Recall
- Filters by canon automatically
- ARCHIVIST contract: CANON only

### Analytics
- Pattern detection: CANON only
- Narrative diffs: CANON only
- Identity modeling: CANON only

### Invariants
- Non-CANON never in analytics
- ROLEPLAY/FICTIONAL never in real-life views

## Examples

### Example 1: Roleplay Detection
```
User: "Let's pretend I'm a wizard"
→ Canon: ROLEPLAY (confidence 0.8)
→ Excluded from ARCHIVIST recall
→ Stored but not used in analytics
```

### Example 2: Hypothetical Exploration
```
User: "What if I moved to a new city?"
→ Canon: HYPOTHETICAL (confidence 0.7)
→ Allowed in REFLECTOR contract
→ Excluded from ARCHIVIST/ANALYST
```

### Example 3: User Override
```
User: "Actually, that was real life" (overriding ROLEPLAY)
→ Canon: CANON (source: USER, confidence 1.0)
→ Now included in all contracts
→ overridden_at timestamp tracked
```

## Database Schema

```sql
-- Canon metadata stored as JSONB
canon JSONB DEFAULT '{"status": "CANON", "source": "SYSTEM", "confidence": 0.6}'

-- Indexes for filtering
idx_entry_ir_canon_status ON entry_ir ((canon->>'status'))
idx_entry_ir_canon_source ON entry_ir ((canon->>'source'))
```

## Benefits

1. **Reality Boundary**: Clear separation between real and fictional
2. **Analytics Integrity**: Only real-life data in analytics
3. **User Control**: Explicit override with full audit trail
4. **Conservative Defaults**: CANON unless strong signal
5. **No Bypass**: Contract layer enforces canon gating

---

*This system ensures fictional and hypothetical content is stored but never pollutes real memory or analytics.*


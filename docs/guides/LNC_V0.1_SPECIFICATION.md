# LoreKeeper Narrative Compiler (LNC) v0.1 Specification

**Version**: 0.1  
**Status**: FROZEN (No breaking changes allowed)  
**Date**: 2025-01-XX  
**Purpose**: Formal specification of LNC behavior, invariants, and API contracts

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Epistemic Invariants](#epistemic-invariants)
4. [Knowledge Types](#knowledge-types)
5. [Epistemic Lattice](#epistemic-lattice)
6. [Contract Layer](#contract-layer)
7. [Classification Algorithm](#classification-algorithm)
8. [Symbol Resolution](#symbol-resolution)
9. [Incremental Compilation](#incremental-compilation)
10. [Database Schema](#database-schema)
11. [API Contracts](#api-contracts)
12. [Known Limitations](#known-limitations)
13. [Assumptions](#assumptions)

---

## Overview

The LoreKeeper Narrative Compiler (LNC) is a compiler-inspired system that processes journal entries with epistemic integrity. It treats journal entries as compilable artifacts rather than flat text, enforcing strict rules about knowledge types, confidence, and truth claims.

### Core Problem

Traditional journaling systems treat all entries equally. LNC distinguishes between:
- **EXPERIENCE**: Things that happened
- **FEELING**: Emotional states
- **BELIEF**: Things you think are true
- **FACT**: Verified truths
- **DECISION**: Choices made
- **QUESTION**: Questions asked

This prevents belief inflation, contradiction pollution, and memory drift in long-running personal AI systems.

### Design Principles

1. **Epistemic Safety**: Never allow invalid knowledge type promotions
2. **Contract-Based Access**: All entry access goes through contracts
3. **Incremental Compilation**: Only recompile affected entries
4. **Symbol Resolution**: Prevent entity drift with scoped symbol tables
5. **Proof-Carrying Promotions**: All promotions require proof artifacts

---

## Core Concepts

### Entry Intermediate Representation (IR)

Every journal entry is compiled into an `EntryIR` structure:

```typescript
interface EntryIR {
  id: string;
  user_id: string;
  source_utterance_id: string;
  thread_id: string;
  timestamp: string;
  
  // Epistemic classification
  knowledge_type: KnowledgeType;
  canon: CanonMetadata;
  
  // Semantic payload
  content: string;
  entities: EntityRef[];
  emotions: EmotionSignal[];
  themes: ThemeSignal[];
  
  // Confidence & epistemology
  confidence: number; // 0.0 - 1.0
  certainty_source: CertaintySource;
  
  // Narrative structure
  narrative_links: NarrativeLinks;
  
  // Compiler metadata
  compiler_flags: CompilerFlags;
}
```

### Knowledge Types

- **EXPERIENCE**: Past tense actions, events that occurred
- **FEELING**: Emotional states, subjective experiences
- **BELIEF**: Things you think are true (uncertain)
- **FACT**: Verified truths (high confidence)
- **DECISION**: Choices and commitments
- **QUESTION**: Questions and inquiries

### Canon Status (Reality Boundary)

- **CANON**: Real life, default
- **ROLEPLAY**: Acting as a character
- **HYPOTHETICAL**: "What if..." exploration
- **FICTIONAL**: Creative writing
- **THOUGHT_EXPERIMENT**: Abstract/philosophical reasoning
- **META**: Talking about the system itself

---

## Epistemic Invariants

**These must NEVER be violated. All invariants are testable and enforced at runtime.**

### Invariant 1: BELIEF Never in FACT-Only Views

**Rule**: BELIEF entries must never appear in ARCHIVIST (fact-only) contract views.

**Enforcement**: Contract layer filters by `allowedKnowledgeTypes`. ARCHIVIST only allows `['EXPERIENCE', 'FACT']`.

**Violation Detection**: `checkBeliefInFactOnlyViews()` scans filtered view for BELIEF entries.

### Invariant 2: FEELING Never Contributes to Analytics

**Rule**: FEELING entries must never appear in ANALYST (analytics-only) contract views.

**Enforcement**: ANALYST contract only allows `['EXPERIENCE']`.

**Violation Detection**: `checkFeelingInAnalytics()` scans filtered view for FEELING entries.

### Invariant 3: EXPERIENCE is the Only Pattern Source

**Rule**: Pattern detection and analytics must only use EXPERIENCE entries.

**Enforcement**: ANALYST contract filters to EXPERIENCE only.

**Violation Detection**: `checkPatternSource()` verifies all entries in ANALYST view are EXPERIENCE.

### Invariant 4: No Entry Consumed Without Contract

**Rule**: All entry access must go through `contractLayer.applyContract()`.

**Enforcement**: Structural (no direct database access in production code). Logged as warning.

**Violation Detection**: `checkContractRequired()` logs warnings if entries accessed directly.

### Invariant 5: All Promotions are Monotonic

**Rule**: Promotions must follow lattice rules. Downgrades are always allowed.

**Enforcement**: `epistemicLatticeService.isPromotionAllowed()` validates before promotion.

**Violation Detection**: `checkPromotionMonotonicity()` verifies FACT entries have valid promotion paths.

### Invariant 6: FEELING Can Never Promote

**Rule**: FEELING cannot promote to FACT or BELIEF.

**Enforcement**: Lattice defines `forbidden: { FEELING: ['FACT', 'BELIEF'] }`.

**Violation Detection**: `checkFeelingPromotion()` flags entries with `promoted_from_feeling` flag.

### Invariant 7: Non-CANON Never in Analytics

**Rule**: ROLEPLAY/FICTIONAL entries must never appear in ARCHIVIST/ANALYST views.

**Enforcement**: Contract layer filters by `canon.status === 'CANON'` for ARCHIVIST/ANALYST.

**Violation Detection**: `checkNonCanonInAnalytics()` scans filtered view for non-CANON entries.

### Invariant 8: ROLEPLAY/FICTIONAL Never Interpreted as Real Life

**Rule**: ROLEPLAY/FICTIONAL entries must never appear in real-life-only views.

**Enforcement**: ARCHIVIST contract filters to `canon.status === 'CANON'` only.

**Violation Detection**: `checkRoleplayFictionInRealLife()` scans ARCHIVIST view for ROLEPLAY/FICTIONAL.

---

## Knowledge Types

### EXPERIENCE

**Definition**: Past tense actions, events that occurred.

**Patterns** (regex):
```
/\b(i|we|they|he|she)\s+(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished|had|got|received|gave|took|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|left|quit|started|ended)\b/gi
```

**Default Confidence**: 0.9

**Certainty Source**: DIRECT_EXPERIENCE

**Allowed Promotions**: EXPERIENCE → FACT (with proof)

### FEELING

**Definition**: Emotional states, subjective experiences.

**Patterns** (regex):
```
/\b(i|i'm|i am|i feel|feeling|felt|feels)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|unsatisfied|lonely|connected|loved|hated|jealous|envious|guilty|shameful|hopeful|hopeless|optimistic|pessimistic)\b/gi
```

**Default Confidence**: 0.8

**Certainty Source**: DIRECT_EXPERIENCE

**Allowed Promotions**: NONE (forbidden to promote)

### BELIEF

**Definition**: Things you think are true (uncertain).

**Patterns** (regex):
```
/\b(i believe|i think|i assume|i suspect|i guess|i imagine|supposedly|apparently|allegedly|reportedly|i heard|i was told|someone said|they said|people say|rumor|rumors|gossip)\b/gi
```

**Default Confidence**: 0.6

**Certainty Source**: HEARSAY or INFERENCE

**Allowed Promotions**: BELIEF → FACT (with proof)

### FACT

**Definition**: Verified truths (high confidence).

**Patterns** (regex):
```
/\b(is|are|was|were|has|have|had|will|would|can|could|should|must)\b/gi
AND NOT /\b(i think|i believe|i feel|maybe|perhaps|probably)\b/gi
```

**Default Confidence**: 0.7

**Certainty Source**: VERIFICATION or INFERENCE

**Allowed Promotions**: NONE (terminal type)

**Safety**: FACT with confidence < 0.6 automatically downgrades to BELIEF.

### DECISION

**Definition**: Choices and commitments.

**Patterns** (regex):
```
/\b(i decided|i'm going to|i will|i'm planning|i chose|i selected|i picked|i opted|decision|decide|choosing|choice)\b/gi
```

**Default Confidence**: 0.9

**Certainty Source**: DIRECT_EXPERIENCE

**Allowed Promotions**: NONE

### QUESTION

**Definition**: Questions and inquiries.

**Patterns** (regex):
```
/\?/g OR /\b(what|when|where|who|why|how|which|should|can|could|would|will)\b/gi
```

**Default Confidence**: 0.5

**Certainty Source**: MEMORY_RECALL

**Allowed Promotions**: NONE

---

## Epistemic Lattice

The epistemic lattice defines allowed knowledge type promotions. It is a partial order (⊑) where A ⊑ B means A may promote to B (with proof).

### Lattice Structure

```typescript
ordering: {
  EXPERIENCE: ['FACT'],
  BELIEF: ['FACT'],
  FACT: [],
  FEELING: [],
  DECISION: [],
  QUESTION: [],
}

forbidden: {
  FEELING: ['FACT', 'BELIEF'],
  QUESTION: ['FACT', 'BELIEF', 'EXPERIENCE'],
  DECISION: ['FACT'],
}
```

### Promotion Rules

1. **Forbidden edges are absolute**: FEELING → FACT is never allowed, regardless of proof.
2. **Lattice ordering**: Only edges in `ordering` are allowed.
3. **Proof required**: All promotions require an `EpistemicProof` artifact.
4. **Proof confidence threshold**: Proof confidence must be ≥ 0.6.
5. **Downgrades always allowed**: Safety mechanism (e.g., FACT → BELIEF).

### Epistemic Proof

Every promotion must carry a proof artifact:

```typescript
interface EpistemicProof {
  rule_id: string; // e.g., "EXPERIENCE_TO_FACT"
  source_entries: string[]; // EntryIR IDs that serve as evidence
  confidence: number; // Proof confidence (0.0 - 1.0)
  generated_at: string; // ISO timestamp
  generated_by: 'SYSTEM' | 'USER';
  reasoning?: string; // Optional explanation
}
```

### Automatic Safety Enforcement

**Rule**: FACT entries with confidence < 0.6 are automatically downgraded to BELIEF.

**Implementation**: `epistemicLatticeService.enforceEpistemicSafety()` checks confidence and downgrades if needed.

**Flag**: Downgraded entries have `compiler_flags.downgraded_from_fact: true`.

---

## Contract Layer

The contract layer enforces epistemic boundaries by filtering entries based on knowledge types and canon status.

### Contracts

#### ARCHIVIST

**Purpose**: Factual recall only, no interpretation.

**Allowed Knowledge Types**: `['EXPERIENCE', 'FACT']`

**Canon Filter**: `canon.status === 'CANON'` (real life only)

**Inference Policy**: `allowed: false`, `label: 'NONE'`

**Min Confidence**: 0.5

**Use Case**: Historical recall, factual queries

#### ANALYST

**Purpose**: Pattern detection and insights.

**Allowed Knowledge Types**: `['EXPERIENCE']`

**Canon Filter**: `canon.status === 'CANON'` (real life only)

**Inference Policy**: `allowed: true`, `label: 'INSIGHT'`

**Min Confidence**: 0.6

**Use Case**: Analytics, pattern detection, trend analysis

#### REFLECTOR

**Purpose**: Emotional processing and reflection.

**Allowed Knowledge Types**: `['EXPERIENCE', 'FEELING', 'BELIEF']`

**Canon Filter**: `['CANON', 'HYPOTHETICAL', 'THOUGHT_EXPERIMENT']`

**Inference Policy**: `allowed: true`, `label: 'REFLECTION'`

**Use Case**: Emotional processing, self-reflection

#### THERAPIST

**Purpose**: Emotional support and processing.

**Allowed Knowledge Types**: `['FEELING', 'BELIEF', 'EXPERIENCE']`

**Canon Filter**: `['CANON', 'HYPOTHETICAL']`

**Inference Policy**: `allowed: true`, `label: 'REFLECTION'`

**Use Case**: Therapy, emotional support

#### STRATEGIST

**Purpose**: Goal-oriented planning.

**Allowed Knowledge Types**: `['EXPERIENCE', 'DECISION', 'FACT']`

**Canon Filter**: `canon.status === 'CANON'` (real life only)

**Inference Policy**: `allowed: true`, `label: 'INSIGHT'`

**Min Confidence**: 0.5

**Use Case**: Planning, goal setting, strategy

### Contract Application

All entry access must go through `contractLayer.applyContract(contract, entries)`:

1. Filter by `allowedKnowledgeTypes`
2. Filter by `canon.status` (canon gating)
3. Filter by `minConfidence` (if specified)
4. Filter out deprecated entries (`compiler_flags.is_deprecated`)
5. Return `ConstrainedMemoryView` with metadata

**No Bypass Possible**: Canon gating and epistemic filtering are enforced at the contract layer.

---

## Classification Algorithm

The classification algorithm uses regex patterns to classify journal entries into knowledge types.

### Algorithm Flow

1. **Normalize text**: Lowercase, remove special characters
2. **Pattern matching**: Test regex patterns in order:
   - EXPERIENCE (highest priority)
   - FEELING
   - BELIEF
   - FACT
   - DECISION
   - QUESTION
3. **Default**: If no pattern matches, default to EXPERIENCE

### Pattern Priority

Patterns are tested in order. First match wins. EXPERIENCE has highest priority because it's the most common.

### Confidence Calculation

**Base confidence** (by knowledge type):
- EXPERIENCE: 0.9
- FEELING: 0.8
- FACT: 0.7
- DECISION: 0.9
- QUESTION: 0.5
- BELIEF: 0.6

**Adjustments**:
- Text length < 10: confidence × 0.8
- Text length > 500: confidence × 0.9
- Hearsay markers (`heard`, `told`, `rumor`, etc.): confidence × 0.7

**Final confidence**: Clamped to [0.1, 1.0]

### Certainty Source Inference

- EXPERIENCE → DIRECT_EXPERIENCE
- FEELING → DIRECT_EXPERIENCE
- BELIEF → HEARSAY (if hearsay markers present) or INFERENCE
- FACT → VERIFICATION (if verified markers present) or INFERENCE
- QUESTION → MEMORY_RECALL

---

## Symbol Resolution

Symbol resolution prevents entity drift by maintaining scoped symbol tables.

### Scope Types

- **GLOBAL**: User-wide scope
- **ERA**: Time period scope
- **EVENT**: Event-specific scope
- **THREAD**: Conversation thread scope (default)

### Scope Chain Walking

When resolving an entity name:

1. Start at entry's scope (usually THREAD)
2. Look up symbol in current scope
3. If not found, walk up to parent scope
4. Continue until GLOBAL scope or symbol found
5. If still not found, create new symbol

### Symbol Definition

Symbols are defined with:
- `canonical_name`: Primary name
- `aliases`: Alternative names
- `entity_type`: PERSON, CHARACTER, LOCATION, ORG, EVENT, CONCEPT
- `confidence`: 0.0 - 1.0
- `introduced_by_entry_id`: Entry that first mentioned this entity
- `certainty_source`: DIRECT_EXPERIENCE, REFERENCE, INFERENCE

### Symbol Resolution Algorithm

```typescript
async resolve(name: string, scopeId: string): Promise<EntitySymbol | null> {
  let currentScopeId = scopeId;
  
  while (currentScopeId) {
    const scope = this.scopes.get(currentScopeId);
    const symbol = scope?.symbols.get(name.toLowerCase());
    if (symbol) return symbol;
    
    // Try database lookup
    const dbSymbol = await this.resolveFromDatabase(name, currentScopeId);
    if (dbSymbol) return dbSymbol;
    
    // Walk up to parent scope
    currentScopeId = scope?.parent_scope_id || getParentFromDB(currentScopeId);
  }
  
  return null; // Not found
}
```

### New Symbol Creation

If symbol not found:
1. Create new `EntitySymbol` with `randomUUID()`
2. Infer `entity_type` from context (default: PERSON)
3. Infer `certainty_source` from entry's `certainty_source`
4. Define symbol in current scope
5. Persist to database

---

## Incremental Compilation

Incremental compilation recompiles only affected entries when dependencies change.

### Dependency Graph

Dependencies are tracked in `entry_dependencies` table:
- **ENTITY dependencies**: Entry depends on entity (e.g., mentions a person)
- **ENTRY dependencies**: Entry depends on another entry (e.g., narrative links)

### Affected Entry Detection

When entries change, compute transitive closure:

```typescript
async getAffectedEntries(changedEntryIds: string[]): Promise<Set<string>> {
  const affected = new Set<string>(changedEntryIds);
  const queue = [...changedEntryIds];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = await getDependents(current);
    
    for (const dep of dependents) {
      if (!affected.has(dep.entry_id)) {
        affected.add(dep.entry_id);
        queue.push(dep.entry_id);
      }
    }
  }
  
  return affected;
}
```

### Recompilation Passes

**Cheap passes only** (no LLM calls):
1. Re-extract entities (uses existing `omegaMemoryService`)
2. Re-extract emotions/themes (uses `entryEnrichmentService`)
3. Recompute confidence
4. Update IR in database

**No re-classification**: Knowledge type and canon status are not changed during incremental compilation.

### Confidence Recalculation

```typescript
newConfidence = (
  baseConfidence * 0.6 +
  avgEntityConfidence * 0.3 +
  enrichmentBoost * 0.1
)
```

Where:
- `baseConfidence`: Original confidence from knowledge type
- `avgEntityConfidence`: Average confidence of all entities
- `enrichmentBoost`: +0.05 if emotions present, +0.05 if themes present

---

## Database Schema

### entry_ir

**Purpose**: Stores compiled EntryIR structures.

**Key Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `source_utterance_id` (UUID, FOREIGN KEY to utterances)
- `thread_id` (UUID)
- `timestamp` (TIMESTAMPTZ)
- `knowledge_type` (TEXT, CHECK constraint)
- `canon` (JSONB, default: `{"status": "CANON", "source": "SYSTEM", "confidence": 0.6}`)
- `content` (TEXT, normalized semantic payload)
- `entities` (JSONB, array of EntityRef)
- `emotions` (JSONB, array of EmotionSignal)
- `themes` (JSONB, array of ThemeSignal)
- `confidence` (FLOAT, CHECK: 0.0 - 1.0)
- `certainty_source` (TEXT, CHECK constraint)
- `narrative_links` (JSONB)
- `compiler_flags` (JSONB)

**Indexes**:
- `idx_entry_ir_user` on `(user_id)`
- `idx_entry_ir_thread` on `(thread_id)`
- `idx_entry_ir_knowledge_type` on `(knowledge_type)`
- `idx_entry_ir_canon_status` on `((canon->>'status'))` (GIN)
- `idx_entry_ir_canon_source` on `((canon->>'source'))`

**Constraints**:
- `check_canon_status`: `canon->>'status'` must be valid CanonStatus
- `check_canon_confidence`: `canon->>'confidence'` must be 0.0 - 1.0

### entry_dependencies

**Purpose**: Tracks entry dependencies for incremental compilation.

**Key Columns**:
- `entry_id` (UUID, FOREIGN KEY to entry_ir)
- `dependency_type` (TEXT: 'ENTITY' or 'ENTRY')
- `dependency_id` (UUID, entity_id or entry_id)
- `user_id` (UUID, FOREIGN KEY)

**Indexes**:
- `idx_entry_dependencies_entry` on `(entry_id)`
- `idx_entry_dependencies_dependency` on `(dependency_type, dependency_id)`

### symbol_scopes

**Purpose**: Defines symbol scopes (GLOBAL, ERA, EVENT, THREAD).

**Key Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `scope_type` (TEXT, CHECK: 'GLOBAL', 'ERA', 'EVENT', 'THREAD')
- `parent_scope_id` (UUID, FOREIGN KEY to symbol_scopes, nullable)

**Indexes**:
- `idx_symbol_scopes_user` on `(user_id)`
- `idx_symbol_scopes_parent` on `(parent_scope_id)`
- `idx_symbol_scopes_type` on `(scope_type)`

### entity_symbols

**Purpose**: Stores entity symbols for symbol resolution.

**Key Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `scope_id` (UUID, FOREIGN KEY to symbol_scopes)
- `canonical_name` (TEXT)
- `entity_type` (TEXT, CHECK: 'PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT', 'CONCEPT')
- `aliases` (JSONB, array of strings)
- `confidence` (FLOAT, CHECK: 0.0 - 1.0)
- `introduced_by_entry_id` (UUID, FOREIGN KEY to entry_ir, nullable)
- `certainty_source` (TEXT, CHECK: 'DIRECT_EXPERIENCE', 'REFERENCE', 'INFERENCE')

**Indexes**:
- `idx_entity_symbols_user` on `(user_id)`
- `idx_entity_symbols_scope` on `(scope_id)`
- `idx_entity_symbols_name` on `(canonical_name)` (GIN trigram)
- `idx_entity_symbols_aliases` on `(aliases)` (GIN)
- `idx_entity_symbols_entry` on `(introduced_by_entry_id)`

---

## API Contracts

### IRCompiler

**Service**: `apps/server/src/services/compiler/irCompiler.ts`

**Public Methods**:

```typescript
class IRCompiler {
  async compile(userId: string, utteranceId: string, text: string): Promise<EntryIR>
}
```

**Behavior**:
1. Normalize text
2. Classify knowledge type (regex patterns)
3. Extract entities (via `omegaMemoryService`)
4. Extract emotions/themes (via `entryEnrichmentService`)
5. Infer certainty source
6. Calculate confidence
7. Create EntryIR
8. Save to database
9. Return EntryIR

**Frozen**: No breaking changes to method signature or behavior.

### SymbolResolver

**Service**: `apps/server/src/services/compiler/symbolResolver.ts`

**Public Methods**:

```typescript
class SymbolResolver {
  async resolveEntitiesForEntry(entryIR: EntryIR): Promise<{
    resolved: EntitySymbol[];
    updatedIR: EntryIR;
    warnings: string[];
  }>
}
```

**Behavior**:
1. Determine scope for entry
2. Resolve each entity via symbol table
3. Create new symbols if not found
4. Type check entity usage
5. Return resolved symbols and updated IR

**Frozen**: No breaking changes to method signature or behavior.

### IncrementalCompiler

**Service**: `apps/server/src/services/compiler/incrementalCompiler.ts`

**Public Methods**:

```typescript
class IncrementalCompiler {
  async incrementalCompile(userId: string, changedEntryIds: string[]): Promise<void>
}
```

**Behavior**:
1. Get affected entries (transitive closure)
2. Recompile each affected entry (cheap passes only)
3. Update IR in database

**Frozen**: No breaking changes to method signature or behavior.

### EpistemicLatticeService

**Service**: `apps/server/src/services/compiler/epistemicLattice.ts`

**Public Methods**:

```typescript
class EpistemicLatticeService {
  isPromotionAllowed(from: KnowledgeType, to: KnowledgeType): boolean
  epistemicTypeCheck(attempt: PromotionAttempt): void
  enforceEpistemicSafety(entry: EntryIR): EntryIR
  contractAllows(contract: SensemakingContract, entry: EntryIR): boolean
  generateProof(...): EpistemicProof
  isDowngradeAllowed(from: KnowledgeType, to: KnowledgeType): boolean
}
```

**Frozen**: No breaking changes to method signatures or lattice rules.

### ContractLayer

**Service**: `apps/server/src/services/compiler/contractLayer.ts`

**Public Methods**:

```typescript
class ContractLayer {
  applyContract(contract: SensemakingContract, entries: EntryIR[]): ConstrainedMemoryView
  getContract(name: string): SensemakingContract | null
  isInferenceAllowed(contract: SensemakingContract): boolean
  getInferenceLabel(contract: SensemakingContract): InferenceLabel
  mustLabelUncertainty(contract: SensemakingContract): boolean
  formatOutputWithUncertainty(...): string
  formatInference(...): string
  canonAllowed(contract: SensemakingContract, entry: EntryIR): boolean
}
```

**Frozen**: No breaking changes to method signatures or contract definitions.

### EpistemicInvariants

**Service**: `apps/server/src/services/compiler/epistemicInvariants.ts`

**Public Methods**:

```typescript
class EpistemicInvariants {
  checkAllInvariants(entries: EntryIR[]): InvariantViolation[]
  assertInvariants(entries: EntryIR[]): void
}
```

**Frozen**: No breaking changes to invariant definitions or checking logic.

---

## Known Limitations

### Classification Accuracy

**Issue**: Regex-based classification has limited accuracy (~70-80% estimated).

**Impact**: Some entries may be misclassified (e.g., BELIEF classified as FACT).

**Mitigation**: Automatic downgrade of low-confidence FACT entries to BELIEF.

**Future**: Consider LLM-based classification for ambiguous entries.

### Entity Resolution Collisions

**Issue**: Name collisions (same name, different people) may cause incorrect entity resolution.

**Impact**: Entity references may point to wrong person.

**Mitigation**: Scope-based resolution reduces collisions. User can correct via chatbot.

**Future**: Context-aware disambiguation using entry content.

### Confidence Decay

**Issue**: No temporal decay of confidence over time.

**Impact**: Old BELIEF entries maintain same confidence as new ones.

**Future**: Implement confidence decay model (e.g., exponential decay based on age).

### Incremental Compilation Scope

**Issue**: Only "cheap passes" are recompiled (no re-classification).

**Impact**: If entity update affects knowledge type, entry may not be reclassified.

**Mitigation**: Full recompilation can be triggered manually.

**Future**: Smart recompilation that detects when full pass is needed.

### Symbol Resolution Performance

**Issue**: Database lookups for symbol resolution may be slow for large scopes.

**Impact**: Entry compilation may be slower for users with many entities.

**Mitigation**: In-memory symbol table cache.

**Future**: Optimize database queries with better indexes.

### Canon Classification

**Issue**: Canon status is inferred automatically (SYSTEM source) with default confidence 0.6.

**Impact**: Some entries may be misclassified as CANON when they're actually HYPOTHETICAL.

**Mitigation**: User can override canon status via chatbot.

**Future**: Improve canon classification using LLM.

---

## Assumptions

### User Behavior

1. **Users write in natural language**: Journal entries are conversational, not structured.
2. **Users may correct mistakes**: System should allow corrections via chatbot.
3. **Users trust the system**: System is authoritative source of truth (with user corrections).

### Data Quality

1. **Entity extraction is mostly accurate**: `omegaMemoryService` correctly identifies entities.
2. **Emotion/themes extraction is mostly accurate**: `entryEnrichmentService` correctly identifies emotions/themes.
3. **Database is reliable**: No data corruption or loss.

### System Behavior

1. **Compilation is idempotent**: Recompiling same entry produces same result (unless dependencies changed).
2. **Incremental compilation is correct**: Only affected entries are recompiled.
3. **Contracts are enforced**: No bypass of contract layer in production code.

### Performance

1. **Compilation is fast enough**: Entry compilation completes in < 1 second.
2. **Database queries are fast**: Symbol resolution queries complete in < 100ms.
3. **Incremental compilation scales**: Recompiling 100 entries takes < 10 seconds.

---

## Version History

- **v0.1** (2025-01-XX): Initial frozen specification
  - All invariants defined
  - All API contracts frozen
  - Database schema frozen
  - Classification algorithm documented
  - Symbol resolution algorithm documented
  - Incremental compilation rules documented

---

## Future Versions

### v0.2 (Planned)

- LLM-based classification for ambiguous entries
- Confidence decay model
- Context-aware entity disambiguation
- Improved canon classification

### v1.0 (Planned)

- Stable API with backward compatibility guarantees
- Performance optimizations
- Enhanced error handling
- Comprehensive test coverage

---

**End of Specification**

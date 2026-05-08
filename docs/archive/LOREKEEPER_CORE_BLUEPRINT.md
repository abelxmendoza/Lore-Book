# LoreKeeper Core Blueprint — Dialog-Driven Sensemaking OS

**Single-source-of-truth, epistemically safe architecture**

## 0. AXIOMS (NON-NEGOTIABLE)

- **Conversation is the only write surface** - Users can only write through conversation/chat
- **Memory is never edited, only reinterpreted** - Original utterances are immutable
- **Belief ≠ Fact ≠ Feeling (ever)** - Epistemic boundaries are strictly enforced
- **Contradictions are data, not errors** - Contradictions are valuable information
- **All intelligence is contract-gated** - Access to memory is governed by contracts
- **All downstream systems are read-only** - No system can modify source memory

---

## 1. CONVERSATION INGESTION (SOURCE OF TRUTH)

**Conversation is the single source of truth.** All user input flows through this pipeline.

```typescript
function ingestConversationMessage(userId, threadId, role, rawText) {
  const normalized = normalizeText(rawText)

  const utterance = saveUtterance({
    userId,
    threadId,
    role,
    rawText,
    normalizedText: normalized
  })

  // Pipeline is non-blocking and failure-tolerant
  compileToIR(utterance)
  enrichUtterance(utterance)
}
```

**Key Principles:**
- All user input is saved as utterances
- Normalization happens at ingestion
- Processing is non-blocking and failure-tolerant
- Original text is never modified

---

## 2. ENTRY ENRICHMENT (FAST, CHEAP, STRUCTURAL)

**Fast, rule-based extraction of structural metadata.**

```typescript
function enrichUtterance(utterance) {
  utterance.metadata = {
    emotions: extractEmotions(utterance.text),
    themes: extractThemes(utterance.text),
    entities: extractEntities(utterance.text),
    intensity: inferIntensity(utterance.text),
    ventingSignal: detectVenting(utterance.text)
  }
  save(utterance)
}
```

**Key Principles:**
- Rule-based extraction (no API calls)
- Fast and cheap operations
- Structural metadata only
- No interpretation or inference

---

## 3. NARRATIVE COMPILER (LNC PHASE 1 & 2)

**Epistemic classification and symbolic resolution.**

### 3.1 Entry IR

```typescript
type EntryIR = {
  id: UUID
  timestamp: TIMESTAMP
  knowledgeType: EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
  content: STRING
  entities: EntityRef[]
  emotions: EmotionSignal[]
  themes: ThemeSignal[]
  confidence: FLOAT (0.0 - 1.0)
  certaintySource: DIRECT_EXPERIENCE | INFERENCE | HEARSAY | VERIFICATION | MEMORY_RECALL | SYSTEM_DEFAULT
  flags: {
    isDeprecated: BOOLEAN
    compilationVersion: INT
  }
}
```

### 3.2 IR Compilation

```typescript
function compileToIR(utterance) {
  const ir = {
    id: utterance.id,
    timestamp: utterance.timestamp,
    knowledgeType: classifyKnowledgeType(utterance.text),
    content: utterance.normalizedText,
    entities: resolveEntities(utterance),
    emotions: utterance.metadata.emotions,
    themes: utterance.metadata.themes,
    confidence: initialConfidenceByType(),
    certaintySource: inferCertaintySource()
  }

  saveIR(ir)
  updateDependencyGraph(ir)
}
```

**Key Principles:**
- Every utterance becomes an EntryIR
- Epistemic classification is automatic
- Entity resolution is deterministic
- Dependency graph tracks relationships

---

## 4. ENTITY SYMBOL TABLE (DETERMINISTIC RESOLUTION)

**Compiler-style symbol resolution with scope chains.**

```typescript
class SymbolTable {
  resolve(name, scopeChain): EntitySymbol
  createIfMissing(name, type)
  downgradeIfLowConfidence(entity)
}

function resolveEntities(utterance) {
  for each mention in utterance.metadata.entities:
    symbol = SymbolTable.resolve(mention, scopeChain)
    epistemicTypeCheck(symbol, utterance.knowledgeType)
    if (symbol.confidence < 0.6 && utterance.knowledgeType === FACT)
      downgradeToBelief()
  return symbols
}
```

**Key Principles:**
- Deterministic resolution (same name → same symbol)
- Scope chain walking (like variable lookup)
- Automatic downgrading of low-confidence facts
- Type checking at compile time

---

## 5. EPISTEMIC TYPE CHECKER (COMPILE-TIME SAFETY)

**Strict rules for knowledge type usage.**

### Rules

- **EXPERIENCE** → always valid
- **FEELING** → subjective only
- **BELIEF** → cannot promote to fact
- **FACT** → requires confidence >= 0.6
- **QUESTION** → non-analytic
- **DECISION** → context-only

### Filters

```typescript
recallEligible = EXPERIENCE | FACT (confidence >= 0.5)
patternEligible = EXPERIENCE only
analyticsEligible = exclude QUESTION
```

**Key Principles:**
- Compile-time safety checks
- Automatic filtering by knowledge type
- No promotion of beliefs to facts
- Honest uncertainty tracking

---

## 6. SENSEMAKING CONTRACT LAYER (PHASE 3)

**Contracts govern access to memory based on persona/intent.**

### Contract Definition

```typescript
type Contract = {
  allowedKnowledgeTypes: KnowledgeType[]
  inferencePolicy: {
    allowed: boolean
    label: string
  }
  outputRequirements: {
    mustLabelUncertainty: boolean
  }
}
```

### Predefined Contracts

#### ARCHIVIST
```typescript
ARCHIVIST = {
  allowedKnowledgeTypes: [EXPERIENCE, FACT],
  inferencePolicy: { allowed: false },
  outputRequirements: { mustLabelUncertainty: true }
}
```
**Purpose**: Factual recall only, no interpretation

#### ANALYST
```typescript
ANALYST = {
  allowedKnowledgeTypes: [EXPERIENCE],
  inferencePolicy: { allowed: true, label: "INSIGHT" },
  outputRequirements: { mustLabelUncertainty: true }
}
```
**Purpose**: Pattern detection and insights

#### REFLECTOR
```typescript
REFLECTOR = {
  allowedKnowledgeTypes: [EXPERIENCE, FEELING, BELIEF],
  inferencePolicy: { allowed: true, label: "REFLECTION" },
  outputRequirements: { mustLabelUncertainty: true }
}
```
**Purpose**: Emotional processing and reflection

### Contract Enforcer

```typescript
function applyContract(contract, compiledEntries): ConstrainedMemoryView {
  return compiledEntries.filter(entry =>
    contract.allowedKnowledgeTypes.includes(entry.knowledgeType) &&
    (entry.confidence >= contract.minConfidence || contract.minConfidence === undefined)
  )
}
```

**Key Principles:**
- Contracts gate access to memory
- Different personas use different contracts
- Inference is explicitly labeled
- Uncertainty must be labeled

---

## 7. MEMORY RECALL ENGINE (CONFIDENCE-AWARE)

**Recall with contract enforcement.**

```typescript
function recall(query, contract) {
  if (isRecallQuery(query)) {
    entries = applyContract(ARCHIVIST, allIR)
    ranked = rankBySimilarityRecencyConfidence(entries)
    return formatRecall(ranked)
  }
  return fallbackToChat()
}
```

**Key Principles:**
- Recall uses ARCHIVIST contract (facts only)
- Ranking by similarity, recency, confidence
- Epistemic priority weighting
- No hallucination guarantee

---

## 8. BELIEF EVOLUTION & MEANING RESOLUTION (BEMRE)

**Track how beliefs evolve and resolve over time.**

### Belief Resolution Status

```typescript
BeliefResolutionStatus =
  | SUPPORTED        // Evidence supports the belief
  | PARTIALLY_SUPPORTED  // Some evidence supports
  | CONTRADICTED     // Evidence contradicts
  | ABANDONED        // Belief was abandoned
  | UNRESOLVED       // No resolution yet
```

### Rules

```typescript
patternsOnlyUse(SUPPORTED, PARTIALLY_SUPPORTED)
analyticsWeight:
  SUPPORTED = 1.0
  PARTIAL = 0.7
  CONTRADICTED = 0.0
  ABANDONED = 0.0
```

**Key Principles:**
- Track belief evolution over time
- Weight analytics by resolution status
- Patterns only use supported beliefs
- Contradictions are data, not errors

---

## 9. NARRATIVE DIFF & IDENTITY EVOLUTION (NDIE)

**Detect how identity and narrative evolve over time.**

```typescript
function generateNarrativeDiffs(contract) {
  entries = applyContract(contract, allIR)

  diffs = compareSequential(entries) where:
    sameKnowledgeType
    sharedEntityOrTheme

  detect:
    beliefStrengthChange      // Belief became stronger/weaker
    beliefAbandonment         // Belief was abandoned
    emotionalShift            // Emotional state changed
    interpretationShift       // Same event, different interpretation
    valueReprioritization     // Values changed priority

  storeReadOnly(diffs)
}
```

**Key Principles:**
- Compare sequential entries
- Detect evolution patterns
- Store diffs as read-only data
- Identity evolution is tracked, not judged

---

## 10. PRESENTATION LAYER (LOREBOOKS)

**Read-only views compiled from memory.**

```typescript
LorebookView {
  input: ConstrainedMemoryView
  output: Timeline | Profile | Arc | Diff | Analytics
}
```

**Key Principles:**
- Lorebooks NEVER write memory
- They compile read-only views
- Different views use different contracts
- All views are derived, never source

---

## FINAL ARCHITECTURE

```
Conversation (WRITE)        ← user types freely
        ↓
Narrative Compiler (LNC)    ← epistemic + symbolic safety
        ↓
Contract Enforcer (SCL)     ← governs meaning access
        ↓
Intelligence Engines        ← recall, patterns, diffs
        ↓
Lorebooks (READ-ONLY)       ← timelines, bios, identity
```

**Data Flow:**
1. User writes in conversation → Utterance saved
2. Utterance → Enriched with metadata
3. Utterance → Compiled to EntryIR
4. EntryIR → Entities resolved via Symbol Table
5. EntryIR → Type checked for epistemic safety
6. EntryIR → Contract applied for access control
7. Contracted View → Used by intelligence engines
8. Intelligence Output → Compiled into Lorebooks

**Guarantees:**
- ✅ No memory editing (only reinterpretation)
- ✅ Epistemic boundaries enforced
- ✅ Contracts gate all access
- ✅ Contradictions are data
- ✅ All downstream is read-only

---

## Implementation Status

- ✅ **Phase 1**: Entry IR + Incremental Compilation
- ✅ **Phase 2**: Entity Symbol Table + Epistemic Type Checking
- 🔄 **Phase 3**: Sensemaking Contract Layer (in progress)
- 🔄 **Phase 4**: Belief Evolution & Meaning Resolution (in progress)
- 🔄 **Phase 5**: Narrative Diff & Identity Evolution (in progress)

---

*This blueprint ensures LoreKeeper maintains epistemic integrity while enabling powerful sensemaking capabilities.*


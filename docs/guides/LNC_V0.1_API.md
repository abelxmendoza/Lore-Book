# LNC v0.1 API Documentation

**Version**: 0.1  
**Status**: FROZEN (No breaking changes allowed)  
**Date**: 2025-01-XX  
**Purpose**: Document frozen API surface and migration policy

---

## Table of Contents

1. [API Freeze Policy](#api-freeze-policy)
2. [Public API Surface](#public-api-surface)
3. [Type Definitions](#type-definitions)
4. [Service Exports](#service-exports)
5. [Database Schema](#database-schema)
6. [Migration Policy](#migration-policy)
7. [Breaking Change Policy](#breaking-change-policy)

---

## API Freeze Policy

**LNC v0.1 API is FROZEN**. This means:

1. **No breaking changes** to public method signatures
2. **No breaking changes** to type definitions
3. **No breaking changes** to database schema (no column deletions, no type changes)
4. **No breaking changes** to service exports
5. **Backward compatibility** required for all changes

### What Can Change

- **Internal implementation**: Private methods, helper functions, algorithms
- **Performance improvements**: Optimizations that don't change behavior
- **Bug fixes**: Fixes that don't change API contracts
- **New methods**: Can be added (but must not break existing code)
- **New types**: Can be added (but must not conflict with existing types)

### What Cannot Change

- **Method signatures**: Parameters, return types, method names
- **Type definitions**: Existing types cannot be modified
- **Database columns**: Cannot be deleted or have types changed
- **Service exports**: Exported services cannot be removed or renamed
- **Contract definitions**: CONTRACTS object cannot be modified

---

## Public API Surface

### IRCompiler

**File**: `apps/server/src/services/compiler/irCompiler.ts`

**Export**: `export const irCompiler = new IRCompiler()`

**Public Methods**:

```typescript
class IRCompiler {
  /**
   * Compile a journal entry into EntryIR
   * 
   * @param userId - User ID
   * @param utteranceId - Source utterance ID
   * @param text - Journal entry text
   * @returns Compiled EntryIR
   * 
   * @throws Error if compilation fails
   */
  async compile(userId: string, utteranceId: string, text: string): Promise<EntryIR>
}
```

**Frozen Contract**:
- Method name: `compile`
- Parameters: `(userId: string, utteranceId: string, text: string)`
- Return type: `Promise<EntryIR>`
- Behavior: Compiles text into EntryIR, saves to database, returns EntryIR

**Breaking Changes Forbidden**:
- Cannot change parameter types or order
- Cannot change return type
- Cannot remove method
- Cannot change method name

---

### SymbolResolver

**File**: `apps/server/src/services/compiler/symbolResolver.ts`

**Export**: `export const symbolResolver = new SymbolResolver()`

**Public Methods**:

```typescript
class SymbolResolver {
  /**
   * Resolve entities for an entry using symbol table
   * 
   * @param entryIR - EntryIR to resolve entities for
   * @returns Resolved entities, updated IR, and warnings
   */
  async resolveEntitiesForEntry(entryIR: EntryIR): Promise<{
    resolved: EntitySymbol[];
    updatedIR: EntryIR;
    warnings: string[];
  }>
}
```

**Frozen Contract**:
- Method name: `resolveEntitiesForEntry`
- Parameters: `(entryIR: EntryIR)`
- Return type: `Promise<{ resolved: EntitySymbol[]; updatedIR: EntryIR; warnings: string[] }>`
- Behavior: Resolves entities via symbol table, returns resolved symbols and updated IR

**Breaking Changes Forbidden**:
- Cannot change parameter types
- Cannot change return type structure
- Cannot remove method
- Cannot change method name

---

### IncrementalCompiler

**File**: `apps/server/src/services/compiler/incrementalCompiler.ts`

**Export**: `export const incrementalCompiler = new IncrementalCompiler()`

**Public Methods**:

```typescript
class IncrementalCompiler {
  /**
   * Incrementally compile changed entries
   * 
   * @param userId - User ID
   * @param changedEntryIds - Array of changed entry IDs
   * @returns Promise that resolves when compilation completes
   * 
   * @throws Error if compilation fails
   */
  async incrementalCompile(userId: string, changedEntryIds: string[]): Promise<void>
}
```

**Frozen Contract**:
- Method name: `incrementalCompile`
- Parameters: `(userId: string, changedEntryIds: string[])`
- Return type: `Promise<void>`
- Behavior: Recompiles affected entries (transitive closure), updates database

**Breaking Changes Forbidden**:
- Cannot change parameter types
- Cannot change return type
- Cannot remove method
- Cannot change method name

---

### EpistemicLatticeService

**File**: `apps/server/src/services/compiler/epistemicLattice.ts`

**Export**: `export const epistemicLatticeService = new EpistemicLatticeService()`

**Public Methods**:

```typescript
class EpistemicLatticeService {
  /**
   * Check if promotion is allowed by lattice
   */
  isPromotionAllowed(from: KnowledgeType, to: KnowledgeType): boolean

  /**
   * Type check promotion attempt (compile-time enforcement)
   * @throws EpistemicViolation if promotion is invalid
   */
  epistemicTypeCheck(attempt: PromotionAttempt): void

  /**
   * Enforce epistemic safety (automatic downgrading)
   */
  enforceEpistemicSafety(entry: EntryIR): EntryIR

  /**
   * Check if contract allows entry
   */
  contractAllows(contract: SensemakingContract, entry: EntryIR): boolean

  /**
   * Generate proof for promotion
   */
  generateProof(
    from: KnowledgeType,
    to: KnowledgeType,
    evidenceEntries: EntryIR[],
    generatedBy?: 'SYSTEM' | 'USER',
    reasoning?: string
  ): EpistemicProof

  /**
   * Check if downgrade is allowed (always allowed)
   */
  isDowngradeAllowed(from: KnowledgeType, to: KnowledgeType): boolean
}
```

**Frozen Contract**:
- All method signatures are frozen
- Lattice rules are frozen (see `EpistemicLattice` constant)
- Forbidden edges are frozen

**Breaking Changes Forbidden**:
- Cannot change method signatures
- Cannot change lattice rules
- Cannot change forbidden edges

---

### ContractLayer

**File**: `apps/server/src/services/compiler/contractLayer.ts`

**Export**: `export const contractLayer = new ContractLayer()`

**Public Methods**:

```typescript
class ContractLayer {
  /**
   * Apply a contract to filter entries
   */
  applyContract(contract: SensemakingContract, entries: EntryIR[]): ConstrainedMemoryView

  /**
   * Get contract by name
   */
  getContract(name: string): SensemakingContract | null

  /**
   * Check if inference is allowed for a contract
   */
  isInferenceAllowed(contract: SensemakingContract): boolean

  /**
   * Get inference label for a contract
   */
  getInferenceLabel(contract: SensemakingContract): InferenceLabel

  /**
   * Check if uncertainty must be labeled
   */
  mustLabelUncertainty(contract: SensemakingContract): boolean

  /**
   * Format output with uncertainty labels if required
   */
  formatOutputWithUncertainty(
    contract: SensemakingContract,
    content: string,
    confidence: number
  ): string

  /**
   * Format inference with label if allowed
   */
  formatInference(contract: SensemakingContract, inference: string): string

  /**
   * Check if canon status is allowed for contract
   */
  canonAllowed(contract: SensemakingContract, entry: EntryIR): boolean
}
```

**Frozen Contract**:
- All method signatures are frozen
- CONTRACTS object is frozen (ARCHIVIST, ANALYST, REFLECTOR, THERAPIST, STRATEGIST)

**Breaking Changes Forbidden**:
- Cannot change method signatures
- Cannot modify CONTRACTS object
- Cannot remove contracts

---

### EpistemicInvariants

**File**: `apps/server/src/services/compiler/epistemicInvariants.ts`

**Export**: `export const epistemicInvariants = new EpistemicInvariants()`

**Public Methods**:

```typescript
class EpistemicInvariants {
  /**
   * Run all invariant checks
   */
  checkAllInvariants(entries: EntryIR[]): InvariantViolation[]

  /**
   * Assert invariants (throws on violation)
   * @throws Error if any invariant is violated
   */
  assertInvariants(entries: EntryIR[]): void
}
```

**Frozen Contract**:
- Method signatures are frozen
- Invariant definitions are frozen (8 invariants)

**Breaking Changes Forbidden**:
- Cannot change method signatures
- Cannot remove invariants
- Cannot change invariant definitions

---

### DependencyGraph

**File**: `apps/server/src/services/compiler/dependencyGraph.ts`

**Export**: `export const dependencyGraph = new DependencyGraph()`

**Public Methods**:

```typescript
class DependencyGraph {
  /**
   * Update dependency graph for an IR entry
   */
  async updateDependencyGraph(ir: EntryIR): Promise<void>

  /**
   * Get affected entries (transitive closure)
   */
  async getAffectedEntries(changedEntryIds: string[]): Promise<Set<string>>
}
```

**Frozen Contract**:
- Method signatures are frozen
- Dependency tracking behavior is frozen

**Breaking Changes Forbidden**:
- Cannot change method signatures
- Cannot change dependency tracking behavior

---

### EntitySymbolTable

**File**: `apps/server/src/services/compiler/symbolTable.ts`

**Export**: `export const entitySymbolTable = new EntitySymbolTable()`

**Public Methods**:

```typescript
class EntitySymbolTable {
  /**
   * Enter a new scope
   */
  async enterScope(
    scopeType: ScopeType,
    scopeId: string,
    parentScopeId?: string
  ): Promise<void>

  /**
   * Define a symbol in a scope
   */
  async defineSymbol(scopeId: string, symbol: EntitySymbol): Promise<void>

  /**
   * Resolve a symbol by name (walk up scope chain)
   */
  async resolve(name: string, scopeId: string): Promise<EntitySymbol | null>

  /**
   * Load scope from database
   */
  async loadScope(scopeId: string): Promise<void>
}
```

**Frozen Contract**:
- Method signatures are frozen
- Scope resolution algorithm is frozen

**Breaking Changes Forbidden**:
- Cannot change method signatures
- Cannot change scope resolution behavior

---

## Type Definitions

### Core Types

**File**: `apps/server/src/services/compiler/types.ts`

**Frozen Types**:

```typescript
type KnowledgeType = 
  | 'EXPERIENCE'
  | 'FEELING'
  | 'BELIEF'
  | 'FACT'
  | 'DECISION'
  | 'QUESTION'

type CanonStatus = 
  | 'CANON'
  | 'ROLEPLAY'
  | 'HYPOTHETICAL'
  | 'FICTIONAL'
  | 'THOUGHT_EXPERIMENT'
  | 'META'

type CertaintySource = 
  | 'DIRECT_EXPERIENCE'
  | 'INFERENCE'
  | 'HEARSAY'
  | 'VERIFICATION'
  | 'MEMORY_RECALL'

interface EntryIR {
  id: string
  user_id: string
  source_utterance_id: string
  thread_id: string
  timestamp: string
  knowledge_type: KnowledgeType
  canon: CanonMetadata
  content: string
  entities: EntityRef[]
  emotions: EmotionSignal[]
  themes: ThemeSignal[]
  confidence: number
  certainty_source: CertaintySource
  narrative_links: NarrativeLinks
  compiler_flags: CompilerFlags
}

interface CanonMetadata {
  status: CanonStatus
  source: 'USER' | 'SYSTEM'
  confidence: number
  classified_at?: string
  overridden_at?: string
}

interface EntityRef {
  entity_id: string
  mention_text: string
  confidence: number
  role?: string
}

interface EmotionSignal {
  emotion: string
  intensity: number
  confidence: number
}

interface ThemeSignal {
  theme: string
  confidence: number
}

interface NarrativeLinks {
  previous_entry_id?: string
  related_entry_ids?: string[]
}

interface CompilerFlags {
  is_dirty: boolean
  is_deprecated: boolean
  last_compiled_at: string
  compilation_version: number
  downgraded_from_fact?: boolean
  promoted_from_feeling?: boolean
  promotion_proof?: EpistemicProof
}
```

**Breaking Changes Forbidden**:
- Cannot remove type members
- Cannot change type names
- Cannot change union type members
- Cannot change interface property types
- Cannot make required properties optional (or vice versa)

**Allowed Changes**:
- Can add new union members (e.g., new KnowledgeType)
- Can add optional properties to interfaces
- Can add new types

---

### Contract Types

**File**: `apps/server/src/services/compiler/contractLayer.ts`

**Frozen Types**:

```typescript
type InferenceLabel = 'INSIGHT' | 'REFLECTION' | 'INFERENCE' | 'NONE'

interface InferencePolicy {
  allowed: boolean
  label: InferenceLabel
}

interface OutputRequirements {
  mustLabelUncertainty: boolean
}

interface SensemakingContract {
  name: string
  allowedKnowledgeTypes: KnowledgeType[]
  inferencePolicy: InferencePolicy
  outputRequirements: OutputRequirements
  minConfidence?: number
}

interface ConstrainedMemoryView {
  entries: EntryIR[]
  contract: SensemakingContract
  metadata: {
    totalEntries: number
    filteredEntries: number
    excludedTypes: KnowledgeType[]
  }
}
```

**Breaking Changes Forbidden**:
- Cannot modify CONTRACTS object
- Cannot change contract definitions

---

### Lattice Types

**File**: `apps/server/src/services/compiler/epistemicLattice.ts`

**Frozen Types**:

```typescript
interface EpistemicProof {
  rule_id: string
  source_entries: string[]
  confidence: number
  generated_at: string
  generated_by: 'SYSTEM' | 'USER'
  reasoning?: string
}

interface PromotionAttempt {
  from: KnowledgeType
  to: KnowledgeType
  proof?: EpistemicProof
  entry_id?: string
}

class EpistemicViolation extends Error {
  constructor(
    message: string,
    public readonly attempt?: PromotionAttempt
  )
}
```

**Frozen Constants**:

```typescript
const EpistemicLattice = {
  ordering: {
    EXPERIENCE: ['FACT'],
    BELIEF: ['FACT'],
    FACT: [],
    FEELING: [],
    DECISION: [],
    QUESTION: [],
  },
  forbidden: {
    FEELING: ['FACT', 'BELIEF'],
    QUESTION: ['FACT', 'BELIEF', 'EXPERIENCE'],
    DECISION: ['FACT'],
  },
}
```

**Breaking Changes Forbidden**:
- Cannot modify EpistemicLattice constant
- Cannot change lattice rules
- Cannot change forbidden edges

---

### Symbol Table Types

**File**: `apps/server/src/services/compiler/symbolTable.ts`

**Frozen Types**:

```typescript
type EntityType = 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT' | 'CONCEPT'

type ScopeType = 'GLOBAL' | 'ERA' | 'EVENT' | 'THREAD'

type CertaintySource = 'DIRECT_EXPERIENCE' | 'REFERENCE' | 'INFERENCE'

interface EntitySymbol {
  id: string
  canonical_name: string
  entity_type: EntityType
  aliases: string[]
  confidence: number
  introduced_by_entry_id: string
  certainty_source: CertaintySource
}

interface SymbolScope {
  scope_id: string
  scope_type: ScopeType
  parent_scope_id?: string
  symbols: Map<string, EntitySymbol>
}
```

**Breaking Changes Forbidden**:
- Cannot remove type members
- Cannot change type names

---

## Service Exports

**All services are exported as singleton instances:**

```typescript
// irCompiler.ts
export const irCompiler = new IRCompiler()

// symbolResolver.ts
export const symbolResolver = new SymbolResolver()

// incrementalCompiler.ts
export const incrementalCompiler = new IncrementalCompiler()

// epistemicLattice.ts
export const epistemicLatticeService = new EpistemicLatticeService()

// contractLayer.ts
export const contractLayer = new ContractLayer()

// epistemicInvariants.ts
export const epistemicInvariants = new EpistemicInvariants()

// dependencyGraph.ts
export const dependencyGraph = new DependencyGraph()

// symbolTable.ts
export const entitySymbolTable = new EntitySymbolTable()
```

**Breaking Changes Forbidden**:
- Cannot remove exports
- Cannot rename exports
- Cannot change export types

---

## Database Schema

### Frozen Tables

**All tables and columns are frozen. No deletions or type changes allowed.**

#### entry_ir

**Frozen Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `source_utterance_id` (UUID, FOREIGN KEY)
- `thread_id` (UUID)
- `timestamp` (TIMESTAMPTZ)
- `knowledge_type` (TEXT)
- `canon` (JSONB)
- `content` (TEXT)
- `entities` (JSONB)
- `emotions` (JSONB)
- `themes` (JSONB)
- `confidence` (FLOAT)
- `certainty_source` (TEXT)
- `narrative_links` (JSONB)
- `compiler_flags` (JSONB)

**Breaking Changes Forbidden**:
- Cannot delete columns
- Cannot change column types
- Cannot remove constraints
- Cannot remove indexes

**Allowed Changes**:
- Can add new columns (nullable or with defaults)
- Can add new indexes
- Can add new constraints (non-breaking)

#### entry_dependencies

**Frozen Columns**:
- `entry_id` (UUID)
- `dependency_type` (TEXT)
- `dependency_id` (UUID)
- `user_id` (UUID)

**Breaking Changes Forbidden**:
- Cannot delete columns
- Cannot change column types

#### symbol_scopes

**Frozen Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `scope_type` (TEXT)
- `parent_scope_id` (UUID, FOREIGN KEY, nullable)

**Breaking Changes Forbidden**:
- Cannot delete columns
- Cannot change column types

#### entity_symbols

**Frozen Columns**:
- `id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FOREIGN KEY)
- `scope_id` (UUID, FOREIGN KEY)
- `canonical_name` (TEXT)
- `entity_type` (TEXT)
- `aliases` (JSONB)
- `confidence` (FLOAT)
- `introduced_by_entry_id` (UUID, FOREIGN KEY, nullable)
- `certainty_source` (TEXT)

**Breaking Changes Forbidden**:
- Cannot delete columns
- Cannot change column types

---

## Migration Policy

### Version Compatibility

**LNC v0.1 is backward compatible with itself only.**

- **No forward compatibility**: v0.1 code may not work with v0.2+
- **No backward compatibility**: v0.2+ code may not work with v0.1

### Database Migrations

**For v0.1**:
- All migrations are additive only (no deletions)
- New columns must be nullable or have defaults
- New indexes are allowed
- New constraints are allowed (non-breaking)

**For v0.2+**:
- Breaking changes require migration scripts
- Deprecated columns must be marked before deletion
- Migration guide will be provided

### Code Migrations

**For v0.1**:
- No breaking changes to public API
- Internal refactoring is allowed
- Bug fixes are allowed

**For v0.2+**:
- Breaking changes require deprecation period
- Deprecated methods must be marked with `@deprecated`
- Migration guide will be provided

---

## Breaking Change Policy

### Definition

A **breaking change** is any change that:
1. Requires code changes in consuming code
2. Changes runtime behavior in a way that breaks existing functionality
3. Removes or renames public APIs
4. Changes type definitions in a way that breaks type checking
5. Deletes database columns or changes column types

### Process

**For v0.1**:
- **No breaking changes allowed**
- All changes must be backward compatible

**For v0.2+**:
1. **Deprecation period**: Mark APIs as deprecated for at least 1 release
2. **Migration guide**: Provide clear migration instructions
3. **Version bump**: Increment minor or major version
4. **Documentation**: Update all documentation

### Examples of Breaking Changes

**Forbidden in v0.1**:
- Changing method signature: `compile(userId, text)` → `compile(text, userId)`
- Removing method: `compile()` → (removed)
- Changing return type: `Promise<EntryIR>` → `Promise<EntryIR[]>` 
- Deleting database column: `content` → (deleted)
- Changing type: `KnowledgeType` → `KnowledgeTypeV2`

**Allowed in v0.1**:
- Adding new method: `compile()` + `compileBatch()`
- Adding optional parameter: `compile(userId, text)` → `compile(userId, text, options?)`
- Adding new type: `KnowledgeType` + `KnowledgeTypeV2`
- Adding database column: `content` + `content_v2`

---

## Versioning

### Version Format

`MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (v0.1 → v1.0)
- **MINOR**: New features, non-breaking changes (v0.1 → v0.2)
- **PATCH**: Bug fixes, non-breaking changes (v0.1 → v0.1.1)

### Current Version

**v0.1**: Frozen specification, no breaking changes allowed

### Future Versions

- **v0.2**: Planned improvements (LLM classification, confidence decay)
- **v1.0**: Stable API with backward compatibility guarantees

---

**End of API Documentation**

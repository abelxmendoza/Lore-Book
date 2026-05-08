# LNC Developer Guide

**Version**: 0.1  
**Date**: 2025-01-XX  
**Purpose**: Guide for developers extending and debugging LNC

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How to Extend LNC](#how-to-extend-lnc)
3. [Testing Guidelines](#testing-guidelines)
4. [Debugging Tips](#debugging-tips)
5. [Performance Considerations](#performance-considerations)
6. [Common Patterns](#common-patterns)

---

## Architecture Overview

### Core Components

LNC consists of several key components:

```
┌─────────────────────────────────────────────────────────┐
│                    Entry Input                           │
│              (Journal Entry Text)                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  IRCompiler                              │
│  - Classifies knowledge type                            │
│  - Extracts entities, emotions, themes                  │
│  - Calculates confidence                                │
│  - Creates EntryIR                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              SymbolResolver                             │
│  - Resolves entity names                                │
│  - Creates new symbols                                 │
│  - Type checks entity usage                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            EpistemicLatticeService                      │
│  - Validates promotions                                 │
│  - Enforces epistemic safety                            │
│  - Generates proofs                                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                ContractLayer                            │
│  - Filters entries by knowledge type                    │
│  - Applies canon gating                                 │
│  - Enforces epistemic boundaries                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            IncrementalCompiler                          │
│  - Tracks dependencies                                  │
│  - Recompiles affected entries                          │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Entry Input** → User writes journal entry
2. **IRCompiler.compile()** → Classifies and extracts metadata
3. **SymbolResolver.resolveEntitiesForEntry()** → Resolves entities
4. **EpistemicLatticeService.enforceEpistemicSafety()** → Validates and enforces safety
5. **ContractLayer.applyContract()** → Filters entries for specific use cases
6. **Database** → Stores EntryIR, dependencies, symbols

### Key Data Structures

**EntryIR**: The compiled representation of a journal entry
- Contains knowledge type, entities, emotions, themes, confidence
- Stored in `entry_ir` table

**EntitySymbol**: Represents an entity (person, place, thing)
- Contains canonical name, aliases, entity type
- Stored in `entity_symbols` table

**DependencyGraph**: Tracks relationships between entries
- Entry dependencies (narrative links)
- Entity dependencies (which entries mention which entities)
- Stored in `entry_dependencies` table

---

## How to Extend LNC

### Adding a New Knowledge Type

**⚠️ Breaking Change**: Adding new knowledge types requires database migration and may break existing code.

**Steps**:

1. **Update Type Definition** (`types.ts`):
   ```typescript
   export type KnowledgeType = 
     | 'EXPERIENCE'
     | 'FEELING'
     | 'BELIEF'
     | 'FACT'
     | 'DECISION'
     | 'QUESTION'
     | 'OPINION' // New type
   ```

2. **Update Classification** (`irCompiler.ts`):
   ```typescript
   private async classifyKnowledge(text: string): Promise<KnowledgeType> {
     // Add pattern for new type
     if (/\b(i opine|my opinion|i view)\b/gi.test(text)) {
       return 'OPINION';
     }
     // ... existing patterns
   }
   ```

3. **Update Lattice** (`epistemicLattice.ts`):
   ```typescript
   ordering: {
     // ... existing
     OPINION: ['BELIEF'], // Can promote to BELIEF
   },
   forbidden: {
     // ... existing
     OPINION: ['FACT'], // Cannot promote to FACT
   }
   ```

4. **Update Contracts** (`contractLayer.ts`):
   ```typescript
   REFLECTOR: {
     allowedKnowledgeTypes: ['EXPERIENCE', 'FEELING', 'BELIEF', 'OPINION'],
     // ...
   }
   ```

5. **Database Migration**:
   ```sql
   -- Update CHECK constraint
   ALTER TABLE entry_ir 
   DROP CONSTRAINT check_knowledge_type;
   
   ALTER TABLE entry_ir 
   ADD CONSTRAINT check_knowledge_type 
   CHECK (knowledge_type IN ('EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION', 'OPINION'));
   ```

6. **Update Tests**: Add tests for new type

### Adding a New Contract

**Non-Breaking**: Adding new contracts is safe.

**Steps**:

1. **Define Contract** (`contractLayer.ts`):
   ```typescript
   export const CONTRACTS = {
     // ... existing contracts
     NEW_CONTRACT: {
       name: 'NEW_CONTRACT',
       allowedKnowledgeTypes: ['EXPERIENCE', 'FACT'],
       inferencePolicy: {
         allowed: true,
         label: 'INSIGHT',
       },
       outputRequirements: {
         mustLabelUncertainty: true,
       },
       minConfidence: 0.7,
     },
   };
   ```

2. **Update Canon Gating** (`contractLayer.ts`):
   ```typescript
   canonAllowed(contract: SensemakingContract, entry: EntryIR): boolean {
     // ... existing logic
     if (contract.name === 'NEW_CONTRACT') {
       return canonStatus === 'CANON';
     }
     // ...
   }
   ```

3. **Add Tests**: Test contract filtering behavior

### Adding a New Entity Type

**Non-Breaking**: Adding new entity types is safe.

**Steps**:

1. **Update Type Definition** (`symbolTable.ts`):
   ```typescript
   export type EntityType = 
     | 'PERSON' 
     | 'CHARACTER' 
     | 'LOCATION' 
     | 'ORG' 
     | 'EVENT' 
     | 'CONCEPT'
     | 'OBJECT' // New type
   ```

2. **Update Database** (if needed):
   ```sql
   ALTER TABLE entity_symbols 
   DROP CONSTRAINT check_entity_type;
   
   ALTER TABLE entity_symbols 
   ADD CONSTRAINT check_entity_type 
   CHECK (entity_type IN ('PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT'));
   ```

3. **Update Type Inference** (`symbolResolver.ts`):
   ```typescript
   private mapEntityType(dbType: string): EntityType {
     const mapping: Record<string, EntityType> = {
       // ... existing
       object: 'OBJECT',
     };
     return mapping[dbType.toLowerCase()] || 'PERSON';
   }
   ```

### Improving Classification Accuracy

**Non-Breaking**: Improving classification is safe.

**Options**:

1. **Add More Patterns** (`irCompiler.ts`):
   ```typescript
   private async classifyKnowledge(text: string): Promise<KnowledgeType> {
     // Add more specific patterns
     if (/\b(i specifically|i definitely|i clearly)\s+(went|did|met)\b/gi.test(text)) {
       return 'EXPERIENCE';
     }
     // ...
   }
   ```

2. **Use LLM for Ambiguous Cases** (Future):
   ```typescript
   private async classifyKnowledge(text: string): Promise<KnowledgeType> {
     // Try regex first
     const regexResult = this.classifyByRegex(text);
     
     // If ambiguous, use LLM
     if (this.isAmbiguous(regexResult, text)) {
       return await this.classifyByLLM(text);
     }
     
     return regexResult;
   }
   ```

3. **Add Confidence Thresholds**:
   ```typescript
   private async classifyKnowledge(text: string): Promise<KnowledgeType> {
     const result = this.classifyByRegex(text);
     
     // If confidence is low, mark as ambiguous
     if (this.calculateConfidence(result, text) < 0.6) {
       // Use LLM or ask user
     }
     
     return result;
   }
   ```

---

## Testing Guidelines

### Running Tests

```bash
# Run all LNC tests
npm test apps/server/src/services/compiler

# Run specific test file
npm test apps/server/src/services/compiler/classification.test.ts

# Run with coverage
npm test -- --coverage apps/server/src/services/compiler
```

### Writing Tests

**Structure**:
```typescript
import { describe, it, expect } from 'vitest';
import { irCompiler } from './irCompiler';

describe('Feature Name', () => {
  it('should do something', async () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = await irCompiler.compile(userId, utteranceId, input);
    
    // Assert
    expect(result.knowledge_type).toBe('EXPERIENCE');
  });
});
```

### Test Categories

1. **Unit Tests**: Test individual functions/methods
2. **Integration Tests**: Test component interactions
3. **Edge Case Tests**: Test boundary conditions
4. **Invariant Tests**: Test epistemic invariants

### Test Data

- Use `test-data/classification-samples.ts` for classification tests
- Create test fixtures for complex scenarios
- Use `createTestEntryIR()` helper for EntryIR creation

---

## Debugging Tips

### Common Issues

#### 1. Classification Misclassification

**Symptoms**: Entry classified as wrong type

**Debug Steps**:
1. Check regex patterns in `irCompiler.classifyKnowledge()`
2. Add logging to see which pattern matched:
   ```typescript
   console.log('Matched pattern:', pattern, 'for text:', text);
   ```
3. Test with `classification.test.ts` to see accuracy

**Fix**: Add more specific patterns or improve existing ones

#### 2. Entity Resolution Failures

**Symptoms**: Entity not found or wrong entity resolved

**Debug Steps**:
1. Check symbol table scope:
   ```typescript
   const scope = await entitySymbolTable.loadScope(scopeId);
   console.log('Scope symbols:', scope.symbols);
   ```
2. Check scope chain walking:
   ```typescript
   const resolved = await entitySymbolTable.resolve(name, scopeId);
   console.log('Resolved:', resolved);
   ```
3. Check database for entity symbols:
   ```sql
   SELECT * FROM entity_symbols WHERE canonical_name ILIKE '%Sarah%';
   ```

**Fix**: 
- Ensure symbol is defined in correct scope
- Check parent scope chain
- Verify entity_id matches

#### 3. Invariant Violations

**Symptoms**: `EpistemicViolation` errors

**Debug Steps**:
1. Check which invariant failed:
   ```typescript
   const violations = epistemicInvariants.checkAllInvariants(entries);
   console.log('Violations:', violations);
   ```
2. Check contract filtering:
   ```typescript
   const view = contractLayer.applyContract(CONTRACTS.ARCHIVIST, entries);
   console.log('Filtered entries:', view.entries);
   ```
3. Check lattice rules:
   ```typescript
   const allowed = epistemicLatticeService.isPromotionAllowed(from, to);
   console.log('Promotion allowed:', allowed);
   ```

**Fix**: 
- Ensure entries match contract requirements
- Check promotion rules in lattice
- Verify canon status

#### 4. Incremental Compilation Issues

**Symptoms**: Entries not recompiling when dependencies change

**Debug Steps**:
1. Check dependency graph:
   ```typescript
   const affected = await dependencyGraph.getAffectedEntries([entryId]);
   console.log('Affected entries:', affected);
   ```
2. Check entry dependencies:
   ```sql
   SELECT * FROM entry_dependencies WHERE entry_id = 'entry-id';
   ```
3. Check compilation version:
   ```typescript
   console.log('Compilation version:', entry.compiler_flags.compilation_version);
   ```

**Fix**:
- Ensure dependencies are tracked correctly
- Verify transitive closure calculation
- Check incremental compiler is called

### Debugging Tools

1. **Logging**: Use `logger.debug()` for detailed logs
2. **Database Queries**: Query `entry_ir`, `entry_dependencies`, `entity_symbols`
3. **Test Suite**: Run tests to verify behavior
4. **Type Checking**: Use TypeScript to catch type errors

---

## Performance Considerations

### Optimization Strategies

1. **Caching**: Cache symbol table lookups
2. **Batch Operations**: Process multiple entries at once
3. **Lazy Loading**: Load symbols only when needed
4. **Indexing**: Ensure database indexes are optimized

### Performance Metrics

- **Entry Compilation**: < 1 second
- **Symbol Resolution**: < 100ms
- **Incremental Compilation**: < 10 seconds for 100 entries
- **Contract Filtering**: < 50ms for 1000 entries

### Profiling

```typescript
// Profile compilation
const start = Date.now();
const ir = await irCompiler.compile(userId, utteranceId, text);
const duration = Date.now() - start;
console.log(`Compilation took ${duration}ms`);
```

---

## Common Patterns

### Pattern 1: Creating Test EntryIR

```typescript
function createTestEntryIR(overrides: Partial<EntryIR> = {}): EntryIR {
  return {
    id: `entry-${Date.now()}`,
    user_id: 'test-user',
    source_utterance_id: 'test-utterance',
    thread_id: 'test-thread',
    timestamp: new Date().toISOString(),
    knowledge_type: 'EXPERIENCE',
    canon: {
      status: 'CANON',
      source: 'SYSTEM',
      confidence: 0.6,
    },
    content: 'Test entry',
    entities: [],
    emotions: [],
    themes: [],
    confidence: 0.7,
    certainty_source: 'DIRECT_EXPERIENCE',
    narrative_links: {},
    compiler_flags: {
      is_dirty: false,
      is_deprecated: false,
      last_compiled_at: new Date().toISOString(),
      compilation_version: 1,
    },
    ...overrides,
  };
}
```

### Pattern 2: Testing Contract Filtering

```typescript
it('should filter entries by contract', () => {
  const entries: EntryIR[] = [
    createTestEntryIR({ knowledge_type: 'BELIEF' }),
    createTestEntryIR({ knowledge_type: 'FACT' }),
  ];

  const view = contractLayer.applyContract(CONTRACTS.ARCHIVIST, entries);
  
  // ARCHIVIST only allows EXPERIENCE and FACT
  expect(view.entries.length).toBe(1);
  expect(view.entries[0].knowledge_type).toBe('FACT');
});
```

### Pattern 3: Testing Invariants

```typescript
it('should not violate invariants', () => {
  const entries: EntryIR[] = [/* ... */];
  
  const violations = epistemicInvariants.checkAllInvariants(entries);
  
  expect(violations.length).toBe(0);
});
```

### Pattern 4: Testing Symbol Resolution

```typescript
it('should resolve entity by name', async () => {
  const scopeId = 'test-scope';
  await entitySymbolTable.enterScope('THREAD', scopeId);
  
  const entry = createTestEntryIR(scopeId, [
    { entity_id: 'entity-1', mention_text: 'Sarah', confidence: 0.8 },
  ]);
  
  const result = await symbolResolver.resolveEntitiesForEntry(entry);
  
  expect(result.resolved.length).toBeGreaterThan(0);
});
```

---

## Resources

- **Specification**: `docs/LNC_V0.1_SPECIFICATION.md`
- **API Documentation**: `docs/LNC_V0.1_API.md`
- **Migration Guide**: `docs/LNC_MIGRATION_GUIDE.md`
- **User Guide**: `LNC_USER_GUIDE.md`
- **Test Files**: `apps/server/src/services/compiler/*.test.ts`

---

**End of Developer Guide**

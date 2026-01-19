# LNC Migration Guide

**Version**: 0.1  
**Date**: 2025-01-XX  
**Purpose**: Guide for migrating between LNC versions and extending LNC without breaking changes

---

## Table of Contents

1. [Version History](#version-history)
2. [Breaking Change Policy](#breaking-change-policy)
3. [Migration from v0.1 to v0.2](#migration-from-v01-to-v02)
4. [Migration from v0.2 to v1.0](#migration-from-v02-to-v10)
5. [Extending LNC Without Breaking Changes](#extending-lnc-without-breaking-changes)
6. [Deprecation Process](#deprecation-process)
7. [Backward Compatibility Guidelines](#backward-compatibility-guidelines)

---

## Version History

### v0.1 (2025-01-XX) - FROZEN

**Status**: Initial frozen specification

**Features**:
- Entry Intermediate Representation (IR)
- Epistemic types (EXPERIENCE, FEELING, BELIEF, FACT, DECISION, QUESTION)
- Epistemic lattice with promotion rules
- Contract layer (ARCHIVIST, ANALYST, REFLECTOR, THERAPIST, STRATEGIST)
- Symbol table with scope resolution
- Incremental compilation
- 8 epistemic invariants

**API**: Frozen (no breaking changes allowed)

**Database**: Frozen (no column deletions or type changes)

---

### v0.2 (Planned)

**Status**: Planned improvements

**Planned Features**:
- LLM-based classification for ambiguous entries
- Confidence decay model
- Context-aware entity disambiguation
- Improved canon classification

**Breaking Changes**: None (backward compatible with v0.1)

**Migration**: No migration required (drop-in replacement)

---

### v1.0 (Planned)

**Status**: Stable release

**Planned Features**:
- Stable API with backward compatibility guarantees
- Performance optimizations
- Enhanced error handling
- Comprehensive test coverage

**Breaking Changes**: TBD (will be documented)

**Migration**: Migration guide will be provided

---

## Breaking Change Policy

### Definition

A **breaking change** is any change that:
1. Requires code changes in consuming code
2. Changes runtime behavior in a way that breaks existing functionality
3. Removes or renames public APIs
4. Changes type definitions in a way that breaks type checking
5. Deletes database columns or changes column types

### Policy

**v0.1**: No breaking changes allowed

**v0.2+**: Breaking changes require:
1. Deprecation period (at least 1 release)
2. Migration guide
3. Version bump (minor or major)
4. Documentation updates

---

## Migration from v0.1 to v0.2

**Status**: Not yet released (planned)

**Expected Changes**:
- New optional parameters to existing methods
- New methods for LLM classification
- New database columns (nullable or with defaults)
- Enhanced classification accuracy

**Migration Steps** (when v0.2 is released):

1. **Update dependencies**: `npm install @lorekeeper/lnc@^0.2.0`

2. **No code changes required**: v0.2 is backward compatible with v0.1

3. **Optional**: Use new LLM classification features:
   ```typescript
   // Old (still works)
   const ir = await irCompiler.compile(userId, utteranceId, text)
   
   // New (optional)
   const ir = await irCompiler.compile(userId, utteranceId, text, {
     useLLMClassification: true
   })
   ```

4. **Database migration**: Run migration scripts (if any)
   ```bash
   npm run migrate:lnc
   ```

5. **Test**: Run test suite to verify compatibility
   ```bash
   npm test
   ```

**Rollback**: If issues occur, downgrade to v0.1:
```bash
npm install @lorekeeper/lnc@^0.1.0
```

---

## Migration from v0.2 to v1.0

**Status**: Not yet released (planned)

**Expected Changes**: TBD (will be documented when v1.0 is released)

**Migration Steps** (when v1.0 is released):

1. **Review breaking changes**: Check migration guide for v1.0

2. **Update dependencies**: `npm install @lorekeeper/lnc@^1.0.0`

3. **Update code**: Follow migration guide for breaking changes

4. **Database migration**: Run migration scripts
   ```bash
   npm run migrate:lnc
   ```

5. **Test**: Run test suite
   ```bash
   npm test
   ```

**Rollback**: If issues occur, downgrade to v0.2:
```bash
npm install @lorekeeper/lnc@^0.2.0
```

---

## Extending LNC Without Breaking Changes

### Adding New Methods

**Allowed**: Adding new methods to existing classes

**Example**:
```typescript
class IRCompiler {
  // Existing (frozen)
  async compile(userId: string, utteranceId: string, text: string): Promise<EntryIR>
  
  // New (allowed)
  async compileBatch(userId: string, entries: Array<{utteranceId: string, text: string}>): Promise<EntryIR[]>
}
```

### Adding Optional Parameters

**Allowed**: Adding optional parameters to existing methods

**Example**:
```typescript
// Old signature (still works)
async compile(userId: string, utteranceId: string, text: string): Promise<EntryIR>

// New signature (backward compatible)
async compile(
  userId: string, 
  utteranceId: string, 
  text: string,
  options?: { useLLM?: boolean }
): Promise<EntryIR>
```

### Adding New Types

**Allowed**: Adding new types (as long as they don't conflict with existing types)

**Example**:
```typescript
// Existing (frozen)
type KnowledgeType = 'EXPERIENCE' | 'FEELING' | 'BELIEF' | 'FACT' | 'DECISION' | 'QUESTION'

// New type (allowed)
type KnowledgeTypeV2 = KnowledgeType | 'OPINION' | 'GOAL'
```

### Adding Database Columns

**Allowed**: Adding new columns (must be nullable or have defaults)

**Example**:
```sql
-- Allowed: nullable column
ALTER TABLE entry_ir ADD COLUMN classification_confidence FLOAT;

-- Allowed: column with default
ALTER TABLE entry_ir ADD COLUMN llm_classified BOOLEAN DEFAULT false;
```

### Forbidden Changes

**Not Allowed**:
- Removing methods
- Renaming methods
- Changing parameter types or order
- Changing return types
- Removing type members
- Deleting database columns
- Changing column types

---

## Deprecation Process

### When to Deprecate

Deprecate APIs when:
1. A better alternative exists
2. The API is no longer recommended
3. The API will be removed in a future version

### How to Deprecate

1. **Mark as deprecated**: Use `@deprecated` JSDoc tag
   ```typescript
   /**
    * @deprecated Use compileBatch() instead. Will be removed in v1.0.
    */
   async compileSingle(...): Promise<EntryIR>
   ```

2. **Document replacement**: Provide clear migration path
   ```typescript
   /**
    * @deprecated Use compileBatch() instead. Will be removed in v1.0.
    * 
    * Migration:
    * ```typescript
    * // Old
    * const ir = await compiler.compileSingle(userId, utteranceId, text)
    * 
    * // New
    * const irs = await compiler.compileBatch(userId, [{utteranceId, text}])
    * const ir = irs[0]
    * ```
    */
   async compileSingle(...): Promise<EntryIR>
   ```

3. **Maintain functionality**: Deprecated APIs must still work
   - No breaking changes during deprecation period
   - Maintain backward compatibility
   - Log deprecation warnings (optional)

4. **Remove in next major version**: Remove deprecated APIs in next major version
   - v0.1 → v0.2: Deprecate
   - v0.2 → v1.0: Remove

### Deprecation Timeline

**Minimum deprecation period**: 1 release cycle

**Example**:
- v0.1: API is stable
- v0.2: API is deprecated (still works, but marked as deprecated)
- v1.0: API is removed (breaking change)

---

## Backward Compatibility Guidelines

### Code Compatibility

**Maintain**:
- All public method signatures
- All public type definitions
- All service exports
- All contract definitions

**Can Change**:
- Internal implementation
- Private methods
- Performance optimizations
- Bug fixes (non-breaking)

### Database Compatibility

**Maintain**:
- All table structures
- All column types
- All constraints
- All indexes (for performance)

**Can Change**:
- Add new columns (nullable or with defaults)
- Add new indexes
- Add new constraints (non-breaking)

### Behavior Compatibility

**Maintain**:
- Core behavior (classification, compilation, etc.)
- Invariant enforcement
- Contract filtering
- Lattice rules

**Can Change**:
- Performance (faster is better)
- Accuracy (better classification is better)
- Error messages (as long as errors are still thrown)

---

## Version Compatibility Matrix

| From Version | To Version | Breaking Changes | Migration Required |
|-------------|------------|------------------|-------------------|
| v0.1        | v0.1       | No               | No                |
| v0.1        | v0.2       | No               | No (optional)     |
| v0.1        | v1.0       | Yes (TBD)        | Yes (TBD)         |
| v0.2        | v1.0       | Yes (TBD)        | Yes (TBD)         |

---

## Testing Compatibility

### Before Migration

1. **Run existing tests**: Ensure all tests pass
   ```bash
   npm test
   ```

2. **Check for deprecated APIs**: Search for deprecated method calls
   ```bash
   grep -r "@deprecated" src/
   ```

3. **Review breaking changes**: Check migration guide for target version

### After Migration

1. **Run test suite**: Ensure all tests pass
   ```bash
   npm test
   ```

2. **Run integration tests**: Test with real data
   ```bash
   npm run test:integration
   ```

3. **Check for warnings**: Look for deprecation warnings
   ```bash
   npm run test 2>&1 | grep -i "deprecated"
   ```

---

## Rollback Procedure

If migration causes issues:

1. **Downgrade dependencies**:
   ```bash
   npm install @lorekeeper/lnc@^0.1.0
   ```

2. **Revert database migrations** (if any):
   ```bash
   npm run migrate:rollback
   ```

3. **Revert code changes** (if any):
   ```bash
   git revert <commit-hash>
   ```

4. **Test**: Verify rollback works
   ```bash
   npm test
   ```

---

## Support

### Getting Help

- **Documentation**: See `docs/LNC_V0.1_SPECIFICATION.md` and `docs/LNC_V0.1_API.md`
- **Issues**: Report issues on GitHub
- **Questions**: Ask in Discord/community

### Reporting Breaking Changes

If you encounter a breaking change that's not documented:

1. **Report issue**: Create GitHub issue with:
   - Version numbers (from → to)
   - Code example
   - Error message
   - Expected vs actual behavior

2. **Check for fixes**: Check if fix is already in progress

3. **Workaround**: Use workaround if available (documented in issue)

---

**End of Migration Guide**

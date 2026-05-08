# Narrative Integrity Analysis & Recommendations

## CRITICAL ISSUES FOUND

### 1. ❌ DESTRUCTIVE LANGUAGE & BEHAVIOR

**File**: `apps/server/src/services/intervention/detectors/contradictionDetector.ts`
- **Issue**: Uses accusatory language: "You contradicted a previous statement"
- **Violation**: Blueprint says "DO NOT accuse or label as false"
- **Fix Required**: Change to observational language

**File**: `apps/server/src/services/omegaMemoryService.ts`
- **Issue**: Marks existing claims as `inactive` when conflicts detected (line 51)
- **Violation**: Blueprint says "Entries are NEVER retroactively invalidated"
- **Fix Required**: Keep all claims active, flag as narrative divergence instead

**File**: `apps/server/src/services/truthVerificationService.ts`
- **Issue**: Uses terms "verify", "verified", "contradicted" - implies objective truth
- **Violation**: Blueprint says "LoreKeeper does NOT evaluate objective truth"
- **Fix Required**: Rename to "narrative consistency" service, change language

---

### 2. ❌ MISSING NARRATIVE STATE TRACKING

**Gap**: No `narrative_state` field on entries
- Need: `stable`, `evolving`, `conflicting`, `ambiguous`
- Need: `emotional_intensity`, `factual_density`, `revision_flag`

**Gap**: No narrative divergence detection at entry level
- Current: Only entity-level conflict detection
- Need: Entry-level narrative state assessment

---

### 3. ❌ RECALL DOESN'T SURFACE MULTIPLE VERSIONS

**File**: `apps/server/src/services/chat/memoryRetriever.ts`
- **Issue**: Returns single best match, doesn't show conflicting versions
- **Violation**: Blueprint says "Surface multiple versions if they exist"
- **Fix Required**: When narratives conflict, return all versions with timestamps

---

### 4. ⚠️ LANGUAGE IN SYSTEM PROMPTS

**File**: `apps/server/src/services/omegaChatService.ts`
- **Status**: Generally good, but needs explicit narrative integrity rules
- **Fix Required**: Add language safety rules to system prompt

---

## MINIMAL FIXES REQUIRED

### Priority 1: Language Safety

1. **Rename `truthVerificationService` → `narrativeConsistencyService`**
   - Change "verify" → "check consistency"
   - Change "contradicted" → "narrative divergence"
   - Change "verified" → "consistent with previous entries"

2. **Fix `contradictionDetector.ts` language**
   - Change: "You contradicted..." → "Your descriptions have varied over time"
   - Change: "contradiction detected" → "narrative divergence observed"

3. **Fix `omegaMemoryService.ts` behavior**
   - Remove: `markClaimsInactive()` call
   - Add: Flag as `narrative_divergence: true` instead
   - Keep all claims active

### Priority 2: Narrative State Extension

4. **Add narrative state to entries (non-destructive)**
   - Migration: Add `narrative_state`, `emotional_intensity`, `factual_density` to `journal_entries`
   - Service: `narrativeStateService.ts` to assess and update

5. **Narrative divergence detection**
   - New service: `narrativeDivergenceService.ts`
   - Detects when entries describe same entity/event differently
   - Flags as `conflicting` narrative state
   - Does NOT invalidate entries

### Priority 3: Recall Enhancement

6. **Enhance memory recall to surface multiple versions**
   - Update `memoryRetriever.ts` to:
     - Check for narrative conflicts when retrieving
     - Return all versions with timestamps
     - Annotate: "Earlier entries describe this differently"

7. **Add narrative integrity rules to system prompt**
   - Add explicit language safety rules
   - Prohibit judgmental language
   - Require neutral, observational phrasing

---

## IMPLEMENTATION PLAN

### Phase 1: Language Safety (Immediate)
- [ ] Rename truthVerificationService
- [ ] Fix contradictionDetector language
- [ ] Fix omegaMemoryService destructive behavior
- [ ] Add language safety rules to system prompt

### Phase 2: Narrative State (Next)
- [ ] Create migration for narrative state fields
- [ ] Create narrativeStateService
- [ ] Create narrativeDivergenceService
- [ ] Integrate into entry creation flow

### Phase 3: Recall Enhancement (Polish)
- [ ] Enhance memory recall to surface conflicts
- [ ] Add narrative divergence annotations
- [ ] Update UI to show multiple versions

---

## CODE EXAMPLES

### Before (Destructive):
```typescript
if (await this.conflictDetected(claim, existingClaims)) {
  await this.markClaimsInactive(existingClaims); // ❌ Destructive
  await this.lowerConfidence(existingClaims);
}
```

### After (Non-Destructive):
```typescript
if (await this.narrativeDivergenceDetected(claim, existingClaims)) {
  await this.flagNarrativeDivergence(claim, existingClaims); // ✅ Observational
  // Keep all claims active
  await this.recordNarrativeState(claim, 'conflicting');
}
```

### Before (Accusatory):
```typescript
message: `You contradicted a previous statement: ${contradiction.description}`
```

### After (Observational):
```typescript
message: `Your descriptions of this have varied over time. Earlier entries suggest: ${earlierDescription}`
```

---

## SUCCESS CRITERIA

✅ No entries are ever marked inactive due to conflicts
✅ All language is observational, not judgmental
✅ Multiple versions are surfaced in recall
✅ Narrative state is tracked without evaluation
✅ System admits uncertainty, doesn't resolve it


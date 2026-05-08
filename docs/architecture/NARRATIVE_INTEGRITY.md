# Narrative Integrity — Active Issues

> Source: `NARRATIVE_INTEGRITY_ANALYSIS.md`  
> Status: **These are active bugs, not aspirational goals.**

---

## Critical Issues (Unresolved)

### 1. Destructive Language & Behavior

**`services/intervention/detectors/contradictionDetector.ts`**
- **Bug:** Uses accusatory language: `"You contradicted a previous statement"`
- **Violation:** Core blueprint says DO NOT accuse or label as false
- **Fix:** Change to observational: `"Your descriptions of this have varied over time"`

**`services/omegaMemoryService.ts` (line ~51)**
- **Bug:** Marks existing claims as `inactive` when conflicts detected
- **Violation:** Blueprint: entries are NEVER retroactively invalidated
- **Fix:** Keep all claims active, add `narrative_divergence: true` flag instead

**`services/truthVerificationService.ts`**
- **Bug:** Uses terms "verify", "verified", "contradicted" — implies objective truth judgment
- **Violation:** LoreKeeper does NOT evaluate objective truth
- **Fix:** Rename to `narrativeConsistencyService`, change language throughout

---

### 2. Recall Returns Single Version

**`services/chat/memoryRetriever.ts`**
- **Bug:** Returns single best match, doesn't surface conflicting versions
- **Violation:** Blueprint: "Surface multiple versions if they exist"
- **Fix:** When narratives conflict, return all versions with timestamps + annotation

---

### 3. Missing Narrative State Tracking

No `narrative_state` field on entries. Needed values: `stable`, `evolving`, `conflicting`, `ambiguous`.

No narrative divergence detection at the entry level (only entity-level currently).

---

## Fix Priority

### Priority 1 — Language Safety (Low Risk, High Alignment)

1. Rename `truthVerificationService` → `narrativeConsistencyService`
2. Fix `contradictionDetector.ts`: `"You contradicted..."` → `"Your descriptions have varied over time"`
3. Fix `omegaMemoryService.ts`: remove `markClaimsInactive()`, add `flagNarrativeDivergence()`

### Priority 2 — Narrative State (Schema Change Required)

4. Migration: add `narrative_state`, `emotional_intensity`, `factual_density` to `journal_entries`
5. New service: `narrativeStateService.ts`
6. New service: `narrativeDivergenceService.ts`

### Priority 3 — Recall Enhancement

7. Update `memoryRetriever.ts` to return all conflicting versions
8. Add `"Earlier entries describe this differently"` annotations
9. Add explicit language safety rules to system prompt in `omegaChatService.ts`

---

## Code Pattern (Before vs After)

```typescript
// ❌ BEFORE — Destructive
if (await this.conflictDetected(claim, existingClaims)) {
  await this.markClaimsInactive(existingClaims);
  await this.lowerConfidence(existingClaims);
}

// ✅ AFTER — Non-destructive
if (await this.narrativeDivergenceDetected(claim, existingClaims)) {
  await this.flagNarrativeDivergence(claim, existingClaims);
  await this.recordNarrativeState(claim, 'conflicting');
  // All claims remain active
}
```

---

## Success Criteria

- No entries are ever marked inactive due to conflicts
- All language is observational, not judgmental
- Multiple versions are surfaced in recall
- Narrative state is tracked without evaluation
- System admits uncertainty, doesn't resolve it

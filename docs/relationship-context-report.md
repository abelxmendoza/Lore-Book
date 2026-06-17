# Relationship Context Report

**Sprint:** Chat Trust Recovery — Phases 1 & 5  
**Date:** 2026-06-16

## Goal

Verify relationship depth (texture, closeness, trust, sentiment, importance) reaches the model in the **streaming** chat path — not just the legacy non-stream path.

## Problem

`chatStream()` constructed system prompts with `entityAnalytics: null`, while `chat()` loaded full character/location/org analytics via inline logic. Streaming is the primary production path, so relationship-heavy questions received generic answers despite rich graph data existing in the database.

## Fix

### Shared loader

New module: `apps/server/src/services/chat/entityAnalyticsLoader.ts`

- `loadEntityAnalyticsForContext(userId, entityContext?)` returns:
  - `entityAnalytics` — closeness, trust, sentiment, relationship texture fields from analytics services
  - `entityConfidence` — confidence score for the entity
  - `analyticsGate` — `shouldSurfaceAnalytics()` gate (prevents surfacing low-confidence analytics)

Supports: `CHARACTER`, `LOCATION`, `ENTITY`/`ORG`, `ROMANTIC_RELATIONSHIP`.

### Streaming integration

`omegaChatService.chatStream()` now calls the loader before `buildSystemPrompt()` / context scoring — same bundle shape as non-stream.

Removed: hardcoded `entityAnalytics: null` placeholder.

## Prompt delta (expected)

| Signal | Before (stream) | After (stream) |
|--------|-----------------|----------------|
| `entityAnalytics` | `null` | Populated object when entity context present |
| Closeness / trust fields | Absent | Present when gate allows |
| Token delta | Baseline | +200–800 tokens typical for character-scoped chat (varies by dossier size) |

## Validation

### Automated

```bash
npx tsx apps/server/scripts/chatTrustRecoveryAudit.ts
```

Checks:

1. Loads analytics for a sample character.
2. Builds system prompt with analytics bundle.
3. Reports whether texture markers (`closeness`, `trust`, `sentiment`, `relationship`, `importance`) appear in prompt text.

### Manual (Phase 5)

Ask relationship-heavy questions in entity-scoped or people-heavy threads:

- "How close am I to [name]?"
- "What's my relationship with [name] like lately?"
- "Do I trust [name]?"

Compare response specificity before/after — answers should reference known relationship dynamics, not generic platitudes.

## Related prior fix

`contextScoringService.ts` — entity dossier, arc, skills, and crystallized knowledge were previously dropped during scoring; pass-through restored in the Chat Memory Utilization sprint. Both fixes are required: analytics must load **and** survive context scoring.

## Files changed

- `apps/server/src/services/chat/entityAnalyticsLoader.ts` (new)
- `apps/server/src/services/omegaChatService.ts`
- `apps/server/src/services/chat/contextScoringService.ts` (prior sprint)

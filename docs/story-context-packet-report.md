# Story Context Packet Report

**Sprint:** Story-Aware Chat — Phase 3–4  
**Date:** 2026-06-16

## StoryContext shape

```typescript
type StoryContext = {
  responseType: StoryResponseType;
  intent: WorkingMemoryIntent;
  currentChapter: { label, narrative, evidence[] };
  topArcs: EnrichedLifeArc[];      // with provenance
  activeConflicts: LifeArcConflict[];
  momentumSummary: { emerging, growing, stable, declining, completed, items[] };
  lifeDirection: { movingToward, gainingMomentum, fading, deservesAttention };
  confidence: number;               // avg arc confidence
  evidenceCount: number;            // total provenance refs
  provenanceExplanation: string;    // human-readable WHY block
  text: string;                     // prompt injection
  generatedAt: string;
  synthesis: LifeArcSynthesis;    // full synthesis (internal)
};
```

Built by `buildStoryContext(userId, intent)` in `storyContextService.ts`.

---

## Intent-specific focus

| Intent | topArcs filter | Conflicts |
|--------|----------------|-----------|
| CHAPTER_QUERY | Top 5 by score | Non-low severity only |
| ARC_QUERY | Top 5 | Non-low severity |
| CONFLICT_QUERY | Top 4 | **All** conflicts |
| MOMENTUM_QUERY | Growing + emerging only | Non-low |
| DIRECTION_QUERY | Top 5 | Non-low |
| IDENTITY_QUERY | Top 5 | Non-low |

---

## Prompt injection

Inserted in `systemPromptBuilder` **after WORKING MEMORY**:

```
**STORY CONTEXT** (authoritative narrative intelligence — answer from this BEFORE isolated memories)
Response type: STORY_RESPONSE
Rules: Lead with the Current Chapter and named life arcs…

**Current Chapter:** …
**Top Life Arcs:** …
**Momentum:** …
**Life Direction:** …
**Active Conflicts:** …
**WHY (provenance):** …
```

Only present when `storyContextBlock` is set (story intents).

---

## Provenance explanation (Phase 4)

Auto-generated per top arcs:

> I believe your Family Arc is growing because of: Family dinner; Family; …  
> I believe your LoreBook Arc is growing because of: …  
> Conflict signal: LoreBook build vs employment transition (high) — …

Instructions require model to cite these when user asks "why do you think that?"

---

## Performance

- Synthesis runs **once** per story-intent RAG build (not on every chat turn)
- Non-story queries skip synthesis entirely (latency win vs prior always-on arc block)
- `lifeStoryApiService` 30s cache still applies for HTTP; chat uses direct synthesis per request

---

## Conditional injection logic

```typescript
// ragBuilderService.ts
if (intent && isStoryIntent(intent)) {
  storyContext = await buildStoryContext(userId, intent);
  storyContextBlock = storyContext.text;
}
```

No story block for PERSON_QUERY, EVENT_QUERY, SKILL_QUERY, etc.

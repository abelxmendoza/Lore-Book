# Retrieval Quality Report

Status: Chat Trust Sprint — Phase 5. Why responses feel generic, ranked by impact.
Companions: [recall-trace-report.md](recall-trace-report.md), [chat-durability-audit.md](chat-durability-audit.md).

## Why responses are generic — ranked

### 1. Entity analytics block disabled on the stream path — P0, cheap fix
`omegaChatService.ts:1207`: `const entityAnalytics = null` (comment: "chatStream does not fetch yet"). `buildSystemPrompt` then skips the entire relationship-texture block (`systemPromptBuilder.ts:205-235`: closeness, trust, sentiment, importance, shared-experiences, duration). The **non-streaming** path (`:2111`) can pass real analytics; the **streaming** path — i.e. what every user actually hits — passes null. **Result:** when you ask about a person, the model sees a name with no relationship depth → bland, hedging answers.
*Fix:* fetch entity analytics in the stream path (it already exists for the non-stream path) and pass it through.

### 2. Episodes contribute nothing — P0, schema-drift
`episodes` table is undeployed → 0 rows (see arc-readiness). Episodes are the unit that turns scattered facts into *scenes* ("the week you onboarded at Amazon"). Without them, recall stitches raw entities/entries, which reads generic.
*Fix:* apply `20260616180000_episodes.sql`, backfill via `persistEpisodesForThread`; include episodes in the working-memory packet.

### 3. No provenance → no specificity or citations — P1
`provenance_edges` = 0. The assistant can't ground a claim in a source memory, so it generalizes and can't say "you told me on June 9th." Lack of provenance also blocks the verified-memory phrasing the recall code supports.
*Fix:* verify `provenanceEdgeService` writes on the live path; backfill.

### 4. Split-brain retrieval — P1
Populated: `resolved_events`(30), `character_relationships`(21), `omega_entities`(97). Empty mirrors: `event_records`(0), `omega_relationships`(0). Any assembler query against an empty mirror yields nothing.
*Fix:* point the working-memory assembler at the populated tables; reconcile the dual-write (ties to the [classification](classification-audit.md) vocabulary fragmentation).

### 5. Classification noise dilutes ranking — P2
The entity store contains misclassified/noise rows (`Magic: The Gathering`→ORG, `went for a run`/`job offer last week`→EVENT-entities, 4× `Captured Conversation` events). Noise competes with real entities for the limited prompt budget, lowering signal density.
*Fix:* apply the classification-sprint confidence gates before entities enter retrieval.

### 6. Thin conversational context — P2 (consequence of the durability bug)
Only 7 assistant turns persisted historically (see durability audit) → little prior-turn continuity to condition on. As durability holds going forward, this self-heals.

### 7. Working-memory assembler cost/scope — P2 (known)
Prior audits flagged the assembler doing ~16 queries/message with full-table scans and OpenAI 6–12 calls/message (429 pressure). Under rate-limit pressure, retrieval can degrade or time out → fallback to generic. Worth confirming the assembler's per-message budget and that it isn't silently truncating.

## Diagnosis matrix

| Symptom | Primary cause | Fix effort |
| --- | --- | --- |
| "Doesn't know my people" | #1 entity analytics null (stream) | **low** |
| "Flat, no story" | #2 episodes empty | medium (migration + backfill) |
| "Can't say why it knows" | #3 provenance empty | medium |
| "Forgets things it has" | #4 split-brain reads | medium |
| "Mixes in junk / weak" | #5 classification noise | medium (other sprint) |
| "Generic small talk" | #6 thin history | self-heals post-durability |

## Recommended sequence (fastest trust recovery)

1. **#1 now** — un-null entity analytics in the stream path. Smallest change, immediate "it knows my people" improvement. (Pairs with the durability fix in the same chat sprint.)
2. **Durability fixes** (chat-durability-audit) — stop new loss; rebuild conversational context.
3. **#2 + #3** — deploy episodes + provenance (also unblocks arcs — one fix, two sprints).
4. **#4 + #5** — reconcile storage + apply classification gates for ranking quality.

## Success criteria
- Stream prompts include the entity-analytics block when chatting about a known entity.
- Working-memory packet contains ≥1 episode + ≥1 provenance citation for recall queries on threads with history.
- Per-session user:assistant ratio trends to ~1:1 (durability).
- Manual recall test on a founder thread returns specific, sourced detail (e.g. Amazon onboarding timeline) rather than a generic acknowledgment.

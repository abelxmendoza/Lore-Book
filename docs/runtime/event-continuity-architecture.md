# Event Continuity Architecture
_Lorekeeper · Runtime Design · 2026-05-26_

---

## The Core Insight

Humans do not remember life as isolated messages. They remember **scenes** — recurring moments, rituals, interactions, eras. The gap between raw chat messages and autobiographical narrative is **event formation**: the system's ability to recognize that three messages about Abuela's house, Lorekeeper, and Jerry are not three separate memories but one recurring autobiographical pattern.

This is not a new AI system. It is a new continuity lens over existing infrastructure.

---

## What Already Exists (Do Not Rebuild)

| Layer | Tables | Notes |
|---|---|---|
| Individual events | `resolved_events` | Per-ingestion events with people, locations, activities (UUID arrays) |
| Scene snapshots | `scenes` | Moment-level snapshots with emotional arc and character beats |
| Entity system | `entities`, `entity_mentions` | person / place / org / event / thing |
| Event causality | `event_causal_links` | 10 causal relationship types |
| Event impact | `event_impacts` | How events affect the user |
| Character timelines | `character_timeline_events` | Per-entity event history |
| Continuity audit | `continuity_events` | System-level continuity state changes |
| Ingestion pipeline | `ingestionPipelineClass.ts` | 12-step assembly; fires event assembly async |

**What was missing**: cross-session recurrence detection. No service recognized that the same entity+location combination appearing in four different threads was a recurring autobiographical scene, not four independent memories.

---

## The New Layer: Event Candidates

### What `event_candidates` represents

An `event_candidate` is a recurring pattern detected across multiple sessions. It is **not** a replacement for `resolved_events` — it is a higher-order grouping that says "this combination of people, places, and activities has appeared repeatedly."

```
resolved_events (per session)
       ↓
event_candidates (cross-session patterns)
       ↓
autobiographical scenes (surfaced to user)
```

### Schema summary

```sql
event_candidates (
  id, user_id,
  canonical_title,            -- "Coding at Abuela's house with Jerry"
  dominant_entities UUID[],   -- entity IDs (people + places combined)
  dominant_entity_names TEXT[], -- denormalized for display
  recurring_activities TEXT[], -- ["coding", "gaming", "late night"]
  emotional_tone TEXT,
  first_seen_at, last_seen_at,
  occurrence_count INT,
  continuity_strength FLOAT,  -- 0.0 → 1.0 accumulation curve
  source_thread_ids UUID[],   -- provenance: which threads contributed
  source_event_ids UUID[],    -- provenance: which resolved_events contributed
  timeline_candidate BOOL,    -- true when strength ≥ 0.60
  confidence FLOAT
)
```

Full migration: [migrations/20260526_event_candidates.sql](../../migrations/20260526_event_candidates.sql)
Service: [apps/server/src/services/eventCandidates/eventCandidateService.ts](../../apps/server/src/services/eventCandidates/eventCandidateService.ts)

---

## Detection Heuristics

**No AI calls. No embeddings. Pure entity overlap.**

### Matching algorithm

After each event assembly, `EventCandidateService.processResolvedEvent()` runs:

1. Load the newly assembled `resolved_event` with its `people[]` and `locations[]` UUID arrays
2. Require at least 1 entity (person or location) to even attempt candidate detection
3. Query existing candidates for this user, excluding those that already contain this event
4. For each candidate, compute entity overlap count:
   - If `people.length > 0`: require at least 1 person in common
   - If `people.length === 0`: require at least 1 location in common
5. Select the highest-overlap candidate (if any meets the threshold)
6. **Match found**: reinforce the candidate (increment occurrence_count, expand entity set, update activities)
7. **No match**: create a new candidate with occurrence_count = 1, continuity_strength = 0.25

### Why entity overlap (not text similarity)?

Text similarity would require embeddings and can produce false matches ("I went running" vs "I went running again"). Entity overlap is more conservative: it requires the **same actual people and places** to recur, which is the correct autobiographical signal. Jerry and Abuela appearing together in four sessions is a meaningful pattern. Two messages using the word "coding" is not.

### Strong vs weak signals

| Signal | Weight |
|---|---|
| Same person + same location | Strong — recurring scene |
| Same person × 2, no location | Moderate — shared activity |
| Same location only | Moderate — recurring place |
| Same activity words only | Weak — not a candidate trigger |
| Continuity intent phrase + entity | Strong reinforcement |

---

## Continuity Strength Curve

The accumulation model is deliberately conservative. **A candidate is never surfaced to the user on first occurrence.**

```
occurrence_count  continuity_strength  surfacing behavior
─────────────────────────────────────────────────────────
1                 0.25                 Not surfaced (speculative)
2                 0.50                 Visible in character cards only
3                 0.72                 Surfaces in thread sidebar + character cards
4                 0.77                 Stable autobiographical scene
5+                → 0.92 (ceiling)     Deep autobiographical continuity
```

`timeline_candidate` is set to `true` at continuity_strength ≥ 0.60 (after ~2.8 occurrences).

**Why this curve?**
- 1 occurrence: could be coincidence
- 2 occurrences: emerging pattern, worth showing in character context
- 3 occurrences: enough evidence to call it a recurring scene
- 4+: stable enough to surface in narrative indexes

---

## Time-Gap Awareness

Time gaps carry meaning. Two sessions an hour apart are one continuous moment. Two sessions three months apart are a ritual reappearance.

### Current implementation (Phase 1)

The `event_candidates` schema tracks:
- `first_seen_at` — when the pattern was first observed
- `last_seen_at` — most recent occurrence

This enables:
- **Dormancy detection**: a candidate whose `last_seen_at` is 30+ days old can be flagged as "dormant ritual" when it reappears
- **Gap labeling**: UI can show "Seen again after 2 months" on entity cards
- **Return-to-thread signal**: the existing Phase 2 implementation already injects idle gap context into the system prompt when a thread is reopened after 24h

### Future: temporal clustering (Phase 2)

Group candidates by recurrence interval to distinguish:
- **Same-night continuity**: sessions < 8h apart → one extended event
- **Weekly ritual**: sessions ~7 days apart → recurring ritual
- **Monthly touchpoint**: sessions ~30 days apart → periodic pattern
- **Reappearance after dormancy**: gap > 45 days + new occurrence → notable reunion

---

## Event Reinforcement Logic

Each time a resolved_event matches an existing candidate:

```
new_count = candidate.occurrence_count + 1
new_strength = computeContinuityStrength(new_count)
new_entities = union(candidate.dominant_entities, event.people, event.locations)
new_activities = union(candidate.recurring_activities, extractActivityWords(event))
new_source_events = union(candidate.source_event_ids, [event.id])
timeline_candidate = new_strength >= 0.60
new_confidence = min(0.90, old_confidence + 0.10)
```

The entity set **expands** over time — a scene that starts with "Abuela + Lorekeeper" can grow to include "Jerry" when he appears in the third session at the same place.

The canonical title **does not change** after creation. It anchors the pattern identity even as the entity set grows. (A future refinement could re-derive the title after 4+ occurrences.)

---

## Continuity Surfacing

### Where candidates should appear

| Surface | Threshold | Format |
|---|---|---|
| Character card (entity detail) | strength ≥ 0.50 | "Recurring scene: Coding at Abuela's · 3 times" |
| Thread sidebar (dominantEntities chips) | existing system | Already shows entity names from thread metadata |
| Timeline cards | timeline_candidate = true | "Part of Lorekeeper creation journey" |
| Return-to-thread system prompt | strength ≥ 0.72 | Injected quietly into AI context on thread resume |
| Memory revisitation view (future) | strength ≥ 0.72 | Full scene card with provenance |

### What NOT to surface

- Single-occurrence candidates (strength < 0.50)
- Candidates with 0 named entities
- Candidates where the only overlap is an activity word (no entity match)
- Any candidate without clear provenance in `source_event_ids`

---

## The Continuity Loop

```
conversation
  ↓ ingestion pipeline
resolved_events (per session)
  ↓ EventCandidateService (Step 12.8.5, async non-blocking)
event_candidates (cross-session patterns)
  ↓ continuity_strength accumulates over time
autobiographical scenes (timeline_candidate = true)
  ↓ surfaced in
character cards · thread sidebar · timeline cards · system prompt
  ↓ user feels
"the system already knows this person / place / ritual"
```

This is the loop. It closes the gap between message storage and autobiographical memory.

---

## Event Safety Constraints

These are non-negotiable. The system must feel trustworthy.

### NEVER:
1. **Merge events with zero entity overlap** — even if the text is similar
2. **Invent a canonical title that wasn't derivable from actual event titles** — title must come from real extracted content
3. **Surface a candidate without provenance** — every candidate must have at least one `source_event_id`
4. **Overwrite or modify the source `resolved_events`** — candidates are additive overlays only
5. **Hallucinate relationships** — if Jerry and Abuela appear in the same thread but the event text doesn't link them, don't infer a relationship
6. **Auto-merge candidates** — two candidates with partial overlap should stay separate; merging requires 80%+ entity overlap
7. **Fabricate emotional meaning** — emotional_tone comes from existing enrichment metadata, never from inference about recurring patterns

### ALWAYS:
1. Preserve `source_event_ids` on every candidate
2. Let the user own their candidates (full RLS, user_id on every row)
3. Fail silently — EventCandidateService runs in a `.catch()` block and never interrupts ingestion
4. Respect time gaps — don't merge sessions separated by major life transitions (future: detect and honor gap boundaries)

---

## Fragility Points

| Risk | Severity | Mitigation |
|---|---|---|
| `resolved_events.people` / `locations` not populated | HIGH | Detection only fires when entity arrays are non-empty; no entities = no candidate |
| Thread ID not available in event metadata | MEDIUM | `source_thread_ids` is optional; detection still works without it |
| False merges from partial entity overlap | MEDIUM | Conservative matching: requires person overlap when people array is non-empty |
| Stale candidate titles as entity set grows | LOW | Canonical title is set once at creation; acceptable for MVP |
| Candidate proliferation (too many weak candidates) | LOW | Candidates with strength < 0.50 are never surfaced; can be garbage-collected after 90 days |
| Missing `thread_id` on `resolved_events.metadata` | MEDIUM | Ingestion pipeline should propagate thread_id into event metadata — currently inconsistent |

---

## Highest-ROI Implementation Order

| Phase | Work | ROI | Cost |
|---|---|---|---|
| ✅ Done | `event_candidates` migration + `EventCandidateService` + pipeline hook | Foundation | Done |
| 1 | Surface candidates in character card entity detail pages | High (user "aha" moment) | Low — query + render |
| 2 | Surface candidates in return-to-thread system prompt when strength ≥ 0.72 | High (conversation feels grounded) | Low — extend Phase 2 logic |
| 3 | Add thread_id to resolved_events metadata in ingestion pipeline | High (enables provenance chain) | Low — one-line addition |
| 4 | Timeline contribution indicator: show which candidates a thread contributed to | High (closes conversation→timeline loop) | Medium |
| 5 | Temporal clustering — distinguish same-night vs weekly ritual | Medium | Medium |
| 6 | Candidate garbage collection — archive speculative candidates after 90 days with no reinforcement | Medium (keeps DB clean) | Low |
| 7 | Full scene card in memory revisitation view | High (emotional centerpiece) | High |

---

## How Event Continuity Changes Lorekeeper Emotionally

Without event continuity, Lorekeeper is a system that stores what you say.

With event continuity, Lorekeeper is a system that notices **recurring patterns in your life** — and holds those patterns stable across time without being told to.

The emotional shift:

> Before: "I mentioned Abuela earlier."
> After: "The system already knows about the Abuela coding sessions."

That difference — between retrieval and recognition — is the entire emotional gap between a search engine and a memory system.

When the user types "I'm at Abuela's house coding again" and the system has already seen this scene three times, it shouldn't announce it. It should orient naturally to the known context — mention a detail from the last session, ask a question that continues the thread rather than starting fresh. That quiet orientation, grounded in real accumulated pattern, is what makes the user feel held.

**The restraint is the magic.** A system that mentions "I've seen this scene before" every time would feel performative. A system that silently brings the right context, naturally, every time — that feels like memory.

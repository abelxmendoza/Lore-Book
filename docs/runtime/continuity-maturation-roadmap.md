# Continuity Runtime Maturation Roadmap
_Lorekeeper · Runtime Design · 2026-05-26_

---

## What Changed This Session

Five concrete runtime fixes landed:

| Fix | File | Impact |
|---|---|---|
| LRU cache (delete+re-insert on hit) | `ragPacketCacheService.ts` | Hot continuity entries stay warm; recurring user sessions stop evicting their own cache |
| GIN-indexed entity overlap via Postgres `&&` | `eventCandidateService.ts` | O(log n + k) DB lookup replaces O(n) full table scan + O(E²) JS loop |
| Batch event assembly queries (DataLoader) | `ingestionPipelineClass.ts` | 4N queries → 4 queries regardless of assembled event count |
| Jaro-Winkler fuzzy name matching | `entityAmbiguityService.ts` + `utils/jaroWinkler.ts` | "Sara/Sarah", "Jerry/Jeremy", "Jon/John" now resolve instead of fragmenting |
| Salience-ranked character/location cap | `systemPromptBuilder.ts` | 25 most-salient characters, 20 most-visited locations — prevents prompt bloat |

---

## The Most Important Product Question

**What makes recurring autobiographical continuity feel REAL instead of AI-generated?**

The answer is specific and counterintuitive:

**Specificity from ground truth, not synthesis.**

A scene feels real when every detail in it can be traced back to something the user actually said. It feels AI-generated when even one detail is inferred, generalized, or emotionally amplified beyond what the source material supports.

The failure mode is familiar: the user says "I was coding at Abuela's house" and the system responds "You often find solace in your grandmother's warm embrace while creating." The word "solace" wasn't in the source. "Warm embrace" was invented. "Often" overstates recurrence. The user doesn't recognize their own experience in that description — it feels like the AI narrating a version of their life it hallucinated.

The correct behavior: the system says nothing about the scene at all until it has appeared three times. Then it simply knows: "Abuela's house, Lorekeeper coding, Jerry." It uses that knowledge by orienting naturally — not by announcing it.

**The emotional test**: if the user would say "yes, that's exactly right" when they see the continuity signal, it's working. If they'd say "that's not quite what I meant" or "why does it say that?", it failed.

---

## Scene Continuity Surfacing

### Where recurring scenes should appear

**Principle**: scenes should be discoverable, not announced.

| Surface | Threshold | Format |
|---|---|---|
| Character card — recurring scenes section | `continuity_strength ≥ 0.50` | `"Lorekeeper coding sessions · 3 times"` |
| Thread sidebar — dominant entity chips | Existing system (dominantEntities) | `Abuela · Jerry · Lorekeeper` |
| Return-to-thread system prompt | `continuity_strength ≥ 0.72` for any entity in thread | Quiet orientation: "This conversation is part of your recurring Lorekeeper coding sessions." |
| Timeline view — scene contribution | `timeline_candidate = true` | Small "· part of X" reference below thread entry |

### Character card recurring scene UX

```
Abuela
────────────────────────────
Recurring scenes:
  · Lorekeeper coding sessions   3 times
  · Late night reflection        2 times

Last seen: 3 days ago
```

No emotional interpretation. No "you seem to feel close to Abuela." Just the pattern, the count, the recency. The user fills in the meaning.

Implementation: call `eventCandidateService.getCandidatesForEntity(userId, entityId)` from the character card API endpoint. Returns candidates with `continuity_strength ≥ 0.50`. Render as a minimal list.

### Return-to-thread evolution

Current Phase 2 (idle ≥ 24h): "It's been 3 days since this conversation. The last topic was: Architecture Session. Recurring context: Abuela, Lorekeeper."

Next evolution (when strong scene candidate exists for thread entities):
"This conversation is part of your recurring Lorekeeper coding sessions at Abuela's house."

Gate: only inject scene language when at least one event_candidate with `continuity_strength ≥ 0.72` involves an entity from this thread's `dominantEntities`. Without that threshold, the system would describe scenes after a single occurrence — which is the hallucination failure mode.

---

## Threads as Places

A thread currently feels like a conversation container. It should feel like a revisitable autobiographical space — a place the user has been before that has accumulated meaning.

**What creates the feeling "I've been here before":**

1. **Consistent entity presence** — seeing the same names (Abuela, Jerry, Lorekeeper) across multiple visits to the same thread type signals that this is a recurring place in the user's world
2. **Subtitle as orientation** — the subtitle "Architecture Session" or "Late night at Abuela's" tells the user what kind of place this thread is before they read a single message
3. **Dominant entity chips** — showing `Abuela · Jerry · coding` under the subtitle makes the thread feel like a specific slice of the user's life, not a blank conversation
4. **Temporal anchor** — the timestamp matters. "3 days ago" and "2 weeks ago" are different emotional registers. A thread idle for 2 weeks that you return to is a different experience than a thread from this morning.
5. **Idle gap orientation** — the return-to-thread signal ("It's been 3 days...") creates the feeling of re-entering a space rather than starting fresh

**What NOT to add to threads:**
- Activity logs ("You've opened this thread 12 times")
- Emotional summaries ("This thread tends to be reflective")
- Progress indicators ("47% of your Lorekeeper journey")

These make threads feel like productivity tools, not places. The feeling of "place" comes from identity consistency, not metrics.

**Longer-term**: a thread's accumulated `dominant_entity_names` and `recurring_activities` (from its contributing event_candidates) could be shown as a soft "fingerprint" — not prominent, but visible on hover or in a detail view. This is the thread-as-place information layer that doesn't intrude on the conversation surface.

---

## Temporal Continuity Heuristics

Time gaps carry meaning in autobiographical memory. The system should understand them.

### Clustering tiers

| Gap between sessions | Interpretation | System behavior |
|---|---|---|
| < 8 hours | Same extended moment | Treat as one continuous event session |
| 8h – 3 days | Recent context | No special signal; normal continuity |
| 3 – 14 days | Recent but distinct | Return-to-thread signal if thread reopened |
| 14 – 45 days | Periodic touchpoint | Entity gap awareness: "X mentioned again after 3 weeks" |
| 45 – 90 days | Dormancy | Scene marked `dormant`; reappearance is notable |
| 90+ days | Major gap / reappearance | Strong reappearance signal: "Jerry reappeared after 4 months" |

### Event candidate temporal enrichment

Add `recurrence_interval_days` to `event_candidates` metadata — the median gap between occurrences. Enables:
- **Weekly ritual detection**: recurrence_interval ≈ 7 days → flag as recurring ritual
- **Dormancy**: last_seen > 45 days AND recurrence_interval < 14 → "dormant pattern"
- **Reappearance**: dormant pattern that gets a new occurrence → "reappearance event"

### Relationship temporal awareness

For entities with `continuity_strength ≥ 0.72` that haven't appeared in the dominant entities of any thread for 45+ days: surface subtle "quiet period" awareness in return-to-thread context.

Example: if Jerry appears in a new thread after 60 days of absence, the system prompt could note: "Jerry reappears in this conversation after a 2-month gap." Not dramatized — just grounded temporal fact.

---

## Continuity Fragmentation Risks

The three ways continuity silently breaks:

### 1. Entity fragmentation
Same person → multiple entity records because name varied ("Jerry" / "Jeremy" / "Jer"). Jaro-Winkler (now implemented) reduces this significantly. But name drift over long time periods can still split entities. Mitigation: periodic entity deduplication pass on entities with JW ≥ 0.88 and overlapping `entity_mentions` time ranges.

### 2. Premature candidate surfacing
A scene candidate surfaces to the user on its second occurrence, but the two occurrences were actually unrelated (same person, different context). Mitigation: the continuity_strength threshold (0.50 minimum for surfacing) and the "person overlap required" rule in the matching logic reduce false positives. But the real guard is: **don't describe what the scene is about, just show the entity names and count.** The user can recognize whether it's a real pattern.

### 3. Thread ID missing from resolved_events
The `source_thread_ids` on event_candidates depends on thread_id being propagated into `resolved_events.metadata`. If the ingestion pipeline doesn't write thread_id to the event record, the provenance chain breaks — candidates exist but can't be linked back to which threads contributed to them. This is the highest-priority remaining data plumbing issue.

**Fix**: in the ingestion pipeline's event assembly step, pass `threadId` (from the incoming `ingestFromChatMessage` call) into the event record's metadata. One line: `metadata: { ..., thread_id: threadId }`.

---

## Memory Isolation Hardening (event_candidates)

The `event_candidates` table added in the previous phase has correct RLS (user_id on every row, full CRUD policies). But the retrieval path introduces a new isolation surface:

- `getCandidatesForEntity()` uses `.eq('user_id', userId).contains('dominant_entities', [entityId])` — both scopes are correct
- `getSurfaceableCandidates()` uses `.eq('user_id', userId)` — correct
- `processResolvedEvent()` uses `.eq('user_id', userId).filter('dominant_entities', 'ov', ...)` — correct

The one remaining gap: `getEntityNames()` inside `eventCandidateService.ts` queries the `entities` table with `.in('id', entityIds)` but **does not scope by user_id**. If entity IDs are ever passed from untrusted input, this could expose another user's entity names (not their content, but their names).

Fix: add `.eq('user_id', userId)` to the `getEntityNames()` query, and thread `userId` into that function.

---

## Event ↔ Thread ↔ Timeline Coherence Loop

The full runtime model now looks like this:

```
conversation message
  ↓ ingestion pipeline (12 steps)
extracted_units + entities
  ↓ event assembly service
resolved_events (per-session events)
  ↓ EventCandidateService.processResolvedEvent() [Step 12.8.5, async]
event_candidates (cross-session patterns)
  ↓ continuity_strength accumulates over occurrences
  ├─ strength ≥ 0.50 → visible in character cards
  ├─ strength ≥ 0.60 → timeline_candidate = true
  └─ strength ≥ 0.72 → injected into return-to-thread system prompt
  ↓
autobiographical narrative continuity
  ↓
user feels: "the system already knows this recurring part of my life"
```

What the system is NOT doing (correctly):
- Generating narrative descriptions of what patterns mean
- Inferring emotional significance from recurrence
- Creating synthetic summaries of recurring scenes
- Showing scenes before they've appeared enough times to be trustworthy

---

## UI Restraint Principles

These are the design laws for all continuity surfacing:

1. **Never announce continuity — let it be discoverable.** The system does not say "I've noticed a pattern!" It simply reflects the pattern in context.
2. **Show names and counts, not interpretations.** "Abuela · 3 times" is information. "You seem to find comfort at Abuela's house" is interpretation the system has no right to make.
3. **One signal per surface.** Thread list: entity chips. Character card: recurring scenes section. Return-to-thread: one orientation sentence. Not all three on every surface.
4. **Threshold gates are trust gates.** A signal only appears when the system has enough evidence. The threshold is not a UI setting — it's a data quality contract.
5. **No cognition dashboards.** A "recurring scenes" analytics view would kill the product feel. Continuity should be ambient, not a feature to engage with.

---

## Highest-ROI Next Implementation Order

| Priority | Task | Effort | Why now |
|---|---|---|---|
| 1 | Surface candidates in character card API + render | Low | `getCandidatesForEntity()` is ready; just needs endpoint + UI |
| 2 | Add `thread_id` to `resolved_events.metadata` in ingestion | Trivial | Closes provenance loop; enables `source_thread_ids` to populate |
| 3 | Add `userId` scope to `getEntityNames()` in eventCandidateService | Trivial | Isolation hardening |
| 4 | Extend return-to-thread prompt with scene candidate context | Low | Phase 2 evolution; gated by continuity_strength ≥ 0.72 |
| 5 | Recurrence interval computation on event_candidates | Medium | Enables temporal awareness (weekly ritual vs one-off) |
| 6 | Entity deduplication pass using Jaro-Winkler | Medium | Prevents entity fragmentation accumulating over time |
| 7 | Timeline contribution indicator (Phase 5) | Medium | Closes the conversation → timeline loop |
| 8 | HNSW index on `resolved_events.embedding` | Low (migration) | O(log n) similarity search for 100k+ vectors |

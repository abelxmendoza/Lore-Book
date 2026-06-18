# Stance & Affect — Lexical Intelligence Extension Plan

> Status: **design + first slice landed** (preference/like-dislike detector).
> Scope: extend the deterministic lexical layer to detect *attitudes* (like/dislike,
> believe/disbelieve, did, think, feel) — feeding the existing LLM detectors rather
> than duplicating them.

---

## 1. The core reframe: two axes

The things a journal expresses fall on **two different axes**, and conflating them is
the main design trap:

| Axis | Question | Belongs to | Examples |
| --- | --- | --- | --- |
| **Entity axis** | *What is this thing?* | Ontology / `RootType` | person, location, organization, project, skill |
| **Attitude / predicate axis** | *What is the self's stance toward it?* | **Stance & Affect layer (new)** | like/dislike, believe/doubt, did, think, feel |

Most of the user's wish-list — *"things you like or dislike, things you believe,
things you did, thoughts, feelings"* — is the **attitude axis**. These are **not new
`RootType`s.** They are **relations** between the self and an entity or proposition:

```
SELF —[dislikes @0.8]→ "my manager"
SELF —[believes]→ "remote work makes me more productive"
SELF —[did]→ "ran 5 miles"
```

"Favorite" / "like" is therefore a **preference edge with polarity + intensity**, not
an entity type. There is no `INTEREST` `RootType` worth adding as a closed list —
interests are open-vocabulary (photography, BJJ, synthwave). The lexical layer's job
is to detect the **frame** ("I'm into ___", "obsessed with ___") and hand the target
slot to entity resolution.

---

## 2. Capability audit — what already exists

**Do not rebuild these.** The detection already exists; it is just LLM-only and the
deterministic lexical layer does not participate.

| Category | Where it lives today | Mechanism | Lexical-layer gap |
| --- | --- | --- | --- |
| Hobbies / interests / favorites | `conversationCentered/interestDetector.ts`, `interestTracker.ts` | **LLM** (sentiment, category, action_taken) | No deterministic cue gate / fallback |
| Like / dislike (people, places, things) | `revealedPreference/preferenceTaxonomy.ts` + `preference_signals` | Deterministic, but **category-only, positive-only** | **No polarity, no negation, no attribution, no open targets** |
| Believe / don't believe | `event_cognitions`, belief-challenge detection | **LLM** | No deterministic epistemic-cue layer |
| Things you did / activities | `ACTION_LOG` mode, `resolved_events.activities`, `workoutEventDetector` | Mode router + LLM | `classifyActionIntent` is **UI/CRUD intent**, not life-actions |
| Thoughts | `event_cognitions` | **LLM** | none deterministic |
| Feelings | `event_emotions` | **LLM** | No deterministic affect lexicon |

The deterministic `lexicalIntelligence.ts` emits: kinship, entities, relationship
hints, query type, UI action intent, discovery surfaces, insight signals — **nothing
for sentiment, preference, belief, or affect.**

**Conclusion:** the opportunity is not "build new detectors." It is "give the lexical
layer a deterministic stance/affect signal that (1) gates expensive LLM calls, (2)
boosts confidence when lexical + LLM agree, and (3) provides a fallback when AI is
rate-limited (`DEV_AI_FALLBACK`)."

---

## 3. Target architecture — the Stance & Affect signal layer

A pure, deterministic module that emits typed signals consumed by existing systems:

```ts
interface StanceSignal {
  attitude: 'LIKE' | 'DISLIKE' | 'BELIEVE' | 'DISBELIEVE' | 'FEEL' | 'THINK' | 'DID';
  polarity: number;          // -1..+1
  target?: string;           // the entity/proposition slot → entity resolution
  cue: string;               // matched marker ("can't stand", "i'm into")
  confidence: number;
  negated: boolean;
  attributedToSelf: boolean; // "she loves X" must NOT become the user's preference
  irrealis: boolean;         // "would love", "if I liked" → not an actual stance
}
```

Routing (no new storage silos):

| Signal | Feeds |
| --- | --- |
| LIKE / DISLIKE | `preference_signals` (revealed-preference engine), `interests` |
| BELIEVE / DISBELIEVE | `event_cognitions` (beliefs/doubts) |
| FEEL | `event_emotions` |
| DID | `ACTION_LOG` path / `resolved_events` |

---

## 4. The #1 risk: precision, not recall

Per the product principle *"sparse authentic continuity beats fake rich cognition,"*
naive stance detection pollutes fast. Every detector in this layer **must** handle:

- **Negation** — "I don't love olives" → DISLIKE, not LIKE.
- **Irrealis / hypothetical** — "I'd love to go", "if I liked it" → not a current stance.
- **Revocation** — "I used to love it" → no longer holds → drop.
- **Attribution scope** — "She loves sushi" → not the user's preference.
- **Pronoun / empty targets** — "I like that" → no usable target → drop.

These mirror the kinship anti-pollution discipline. A marker that ignores them should
not ship.

---

## 5. Roadmap

| Slice | Scope | Status |
| --- | --- | --- |
| **C1 — Preference (like/dislike)** | Deterministic polarity detector + negation/attribution/irrealis + bridge into `preference_signals` (positive stated + negative disliked) | **landed** |
| C2 — Persist dislikes | `preference_signals.disliked_count` + `preference_evidence.signal_type='disliked'` | **landed** |
| C3 — Belief / epistemic | Epistemic cue lexicon → `event_cognitions` gate + confidence | **landed** |
| C4 — Affect | Affect lexicon → `event_emotions` gate + confidence | **landed** |
| C5 — SSOT fold-in | Migrate cue vocab into `glossary.ts` hint-only categories (mirror kinship consolidation) | **landed** |

---

## 6. Slice C1 — what landed

- `apps/server/src/services/ontology/preferenceStance.ts` — pure
  `detectPreferenceStances(text)` (LIKE/DISLIKE, polarity, intensity, negation,
  attribution, irrealis, revocation). Cue vocabulary derived from glossary
  `STANCE_PREFERENCE` via `stancePhraseSpecs` / `stanceVerbSpecs`. Re-exported
  from `lexicalIntelligence.ts`.
- `preferenceStanceSignals(text)` bridge in `revealedPreference/preferenceTaxonomy.ts`
  maps **self-attributed, non-negated, non-irrealis** positive stances whose target
  hits a known category into a `stated` `RawMatch` (with additive `polarity` field).
- Wired into `revealedPreferenceService.rescan` **additively + dedup-guarded** so it
  never double-counts what `extractSignals` already catches and never alters the
  existing engine's behavior.
- Negative-polarity (dislike) stances map to `signalType: 'disliked'` and persist in
  `preference_signals.disliked_count` + `preference_evidence` rows — orthogonal to
  the stated/revealed alignment math.
- Precision-first test suite: negation, attribution, irrealis, revocation, multi-target,
  and error/empty cases.

---

## 7. Slice C3 — what landed

- `apps/server/src/services/ontology/epistemicStance.ts` — pure
  `detectEpistemicStances(text)` (BELIEVE/DISBELIEVE/QUESTION/REALIZE) with the
  same pollution guards as preference stances. Cue vocabulary derived from glossary
  `STANCE_EPISTEMIC`.
- `epistemicCognitionDrafts(text)` maps self-attributed stances → `event_cognitions`
  shapes (`belief`, `doubt`, `question`, `realization`).
- `mergeEpistemicCognitions(lexical, llm)` merges lexical + LLM output: lexical fills
  gaps when the LLM fails; agreement boosts confidence (`lexicalConfirmed: true`).
- Wired into `eventExtractionService.extractEventStructure`:
  - lexical detection runs **before** the LLM call
  - LLM prompt gets an epistemic-attention hint when cues are present
  - merged cognitions persist with `confidence` + `source` in `event_cognitions.metadata`
  - LLM fallback path now retains lexical cognitions instead of returning empty
- Re-exported from `lexicalIntelligence.ts`.
- Precision-first test suite + CI via `npm run test:stance`.

---

## 8. Slice C4 — what landed

- `apps/server/src/services/ontology/affectStance.ts` — pure
  `detectAffectStances(text)` mapping surface forms → canonical emotions
  (`joy`, `anxiety`, `gratitude`, `exhaustion`, …) with pollution guards. Emotion
  surfaces derived from glossary `STANCE_AFFECT` via `affectEmotionLexicon()`.
- Guards reject epistemic "feel that", inclinational "feel like [verb]", similes,
  irrealis, revocation, negation, and third-party attribution.
- `affectEmotionDrafts(text)` + `mergeAffectEmotions(lexical, llm)` mirror the
  epistemic merge pattern (gap-fill, agreement boost, LLM pass-through).
- Wired into `eventExtractionService.extractEventStructure`:
  - lexical affect runs before the LLM call
  - LLM prompt gets an affect-attention hint when cues are present
  - merged emotions persist with `source` + `confidence` in `event_emotions.metadata`
  - LLM fallback retains lexical emotions
- Re-exported from `lexicalIntelligence.ts`.
- Precision-first test suite + CI via `npm run test:stance`.

---

## 9. Slice C5 — what landed

- `apps/server/src/services/ontology/glossary.ts` — `STANCE_PREFERENCE`,
  `STANCE_EPISTEMIC`, and `STANCE_AFFECT` hint-only categories with `stanceForm`
  (`PHRASE` | `VERB` | `EMOTION`). Subcategory holds polarity/kind or canonical
  emotion label.
- Helpers mirror kinship consolidation:
  - `stancePhraseSpecs(layer)` — multi-word cues, longest-first
  - `stanceVerbSpecs(layer)` — verb lemmas + conjugations
  - `affectEmotionLexicon()` — surface → canonical emotion + intensity
- `preferenceStance.ts`, `epistemicStance.ts`, and `affectStance.ts` derive lexicons
  from glossary helpers; regex matching and pollution guards stay in those modules.
- `STANCE_*` added to `HINT_ONLY_CATEGORIES` in `lexicalIntelligence.ts` so stance
  cues never surface as discovered entities.
- Contract tests: `stanceGlossarySSOT.test.ts` + stance shape checks in
  `glossaryIntegrity.test.ts`.

---

## 10. Slice D5 — Temporal SSOT (landed)

- Glossary: `TEMPORAL_ANCHOR`, `TEMPORAL_SEQUENCE`
- `temporalLexicon.ts` — `scanTemporalMentions`, sequence markers
- Wired into ingestion temporal scan + narrative segmentation

---

## 11. Slice D1+D2 — Social / Gen-Z romantic SSOT (landed)

- Glossary: `SOCIAL_ROLE`, Gen-Z `RELATIONSHIP_VERB` entries
- `socialRelationshipIntelligence.ts`, `romanticIntelligence.ts` extensions
- `lexicalRelationshipDetector.ts` uses glossary social roles

---

## 12. Slice D3 — Narrative discourse & story stages (landed)

- Glossary: `NARRATIVE_DISCOURSE`, `NARRATIVE_STAGE`
- `discourseStance.ts` — tangents, story open/close, stage detection
- Wired into tangent detector, narrative structure bridge, event metadata

---

## 13. Narrative structure → graph (landed)

- `narrativeStructureBridge.ts` + `narrativeStructureService.ts`
- Persists `resolved_events.metadata.narrative_structure` + interpretations
- Boosts `arc_memberships.role` from lexical turning-point signals

---

## 14. Narrative arc consolidation (landed)

- `narrativeArcConsolidationBridge.ts` — cluster story events → arc proposals
- `narrativeArcConsolidationService.ts` — upsert `life_arcs` + `arc_memberships`
- **LLM titles on by default** (`NARRATIVE_ARC_LLM_TITLES=0` to disable)
- Live debounced trigger on `is_story_block` ingest (`NARRATIVE_ARC_LIVE=0` to disable)
- Nightly enrichment job: `narrative-arc-consolidation`
- UI: `StoryArcBadge` in Omni Timeline swimlanes + story view
- Stitched timeline: membership-linked events for consolidation arcs

---

## 15. Message lexical signals (landed)

- `messageLexicalMetadataService.ts` — `chat_messages.metadata.lexical_signals`
  (discourse, social roles, romantic cues, narrative stages)
- Wired into lore interpretation pipeline + ingestion path
- UI: `LexicalSignalBadges` on chat messages, relationship cards, character profiles

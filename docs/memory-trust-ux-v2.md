# Memory Trust UX V2

Date: 2026-06-15

Purpose: make memory provenance obvious — why something exists, where it came from, why it was inferred, and how confident LoreBook is. Assumes graph architecture, episodes, and consolidation rules from `autobiographical-memory-graph.md`.

---

## Design principle

Trust is not a settings page. It is **visible at the moment of doubt** — inline, tappable, never buried in diagnostics.

ChatGPT hides provenance. LoreBook shows it like a footnote you can always expand.

---

## Trust layers (user mental model)

| Layer | User question | UX answer |
|---|---|---|
| **Existence** | Why does this person/moment/fact exist? | Creation source + first evidence |
| **Provenance** | Where did this come from? | Message excerpt, journal, import |
| **Inference** | Why did LoreBook infer this? | Reason chain in plain language |
| **Confidence** | How sure is LoreBook? | Score + what would raise it |
| **Conflict** | Something contradicts this | Side-by-side + resolution path |
| **Correction** | I need to fix this | Edit that supersedes, never deletes |

---

## Universal provenance chip

Every memory object (moment, fact, biography line, relationship, importance score) gets a tappable provenance affordance:

```
Abuela prefers Westminster Costco  ⓘ
```

Tap ⓘ → **Provenance panel** (slide-over, not modal):

```
┌─────────────────────────────────────────────────────────────┐
│  PROVENANCE                                            ✕    │
│  "Abuela prefers Westminster Costco"                        │
│  ─────────────────────────────────────────────────────────  │
│  CONFIDENCE    92%  ████████████░░                           │
│  TYPE          Extracted fact                               │
│  CREATED       Jun 12, 2026                                 │
│  SOURCE        You said this in chat                         │
│  ─────────────────────────────────────────────────────────  │
│  EVIDENCE (1)                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Jun 12, 2026 · Family check-in thread               │   │
│  │ "We always go to the Westminster Costco, Abuela    │   │
│  │  won't go to the one on 88th."                      │   │
│  │ [ View in thread ] [ View moment ]                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ─────────────────────────────────────────────────────────  │
│  WHY THIS EXISTS                                            │
│  LoreBook extracted this preference from your description   │
│  of a Costco trip with Abuela.                              │
│  ─────────────────────────────────────────────────────────  │
│  [ Correct this ]  [ Mark wrong ]  [ Merge duplicate ]      │
└─────────────────────────────────────────────────────────────┘
```

---

## Confidence display rules

| Range | Label | Visual | When to show |
|---|---|---|---|
| 90–100% | Confirmed | Solid green dot | Stated directly by user |
| 70–89% | Likely | Blue dot | Extracted with strong context |
| 50–69% | Possible | Amber dot | Inferred, needs more evidence |
| <50% | Uncertain | Hollow dot + "Needs review" | Never assert in chat without flag |

**In chat responses:** LoreBook uses natural language, not scores ("I'm fairly sure" vs "You mentioned once"). Scores appear in UI surfaces only.

**In browse surfaces:** Always show confidence on facts; optional on moments (significance replaces confidence for episodes).

---

## Inference transparency

When something was inferred (not directly stated):

```
WHY LOREBOOK THINKS THIS
  1. You mentioned "Costco with Abuela" 3 times on Sundays
  2. Time gaps suggest a recurring ritual (~7 days)
  3. Abuela appears in 80% of Costco moments
  
  → Inferred: "Sunday Costco trips with Abuela are a recurring pattern"
  Confidence: 78%
```

Show the **reason chain**, not "AI analyzed your data."

---

## Source types and icons

| Source | Icon | Label |
|---|---|---|
| Chat message | 💬 | You said this in chat |
| Journal entry | 📓 | From your journal |
| Document import | 📄 | From imported document |
| Manual entry | ✏️ | You added this |
| System inferred | 🔗 | Inferred from patterns |
| Consolidated | 🧬 | Derived from multiple moments |
| User corrected | ✓ | You corrected this |

---

## Moment (episode) provenance

```
MOMENT: Costco With Abuela
EVIDENCE: 7 messages · Jun 12, 2026 2:14–2:41 PM
THREAD: Family check-in
SEGMENTED: Time gap (6h) + entity shift (Abuela entered)
TITLE: Generated from participants + place
MEANING: "Time with Abuela matters more than shopping."
         Inferred from emotional tone + family context
```

Shows **how** the moment was formed, not just what it contains.

---

## Character provenance

```
CHARACTER: Abuela
CREATED: Mar 2024 · Promoted after 3 mentions across 2 threads
RELATIONSHIP: grandmother · Stated by you · Confirmed
IMPORTANCE: High
  Structural floor: grandmother relationship
  + 12 moments · last 3 days ago
DUPLICATE CHECK: No conflicts · "Grandma" alias linked
```

---

## Relationship provenance

```
RELATIONSHIP: You → grandmother → Abuela
SOURCE: You said "my abuela" in Family check-in · Mar 2024
CONFIDENCE: 98%
CO-OCCURRENCE: Appears with Tío Juan in 4 moments (not structural)
```

Distinguish **stated** relationships from **co-occurrence** patterns.

---

## Conflict UX

When contradiction engine detects divergence:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠ CONFLICT DETECTED                                        │
│  Job status                                                 │
│  ─────────────────────────────────────────────────────────  │
│  Version A (until May 2026)                                 │
│  "Works at Amazon" · 94% · 8 moments                      │
│  📎 Mar 2024 onboarding thread                               │
│                                                             │
│  Version B (from Jun 2026)                                  │
│  "Left Amazon, starting new role" · 88% · 2 moments         │
│  📎 Jun 2026 career thread                                  │
│  ─────────────────────────────────────────────────────────  │
│  LoreBook shows both. Which is current?                     │
│  [ B is current ]  [ A is still true ]  [ Both partial ]    │
└─────────────────────────────────────────────────────────────┘
```

Never silently pick a winner. Bi-temporal model: old fact gets `valid_to`, new fact gets `valid_from`.

---

## Correction flow

Corrections **supersede**, never delete:

1. User taps "Correct this"
2. Inline edit or structured form (relationship type, date, name)
3. New version created; old version marked `superseded`
4. Provenance shows: "Corrected by you on Jun 15, 2026"
5. Chat uses new version immediately

```
HISTORY
  Jun 15, 2026 — You corrected: "Tío Juan" (was "Uncle John")
  Mar 2024 — Original extraction from chat
```

Full audit trail visible in provenance panel.

---

## "Why does this exist?" empty states

| Object | Explanation |
|---|---|
| Thin character | "Created from 1 mention. No moments linked yet." |
| Low-confidence fact | "Extracted once. Mention again to strengthen." |
| Inferred pattern | "Detected from 3 similar moments. Not yet confirmed." |
| Orphan entity | "Detected but not linked to any moment. [ Link ] [ Dismiss ]" |

Memory Coverage Audit (`/api/diagnostics/memory-coverage`) powers admin view; user-facing version shows orphans in Character Book with "Needs evidence" badge.

---

## Chat trust behaviors

When Working Memory Assembler has weak evidence:

| Condition | Chat behavior |
|---|---|
| No memory | "I don't have anything about X yet." |
| Weak memory | "You mentioned X once, in…" + cite moment |
| Conflicting | Present both versions; ask which is current |
| Unverified entity | "I'm not sure who X is — can you tell me?" |
| Unknown entity type | "X looks like a place, not a person." |

Never hallucinate to fill gaps. WMA failure cases from `working-memory-assembler.md` map directly to chat copy.

---

## Trust surfaces map

| Surface | Trust element |
|---|---|
| Moment card | Evidence count + thread link |
| Moment detail → Sources tab | Full message excerpts |
| Character page | Provenance on every biography line |
| Project page | Decision evidence links |
| Search results | Confidence badge on facts |
| Thread intelligence | "Stored metadata" — no live generation |
| Memory Explorer review queue | Risk level + reasoning + approve/reject |
| Diagnostics | Full coverage audit (power users) |

---

## What NOT to show users

- Embedding vectors, summary versions, internal IDs (except debug mode)
- "AI confidence" without evidence count
- Deleted/superseded data without history access
- Merge operations without preview
- Generic "Something went wrong" for OpenAI failures — use stage-specific messages (already shipped in P0 sprint)

---

## Accessibility

- Provenance panel keyboard-navigable
- Confidence not color-only (always paired with label)
- Screen reader: "92 percent confidence, extracted from chat, 1 evidence item"

---

## Success criteria

1. Any fact on any page answers **where did this come from** in one tap.
2. Inferences always show **reason chain**, not black box.
3. Conflicts surface proactively with **resolution path**.
4. Corrections preserve **full history**.
5. Chat never asserts uncertain facts without **hedging + citation**.

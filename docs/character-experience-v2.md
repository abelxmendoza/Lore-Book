# Character Experience V2

Date: 2026-06-15

Purpose: redesign Character pages for graph intelligence, episodes, and biography. Assumes entity resolution, importance scoring, and Working Memory Assembler exist. Does **not** redesign backend.

---

## Design principle

A character page is not a contact card. It is **a person's place in your life story** — who they are, what happened with them, and why they matter.

---

## Example: Abuela

### Hero (above the fold — never hidden)

```
┌─────────────────────────────────────────────────────────────┐
│  [Photo/avatar]                                             │
│  Abuela                                                     │
│  Grandmother · Family · High importance                     │
│  ─────────────────────────────────────────────────────────  │
│  "The person you call first after big life news."           │
│  ─────────────────────────────────────────────────────────  │
│  12 moments · Last: 3 days ago · Costco, phone calls        │
│  Relationship: grandmother (confirmed) · Since: always        │
│                                                             │
│  [ Ask about Abuela ]  [ Add moment ]  [ Edit ]             │
└─────────────────────────────────────────────────────────────┘
```

### Always visible (never collapsed behind tabs)

| Field | Why |
|---|---|
| **Name + aliases** | Disambiguation (Abuela, Grandma, María) |
| **Relationship label** | "Grandmother" — the user's frame |
| **Importance tier** | High / Moderate / Low with one-line reason |
| **Meaning line** | One sentence: who this person *is* in your life |
| **Moment count + last seen** | Proof of life in LoreBook |
| **Primary relationship** | Structural link to user |
| **Ask button** | Primary action — chat with person pre-loaded |

---

## Page sections (scroll order)

### 1. Pinned moments (max 3)

The most significant episodes involving this person. User can pin; system suggests by significance × recency.

```
PINNED MOMENTS
┌──────────────────────┐ ┌──────────────────────┐
│ Costco With Abuela   │ │ Sunday phone calls   │
│ Jun 2026             │ │ Recurring · Family   │
└──────────────────────┘ └──────────────────────┘
```

### 2. Biography (structured, not a blob)

Collapsible sections, each with evidence links:

| Section | Content | Source |
|---|---|---|
| **Who they are** | Role, age/life stage if known, cultural context | Semantic facts + episodes |
| **How you know them** | Origin story, relationship history | Episodes + relationship edges |
| **What matters** | Values, preferences, sensitivities | Revealed preferences + facts |
| **Current state** | Last contact, open loops, recent changes | Latest episodes |
| **Open questions** | Unverified or conflicting facts | Contradiction engine |

```
BIOGRAPHY
Who they are
  Your grandmother. Lives near Westminster. Speaks Spanish at home.
  📎 Costco With Abuela · 3 other moments

How you know them
  Central figure in family thread. You mention her in 40% of family moments.
  📎 Family check-in thread

What matters
  Sunday calls. Costco trips. Health updates.
  📎 Revealed preference: "Family check-ins before work stress"
```

Every sentence tappable → provenance panel (see `memory-trust-ux-v2.md`).

### 3. Moments timeline

Chronological episode cards involving this person. **Not** a separate "memories" wall.

```
MOMENTS WITH ABUELA (12)
2026 ─────────────────────────────────────────
  Jun  Costco With Abuela
  May  Sunday phone call
  Apr  Mother's Day visit
2025 ─────────────────────────────────────────
  …
```

Filter chips: All · Recurring · Major · Unverified

### 4. Relationships

Graph view + list. Never hide structural family links.

```
RELATIONSHIPS
  You ← grandmother ← Abuela
  Abuela → spouse → Abuelo (mentioned, thin)
  Abuela → child → Mom (via family graph)
  Abuela → often_with → Tío Juan (co-occurrence)
```

Tap edge → shared moments.

### 5. Places & contexts

Where this person appears:

```
OFTEN AT
  Costco (5 moments) · Home (3) · Phone (4)
```

### 6. Facts (atomic memories)

Character-attached facts from `character_memories` — shown as **lines with parent moments**, not standalone cards.

```
FACTS (8)
  "Prefers Westminster Costco" · Jun 2026 · 92%
  "Calls every Sunday around 10am" · Pattern · 87%
  …
```

Low-confidence facts show review badge.

### 7. Importance breakdown (expandable)

For trust/debug-oriented users:

```
IMPORTANCE: High (0.84)
  Structural: grandmother (+0.40 floor)
  Frequency: 12 moments (+0.20)
  Recency: 3 days ago (+0.14)
  Significance: 2 major moments (+0.10)
```

Default hidden; available under "Why this rating?"

---

## What should users see FIRST

Priority order on page load:

1. Name + relationship + meaning line
2. Ask button
3. Pinned moments (visual proof)
4. Biography opening ("Who they are" — 2–3 sentences max visible)
5. Latest moment

Everything else is scroll.

---

## What should NEVER be hidden

| Element | Rationale |
|---|---|
| Relationship to user | Core identity frame |
| Evidence that person exists (≥1 moment or explicit "no moments yet") | Trust |
| Importance tier (even if Low) | Prevents "why doesn't LoreBook know my mom?" |
| Merge/duplicate warning if detected | Data integrity |
| Provenance on biography claims | Trust architecture |
| "Ask about [name]" action | Primary product loop |

---

## Duplicate handling UX

When duplicate confidence ≥ threshold:

```
⚠ Possible duplicate: "Grandma" and "Abuela" may be the same person.
   [ Review merge ]  [ Dismiss ]
```

Merge review shows side-by-side: moments, facts, relationships, with recommendation + reason from API.

---

## Thin character states

| State | UX |
|---|---|
| Just mentioned, no promotion | "Abuela hasn't earned a full profile yet. Mention her again or add a moment." + raw mentions list |
| Promoted, no moments | "Character created but no moments linked. Tell LoreBook a story about Abuela." |
| Rich profile | Full page as designed |

Never show an empty character page with no explanation.

---

## Modal vs full page

| Context | Surface |
|---|---|
| Quick glance from thread/search | **Character peek** (slide-over): hero + pinned moments + Ask |
| Deep exploration | **Full character page** |
| Edit/merge | Full page or dedicated merge flow |

Character peek shows 80% of value in 40% of space.

---

## Integration with other surfaces

| Surface | Link |
|---|---|
| Life Log | Filter moments by person → same cards |
| Thread intelligence | Person chip → character peek |
| Search V2 | Person result → full page |
| Chat | "Ask about Abuela" pre-loads WMA with PERSON_QUERY intent |
| Love & Relationships | Relationship graph is a **view** over character relationships, not duplicate data |

---

## Mobile layout

```
[ Avatar + Name + Relationship ]
[ Meaning line ]
[ Ask about Abuela — full width ]
[ Pinned moments — horizontal scroll ]
[ Biography — accordion sections ]
[ Moments — vertical list ]
[ Relationships — simplified list, graph on tap ]
```

---

## Success criteria

1. Opening Abuela's page answers **who, why they matter, what happened recently** in 5 seconds.
2. Biography every claim links to **evidence**.
3. No parallel "Memories" tab — moments + facts in one narrative flow.
4. Family members show **structural importance** even with few mentions.
5. Duplicates surface proactively with merge path.

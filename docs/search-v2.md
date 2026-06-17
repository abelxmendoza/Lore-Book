# Search V2

Date: 2026-06-15

Purpose: redesign search from memory-centric message retrieval to **entity-first, moment-first** discovery. Assumes episodes, thread intelligence, Working Memory Assembler, and graph entities exist.

---

## The problem today

Search is memory-centric: type "Costco" → get message snippets and memory cards. Users think in **people, places, moments, and threads** — not extracted fact rows.

**Target behavior for "Costco":**

```
PEOPLE
  Abuela — 3 moments at Costco

PLACES
  Costco — 5 moments · recurring Sunday trips

MOMENTS
  Costco With Abuela · Jun 2026 · "Time with Abuela matters…"
  Costco run with Sol · May 2026

THREADS
  Family check-in — 2 Costco moments

TIMELINE
  Jun 2026 · May 2026 · Mar 2026 · …
```

Not: 14 message fragments with no grouping.

---

## Search modes (one bar, intelligent routing)

Single search input. Intent inferred from query shape:

| Query shape | Primary mode | Example |
|---|---|---|
| Proper noun, 1–2 tokens | **Entity search** | "Abuela", "Costco", "LoreBook" |
| Question words | **Answer search** | "When did I go to Costco?" |
| Date/time phrases | **Timeline search** | "last summer", "June 2026" |
| Relationship phrases | **Relationship search** | "people at Amazon", "family in Austin" |
| Empty / recent | **Recents** | Last people, moments, threads |

No mode picker. Results grouped automatically.

---

## Result types and card design

### 1. Person result

```
┌─────────────────────────────────────────────────────────┐
│ 👤 Abuela                                    PERSON     │
│ Grandmother · Family · Importance: High                 │
│ 12 moments · Last seen 3 days ago · Costco, home calls│
│ "Time with Abuela matters more than shopping."          │
└─────────────────────────────────────────────────────────┘
```

Tap → Character page. Secondary actions: Ask about Abuela, View moments.

### 2. Place result

```
┌─────────────────────────────────────────────────────────┐
│ 📍 Costco                                     PLACE     │
│ 5 moments · Recurring (Sundays) · With Abuela, Sol      │
│ Last: Jun 2026 · First: Mar 2024                        │
└─────────────────────────────────────────────────────────┘
```

### 3. Moment (episode) result

```
┌─────────────────────────────────────────────────────────┐
│ ✦ Costco With Abuela                          MOMENT    │
│ Jun 2026 · Abuela · Costco · 7 messages                 │
│ "Time with Abuela matters more than shopping."          │
│ From: Family check-in thread                            │
└─────────────────────────────────────────────────────────┘
```

### 4. Thread result

```
┌─────────────────────────────────────────────────────────┐
│ 💬 Family check-in                           THREAD     │
│ Abuela · Costco · 4 moments · Active 3 days ago        │
│ Matched: "Costco" in 2 moments                          │
└─────────────────────────────────────────────────────────┘
```

### 5. Project result

```
┌─────────────────────────────────────────────────────────┐
│ 🎯 LoreBook                                  PROJECT    │
│ Active · 23 moments · 8 threads · Last: 2 hours ago     │
│ Contributors: Sol, Ashley · Milestone: WMA integration    │
└─────────────────────────────────────────────────────────┘
```

### 6. Timeline cluster

```
┌─────────────────────────────────────────────────────────┐
│ 📅 June 2026                               TIMELINE     │
│ 4 moments · Abuela (2) · LoreBook (2) · Costco (1)      │
│ [ View month ]                                          │
└─────────────────────────────────────────────────────────┘
```

### 7. Memory fact (atomic)

```
┌─────────────────────────────────────────────────────────┐
│ 📝 "Abuela prefers the Westminster Costco"    FACT      │
│ Inside: Costco With Abuela · Jun 2026 · 92% confidence  │
└─────────────────────────────────────────────────────────┘
```

Facts never appear alone without parent moment link.

---

## Grouped results layout

```
┌─ Search: Costco ────────────────────────────────────────┐
│                                                          │
│  TOP MATCH                                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │ ✦ Costco With Abuela · Jun 2026                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  PLACES (1)                                              │
│  📍 Costco — 5 moments                                   │
│                                                          │
│  MOMENTS (3)                                             │
│  ✦ Costco With Abuela · Jun 2026                       │
│  ✦ Costco run with Sol · May 2026                        │
│  ✦ …                                                     │
│                                                          │
│  PEOPLE (2)                                              │
│  👤 Abuela — often at Costco                             │
│  👤 Sol — 1 Costco moment                                │
│                                                          │
│  THREADS (1)                                             │
│  💬 Family check-in                                      │
│                                                          │
│  TIMELINE                                                │
│  Jun 2026 · May 2026 · Mar 2026                          │
│                                                          │
│  FACTS (2)                                               │
│  📝 Abuela prefers Westminster Costco                    │
│  📝 …                                                    │
└──────────────────────────────────────────────────────────┘
```

**Top match** = highest composite score (see ranking). One card, full width.

---

## Ranking formula

```
score = (
  0.35 × text_relevance      // BM25/embedding match on title + summary + entities
+ 0.20 × entity_importance    // person importance, project activity, place frequency
+ 0.15 × recency              // exponential decay, half-life 30 days
+ 0.15 × moment_significance  // episode/event significance score
+ 0.10 × relationship_proximity // closeness to user (family > acquaintance)
+ 0.05 × evidence_density     // messages + linked facts count
)
```

### Type-specific boosts

| Query signal | Boost |
|---|---|
| "When" / "where" / date | Moments + Timeline +0.15 |
| "Who is" | People +0.20 |
| Project name match | Projects +0.15 |
| Thread title exact match | Threads +0.25 |
| Recurring pattern query ("always", "every Sunday") | Patterns +0.20 |

### Dedup rules

- Same moment matched via thread + place + person → show once in MOMENTS, cross-link in other groups
- Message snippets never appear as top-level results; only inside moment "matched excerpt"

---

## Search scopes

Accessible via filter chips (optional, not required):

| Scope | Searches |
|---|---|
| **Everything** (default) | All types |
| People | Characters + relationships |
| Moments | Episodes + events |
| Places | Locations + orgs |
| Projects | Projects + related threads |
| Threads | Thread metadata + moments within |
| Facts | character_memories, entity_facts |

Keyboard: `⌘K` → universal; `⌘⇧K` → scoped to current page (character, thread, project).

---

## Thread search (scoped)

Inside a thread, search bar searches:

1. Moment titles and meaning lines
2. Message content (within episodes)
3. Resolved entities in `key_*`
4. Themes

Results grouped: Moments first, then Messages (with episode context).

---

## Episode search (global)

Index fields per episode:
- `title`, `meaning_line`, `participants[]`, `locations[]`, `themes[]`
- `thread_title`, `summary_short`
- `message_excerpt` (best matching snippet, not full text)
- `startAt`, `endAt`, `significance`

---

## Person search

Index fields per person:
- `name`, `aliases[]`, `relationship_label`
- `importance_score`
- `moment_titles[]` (top 10 by significance)
- `places[]`, `projects[]`
- `biography_excerpt` (first paragraph)

"Juan" disambiguation: show all matches ranked by importance + recency:

```
PEOPLE (3)
👤 Tío Juan — Uncle · High importance
👤 Juan (work) — Colleague at Amazon · Moderate
👤 Juan Oscuri.dad — Possible duplicate · [ Review merge ]
```

---

## Project search

Index: name, purpose, status, contributors, milestone titles, decision log entries, open loops.

---

## Place search

Index: name, type, moment count, recurring flag, associated people.

---

## Empty and failure states

| State | UX |
|---|---|
| No results | "Nothing found for 'X'. LoreBook searches people, moments, places, and threads." + suggest recent entities |
| Unknown entity | "No linked record for 'X'" + [ Create person ] [ Search messages anyway ] |
| Weak match | Show with "Possible match" badge + confidence |
| Conflicting entities | Show disambiguation picker before deep results |

---

## Memory Explorer relationship

Memory Explorer becomes **Search V2's review surface**, not a parallel search:

| Memory Explorer today | Search V2 |
|---|---|
| Browse all memory cards | Facts group in search results |
| Review queue | "Needs review" filter in search |
| Semantic clusters | Timeline clusters + Themes |

Keep Memory Explorer for **curation workflows** (approve/reject proposals). Default user search → universal bar.

---

## Implementation notes (UX only)

Search backend should query indexes built from:
- Thread metadata (`summary_long`, `key_*`)
- Episode index (per thread)
- Entity registry (people, places, projects)
- Working Memory Assembler entity resolution (for query target extraction)

Do **not** add a second retrieval stack. Search indexes are **projections** of graph data; Working Memory Assembler remains the chat retrieval entry.

---

## Success criteria

1. "Costco" returns moment + place + people + thread in **one screen**, ranked intelligently.
2. No user sees raw message fragments as primary results.
3. Person search disambiguates duplicates with merge suggestions.
4. Search from Character page is scoped and instant (pre-indexed moments for that person).
5. Memory Explorer and Life Log don't compete with search — they link into it.

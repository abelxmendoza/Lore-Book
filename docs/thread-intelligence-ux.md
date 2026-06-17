# Thread Intelligence UX

Date: 2026-06-15

Purpose: user-facing design for thread intelligence — summaries, people, places, projects, episodes, themes. Assumes `threadSummaryService`, `episodeSegmentationCore`, and thread metadata from `thread-intelligence-architecture.md`.

---

## Design principle

A thread is not a chat log. It is a **memory container**: a sequence of moments with known people, places, and open loops. Intelligence should feel like *continuity*, not analytics.

---

## Thread Intelligence Panel — contents

Every thread exposes structured metadata (stored, not generated on open):

```
summary_short      → 1 sentence
summary_medium     → 1 paragraph  
key_people[]       → resolved entity ids
key_places[]
key_projects[]
key_events[]       → episode ids
key_themes[]
first/last_message_at
episode_count
open_loops[]       → unresolved questions or unanswered user turns
```

---

## Surface 1: Sidebar thread list (always visible)

### Collapsed row (default)

```
┌────────────────────────────────────────────────────────┐
│ ● Family check-in                              3d ago  │
│   Abuela, Costco · 2 moments                           │
│   Time with Abuela matters more than shopping.         │
└────────────────────────────────────────────────────────┘
```

| Element | Source | Rule |
|---|---|---|
| Title | `title` | Never generic ("New chat") — use `deriveTitleFromMessages` fallback |
| Relative time | `last_message_at` | "3d ago", "Yesterday", "Jun 12" |
| Entity strip | `key_people` + `key_places` (max 2 each) | Chips, not sentences |
| Preview line | `summary_short` | One sentence; truncate at 80 chars |
| Active indicator | `●` if open loops or unread | Subtle pulse, not badge spam |

### Hover state (desktop)

```
┌────────────────────────────────────────────────────────┐
│ Family check-in                                  3d ago │
│ ────────────────────────────────────────────────────── │
│ Last time you were here, you talked about Costco with  │
│ Abuela and tested LoreBook memory recall.              │
│                                                        │
│ People     Abuela · Tío Juan                           │
│ Places     Costco                                      │
│ Projects   LoreBook                                    │
│ Moments    Costco With Abuela · Memory testing         │
│ Themes     Family · Product work                       │
│                                                        │
│ Open: "Did Abuela remember the coupon?"                │
│                                                        │
│ [ Open thread ]                                        │
└────────────────────────────────────────────────────────┘
```

Hover panel = `summary_medium` + structured key lists. **No LLM generation on hover** — read from stored metadata only.

### Continuity cues (never overwhelming)

Show at most **one** continuity signal per row:

| Signal | When | Copy |
|---|---|---|
| Open loop | Unanswered question in thread | "Open: …" |
| Stale summary | `memory_count − summary_message_count ≥ 4` | Faint "Updating…" shimmer |
| Active project | `key_projects` intersects user's pinned projects | Project chip highlighted |
| Recent person | `key_people` includes someone messaged elsewhere today | Person chip with dot |

Never show all four at once.

---

## Surface 2: Thread header (on open)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Family check-in                              ··· More    │
│  Abuela · Costco · LoreBook                                 │
│  ─────────────────────────────────────────────────────────  │
│  Last time (3 days ago): Costco With Abuela, memory tests.  │
│  Open: "Did Abuela remember the coupon?"                    │
└─────────────────────────────────────────────────────────────┘
```

Below header: horizontal **Moments rail** (episode cards, scrollable).

Tap **··· More** → Thread Intelligence drawer (full panel).

---

## Surface 3: Thread Intelligence drawer (on open / explicit)

Full structured view for power users and search indexing visibility.

```
┌─────────────────────────────────────────────────────────────┐
│  THREAD INTELLIGENCE                                    ✕   │
│  Family check-in                                            │
│  ─────────────────────────────────────────────────────────  │
│  SUMMARY                                                    │
│  Over the past two weeks you've used this thread for family │
│  updates and LoreBook memory testing with Abuela and Tío    │
│  Juan at Costco.                                            │
│                                                             │
│  PEOPLE (3)          PLACES (1)         PROJECTS (1)        │
│  [Abuela]            [Costco]           [LoreBook]          │
│  [Tío Juan]                                                 │
│  [Jerry]                                                    │
│                                                             │
│  MOMENTS (4)                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Costco With Abuela · Jun 2026 · 7 msgs              │   │
│  │ LoreBook memory testing · Jun 2026 · 12 msgs         │   │
│  │ Tío Juan check-in · May 2026 · 4 msgs               │   │
│  │ Family Sunday call · May 2026 · 9 msgs              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  THEMES                                                     │
│  Family responsibility · Product development · Eldercare    │
│                                                             │
│  OPEN LOOPS (1)                                             │
│  "Did Abuela remember the coupon?" — asked Jun 12, no reply│
│                                                             │
│  TIMELINE                                                   │
│  First message: May 3, 2026                                 │
│  Last activity: Jun 12, 2026                                │
│  47 messages · 4 moments                                    │
│                                                             │
│  [ Search this thread ]  [ Export summary ]                 │
└─────────────────────────────────────────────────────────────┘
```

### Drawer sections (fixed order)

1. Summary (`summary_long`)
2. People / Places / Projects (chip grids, tap → entity page)
3. Moments (episode cards, compact)
4. Themes (text chips)
5. Open loops (actionable — tap to jump to message)
6. Timeline stats (footer, muted)

---

## Surface 4: Search preview

When a thread appears in search results:

```
THREAD · Family check-in
Matched: Costco, Abuela
2 moments · Last active 3 days ago
"Time with Abuela matters more than shopping."
[ People: Abuela ] [ Place: Costco ] [ Moment: Costco With Abuela ]
```

Search matches against: title, `summary_long`, key entity names, episode titles, themes.

---

## Wireframes — sidebar hierarchy

```
SIDEBAR
├── [ + New thread ]
├── PINNED PROJECTS (max 3)
│   └── LoreBook · last touched 2h ago
├── RECENT PEOPLE (max 5, avatar strip)
│   └── Abuela · Sol · Ashley · …
├── THREADS (grouped)
│   ├── Today
│   │   └── ● LoreBook sprint          ← active project cue
│   ├── This week
│   │   ├── Family check-in            ← hover → intelligence panel
│   │   └── Amazon career thread
│   └── Earlier
│       └── …
└── [ Search all threads ⌘K ]
```

**Grouping rules:**
- Today / This week / This month / Earlier — never flat infinite scroll
- Max 15 visible threads per group; "Show more" for rest
- Pinned threads float above groups (max 3)

---

## Wireframes — thread open layout

```
┌──────────┬──────────────────────────────────────────────────┐
│          │  HEADER: title + entity strip + continuity line   │
│ SIDEBAR  │  MOMENTS RAIL: [ ep1 ] [ ep2 ] [ ep3 ]           │
│          │  ──────────────────────────────────────────────── │
│          │                                                  │
│          │  CHAT MESSAGES                                   │
│          │  (grouped by episode boundaries — faint dividers)  │
│          │                                                  │
│          │  ─── Costco With Abuela ───                      │
│          │  user: we went to Costco with Abuela…            │
│          │  assistant: …                                    │
│          │  ─── LoreBook memory testing ───                 │
│          │  user: does LoreBook remember…                   │
│          │                                                  │
│          │  [ composer ]                                    │
└──────────┴──────────────────────────────────────────────────┘
```

Episode boundaries in the message stream = faint labeled dividers (not heavy cards). Tap divider → open moment detail.

---

## Interactions

| Action | Result |
|---|---|
| Tap person chip | Character page (filtered to this thread's moments) |
| Tap moment in rail | Moment detail modal |
| Tap open loop | Scroll to message; highlight |
| "Search this thread" | Scoped search (messages + moments + entities) |
| Rename thread | Inline title edit; regen summary on next staleness threshold |
| Archive thread | Hidden from sidebar; still searchable |

---

## What never appears in thread intelligence

- Raw message counts without context ("47 messages" only in drawer footer)
- Confidence scores (trust UX handles in moment detail)
- Internal IDs, embedding status, summary version
- Duplicate entity warnings (Character Book merge flow)
- "AI thinks…" speculative copy — only stored metadata

---

## Staleness UX

When summaries are stale (`memory_count − summary_message_count ≥ N`):

- Sidebar preview: last known `summary_short` + subtle "Updating summary…" shimmer
- Never show blank or "Summary unavailable"
- After regen: no toast — preview silently updates (continuity, not notification)

---

## Mobile adaptations

| Desktop | Mobile |
|---|---|
| Hover intelligence panel | Long-press thread row → bottom sheet |
| Moments rail horizontal | Swipeable chips above composer |
| Intelligence drawer | Full-screen sheet from header ··· |
| Entity chips in sidebar row | Avatar dots only; full names on tap |

---

## Success criteria

1. Returning to a thread after 3 days, user sees **who, where, what happened** without re-reading messages.
2. Sidebar never feels like a flat ChatGPT list — every row has **entity + preview** context.
3. Open loops surface **actionable** continuity, not guilt.
4. Thread search returns **moments and people**, not just message text matches.
5. Zero LLM calls on hover/open — all intelligence is **pre-computed metadata**.

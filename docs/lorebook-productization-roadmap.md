# LoreBook Productization Roadmap

Date: 2026-06-15

Purpose: execution roadmap for GPT-5.5 Productization Sprint. Assumes Claude's backend work (episodes, lore-aware parsing, entity resolution, thread intelligence, graph integration) ships on schedule. UX-only scope.

Related docs:
- `episode-experience.md`
- `thread-intelligence-ux.md`
- `search-v2.md`
- `character-experience-v2.md`
- `project-experience-v2.md`
- `memory-trust-ux-v2.md`

---

## Terminology consolidation (do this first)

Before building new surfaces, align user-facing language:

| Old (confusing) | New (user-facing) | Internal (keep) |
|---|---|---|
| Life Log → Events tab | **Moments** | `episodes` / `resolved_events` |
| Life Log → Memories tab | **Facts** (filter inside Moments) | `character_memories` |
| Memory Explorer browse | **Search + Review** | memory index |
| Recurring Scenes | **Patterns** | `event_candidates` |
| Event modal | **Moment detail** | `resolved_events` detail |

**One rule:** Users browse **Moments**. Facts live inside moments. Events are moments with depth.

---

## Phase 0 — Foundation (weeks 1–2)

**Goal:** Stop the terminology bleeding. No new features — reframe existing UI.

| Task | Surface | Effort |
|---|---|---|
| Rename Life Log tabs: Moments / Calendar / Patterns | EventsBook | S |
| Route `/memories` legacy URL → Life Log Moments | routeMapping | S |
| Add evidence count to existing event cards | EventProfileCard | S |
| Thread row: show entity strip + summary_short | Sidebar | M |
| Provenance ⓘ chip on memory facts | MemoryDetailModal | S |
| Document terminology in empty states | Life Log, Character Book | S |

**Exit criteria:** User can explain Life Log in one sentence: "Moments from my life, with the details inside."

---

## Phase 1 — Episode Cards (weeks 3–4)

**Goal:** Surface episodes as first-class browse objects.

Depends on: `episodeSegmentationCore` persisted per thread.

| Task | Surface | Effort |
|---|---|---|
| EpisodeCard component (collapsed + expanded) | New component | M |
| Life Log Moments tab renders episode cards | EventsBook | M |
| Thread moments rail (horizontal scroll) | Chat thread view | M |
| Episode dividers in message stream | Chat thread view | S |
| Moment detail: reuse Event modal, add episode-only state | EventDetailModal | M |
| "Ask about this moment" → chat with WMA pre-load | Chat integration | M |

**Exit criteria:** "Costco" in Life Log shows "Costco With Abuela" card, not 7 messages.

---

## Phase 2 — Thread Intelligence Panel (weeks 5–6)

**Goal:** Threads feel like memory containers, not chat logs.

Depends on: thread metadata (Phase 1 of thread-intelligence-architecture).

| Task | Surface | Effort |
|---|---|---|
| Sidebar hover intelligence panel | Sidebar | M |
| Thread header: entity strip + continuity line | Chat header | M |
| Thread Intelligence drawer (full panel) | Chat ··· menu | L |
| Open loops detection + display | Thread metadata | M |
| Thread-grouped sidebar (Today / This week / Earlier) | Sidebar | M |
| Pinned projects strip (max 3) | Sidebar | S |

**Exit criteria:** Return to thread after 3 days → see who, where, what, open loops without re-reading.

---

## Phase 3 — Search V2 (weeks 7–9)

**Goal:** One search bar, grouped intelligent results.

Depends on: episode index, thread metadata index, entity index.

| Task | Surface | Effort |
|---|---|---|
| Universal search bar (⌘K) | Global | L |
| Grouped results: Top match + People + Moments + Threads + Timeline + Facts | Search results | L |
| Ranking formula implementation | Search backend | L |
| Person disambiguation ("Juan" → 3 matches) | Search results | M |
| Scoped search: thread, character, project | Contextual search | M |
| Memory Explorer → review queue only (remove browse duplication) | MemoryExplorer | M |

**Exit criteria:** "Costco" returns place + moments + people + thread in one screen.

---

## Phase 4 — Character & Project Pages V2 (weeks 10–12)

**Goal:** Entity pages tell life stories, not show data dumps.

| Task | Surface | Effort |
|---|---|---|
| Character hero: meaning line + pinned moments + Ask | CharacterBook / DetailModal | L |
| Biography sections with evidence links | Character detail | L |
| Moments timeline (replace memories wall) | Character detail | M |
| Importance breakdown (expandable) | Character detail | S |
| Duplicate merge UX with confidence | CharacterBook | M (API exists) |
| Project page template: brief, timeline, decisions, contributors | New ProjectBook | L |
| Project peek slide-over | Search + threads | M |

**Exit criteria:** Abuela page answers who/why/recent in 5 seconds with evidence on every claim.

---

## Phase 5 — Memory Trust UX (weeks 13–14)

**Goal:** Provenance visible everywhere.

| Task | Surface | Effort |
|---|---|---|
| Universal provenance panel component | Shared | M |
| Confidence labels + reason chains | Provenance panel | M |
| Conflict detection UI | Character + Facts | M |
| Correction flow (supersede, not delete) | Provenance panel | L |
| Chat weak-memory copy (WMA failure cases) | Chat responses | M |
| Orphan entity "Needs evidence" badges | Character Book | S |

**Exit criteria:** One tap from any fact → source message + confidence + correction path.

---

## Phase 5 — Life Timeline (weeks 15–16)

**Goal:** Human memory browsing, not analytics.

| Task | Surface | Effort |
|---|---|---|
| Unified timeline: moments + people + projects on year axis | Life Log Timeline | L |
| Timeline clusters by month | Search + Life Log | M |
| Recurring patterns as timeline ribbons | Patterns tab | M |
| Character/project timeline filters | Entity pages | M |
| Mobile: vertical scroll with sticky year headers | Life Log | M |

**Exit criteria:** Scroll 2024–2026 and see life phases, not a debug log.

---

## Top 50 Next-Level Features

Ranked by User Value (UV), Retention (R), Complexity (C), Differentiation (D).
Scale 1–5 each. **Score = UV + R + D − C.**

### Tier 1 — Ship in productization (score ≥ 10)

| # | Feature | UV | R | C | D | Score |
|---|---|---|---|---|---|---|
| 1 | **Moment Cards** — browse life as scenes | 5 | 5 | 2 | 5 | 13 |
| 2 | **Thread continuity panel** — pick up where you left off | 5 | 5 | 2 | 4 | 12 |
| 3 | **Universal grouped search** | 5 | 4 | 3 | 4 | 10 |
| 4 | **Provenance on every fact** | 4 | 5 | 2 | 4 | 11 |
| 5 | **Character meaning lines** — "who they are to you" | 5 | 4 | 2 | 5 | 12 |
| 6 | **Ask about [person/moment/project]** — WMA pre-loaded chat | 5 | 5 | 2 | 4 | 12 |
| 7 | **Pinned moments on character pages** | 4 | 4 | 1 | 4 | 11 |
| 8 | **Open loop surfacing** — unresolved questions | 4 | 5 | 2 | 4 | 11 |
| 9 | **Duplicate merge with confidence** | 3 | 4 | 2 | 5 | 10 |
| 10 | **Life Log consolidation** — one browse mode | 4 | 4 | 2 | 4 | 10 |

### Tier 2 — High value, next quarter (score 7–9)

| # | Feature | UV | R | C | D | Score |
|---|---|---|---|---|---|---|
| 11 | Project decision log | 4 | 3 | 2 | 4 | 9 |
| 12 | Recurring pattern cards (Patterns tab) | 4 | 4 | 2 | 3 | 9 |
| 13 | Conflict resolution UI | 3 | 4 | 3 | 5 | 9 |
| 14 | Correction history (bi-temporal facts) | 3 | 4 | 3 | 5 | 9 |
| 15 | Thread-grouped sidebar | 4 | 3 | 2 | 3 | 8 |
| 16 | Episode dividers in chat stream | 3 | 3 | 1 | 4 | 9 |
| 17 | Person disambiguation in search | 3 | 3 | 2 | 4 | 8 |
| 18 | Project brief one-screen | 4 | 3 | 2 | 3 | 8 |
| 19 | Character peek slide-over | 4 | 3 | 2 | 3 | 8 |
| 20 | Timeline year-axis browsing | 4 | 4 | 3 | 2 | 7 |
| 21 | Revealed preferences on character page | 3 | 4 | 2 | 4 | 9 |
| 22 | Epiphany cards on project page | 3 | 3 | 2 | 5 | 9 |
| 23 | Memory review queue (approve/reject) | 3 | 4 | 2 | 4 | 9 |
| 24 | "Needs evidence" orphan badges | 3 | 3 | 1 | 4 | 9 |
| 25 | Scoped ⌘K (search this thread/person) | 3 | 3 | 2 | 3 | 7 |

### Tier 3 — Differentiation moat (score 5–7)

| # | Feature | UV | R | C | D | Score |
|---|---|---|---|---|---|---|
| 26 | Moment reflection chat (later interpretation) | 4 | 3 | 3 | 5 | 9 |
| 27 | Relationship trajectory graph | 3 | 4 | 4 | 5 | 8 |
| 28 | Life chapters auto-proposed | 4 | 4 | 4 | 5 | 9 |
| 29 | Biography export (PDF/markdown) | 3 | 2 | 3 | 4 | 6 |
| 30 | "On this day" memory resurface | 4 | 5 | 2 | 3 | 10 |
| 31 | Family tree visualization | 3 | 3 | 4 | 4 | 6 |
| 32 | Cross-thread moment linking | 3 | 3 | 3 | 4 | 7 |
| 33 | Voice note → moment pipeline | 4 | 3 | 4 | 4 | 7 |
| 34 | Photo attach to moment | 3 | 3 | 3 | 3 | 6 |
| 35 | Shared moment (export card) | 2 | 2 | 2 | 4 | 6 |

### Tier 4 — Future horizon (score < 5 or C ≥ 4)

| # | Feature | UV | R | C | D | Score |
|---|---|---|---|---|---|---|
| 36 | Multi-user family LoreBook | 4 | 5 | 5 | 5 | 9 |
| 37 | Life podcast (audio biography) | 3 | 3 | 5 | 5 | 6 |
| 38 | AR memory anchors (place-based) | 2 | 2 | 5 | 5 | 4 |
| 39 | Wearable moment capture | 3 | 3 | 5 | 4 | 5 |
| 40 | AI interviewer mode (guided recall) | 4 | 4 | 3 | 4 | 9 |
| 41 | Dream journal integration | 2 | 2 | 2 | 3 | 5 |
| 42 | Health timeline overlay | 3 | 3 | 4 | 3 | 5 |
| 43 | Financial life chapter | 2 | 2 | 4 | 3 | 3 |
| 44 | Legacy mode (beneficiary access) | 3 | 3 | 5 | 5 | 6 |
| 45 | Moment map (geographic) | 3 | 3 | 4 | 4 | 6 |
| 46 | Habit/routine detection UI | 3 | 4 | 3 | 4 | 8 |
| 47 | Emotional weather (life mood arc) | 3 | 3 | 4 | 4 | 6 |
| 48 | Contradiction journal | 2 | 3 | 2 | 4 | 7 |
| 49 | API for third-party memory ingest | 2 | 2 | 4 | 4 | 4 |
| 50 | LoreBook as ChatGPT memory replacement bridge | 5 | 4 | 4 | 5 | 10 |

---

## ChatGPT Thread List Analysis (Part 4)

### What competitors do

| Product | Thread list strength | Weakness |
|---|---|---|
| **ChatGPT** | Clean, minimal, fast | Zero memory continuity; generic titles; no entity context |
| **Claude** | Project grouping, artifact hints | No life memory; projects are folders not arcs |
| **Notion** | Rich previews, icons, last edited | Not conversational; no entity intelligence |
| **Linear** | Status, assignee, priority at glance | Work-only; no personal memory |

### LoreBook Thread List V2 — design rules

1. **Never overwhelming** — max 15 threads per time group; entity strip not sentence
2. **Useful previews** — `summary_short`, not first message truncated
3. **Continuity cues** — one signal per row (open loop OR active project OR recent person)
4. **Active projects** — pinned strip above thread list (max 3)
5. **Recent people** — avatar strip for quick jump to character peek

See `thread-intelligence-ux.md` for wireframes.

---

## Life Timeline design (Part 5)

Not analytics. Human memory browsing.

```
2026 ─────────────────────────────────────────
  June
    ✦ Costco With Abuela          👤 Abuela  📍 Costco
    ✦ WMA Integration Sprint      🎯 LoreBook
  May
    ✦ Entity Integrity Sprint     🎯 LoreBook
    ✦ Sunday call with Abuela     👤 Abuela  ↻ recurring

2025 ─────────────────────────────────────────
  December · "The year LoreBook started taking shape"
    ✦ First biography generation
    …
```

**Layer toggles** (filter chips, not separate pages):
- All · People · Projects · Places · Patterns

People/projects/places appear **as annotations on moments**, not separate timeline tracks — one chronological stream with rich metadata.

---

## Execution priority matrix

| Priority | Phase | Trust impact | User impact | Effort |
|---|---|---|---|---|
| **P0** | Terminology consolidation | High | High | Low |
| **P0** | Episode cards in Life Log | High | High | Medium |
| **P0** | Thread continuity (sidebar + header) | High | High | Medium |
| **P1** | Search V2 grouped results | High | High | High |
| **P1** | Provenance panel | High | Medium | Medium |
| **P1** | Character page V2 | Medium | High | High |
| **P2** | Project pages | Medium | Medium | High |
| **P2** | Life Timeline unified | Medium | High | Medium |
| **P2** | Conflict resolution UI | High | Low | Medium |
| **P3** | Top 50 Tier 3–4 features | Varies | Varies | Varies |

---

## What NOT to build

- A 4th browse surface (Moments replaces Events/Memories split)
- Separate episode search router (Search V2 handles it)
- Live LLM generation on thread hover (stored metadata only)
- New memory storage systems (UX on existing graph)
- Analytics dashboard pretending to be Life Timeline

---

## Success metric

LoreBook feels more **personal** (moments with meaning lines), more **understandable** (one word: Moments), and more **trustworthy** (provenance everywhere) than ChatGPT — measured by:

1. User can find "Costco with Abuela" in <10 seconds
2. User returning to thread knows context without re-reading
3. User trusts a biography claim because evidence is one tap away
4. User describes Life Log in one sentence
5. Zero "what's the difference between memory and event?" support questions

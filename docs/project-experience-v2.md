# Project Experience V2

Date: 2026-06-15

Purpose: redesign Project pages for long-running effort arcs. Assumes graph intelligence, episodes, and thread intelligence exist. Extends `projects-v3.md` with concrete UX.

---

## Design principle

A project page is not a folder of threads. It is **the story of an effort** — why it started, what changed, who shaped it, and what's still open.

---

## Examples

LoreBook · Amazon · Omega · Career · Family goals

Each uses the same template; content density varies by project type.

---

## Hero (above the fold)

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 LoreBook                                    ACTIVE      │
│  Personal knowledge system · Creative · Since Mar 2024      │
│  ─────────────────────────────────────────────────────────  │
│  "Building the biographer you wish ChatGPT was."            │
│  ─────────────────────────────────────────────────────────  │
│  23 moments · 8 threads · Last active 2 hours ago           │
│  Contributors: Sol, Ashley · Phase: Memory integration        │
│                                                             │
│  [ Ask about LoreBook ]  [ Add decision ]  [ Edit ]         │
└─────────────────────────────────────────────────────────────┘
```

### Always visible

| Field | Example |
|---|---|
| Name + status badge | LoreBook · ACTIVE |
| Type + start date | Creative · Since Mar 2024 |
| Purpose line | One sentence: why this exists |
| Activity stats | Moments, threads, last active |
| Key contributors | People with ≥3 project moments |
| Current phase | LLM-inferred or user-set milestone label |
| Ask button | Primary action |

---

## Page sections

### 1. Project brief (default expanded)

One-screen answer to five questions:

```
PROJECT BRIEF
What          Personal AI biographer with persistent memory graph
Why it matters You want software that remembers your life, not just chats
Current state  Working Memory Assembler integrated; episodes landing
Last activity  WMA integration sprint · 2 hours ago
Next step      Episode UX + thread intelligence panel
Biggest open Q How to consolidate Life Log / Events / Memories UI
```

Each line evidence-linked.

### 2. Timeline

Meaning-aware chronological arc — not a flat event list.

```
TIMELINE
2026 ─────────────────────────────────────────
  Jun  WMA Integration Sprint ★ milestone
  May  Entity Integrity Sprint
  Apr  P0 Stability Sprint
2025 ─────────────────────────────────────────
  Dec  First biography generation
  …

Legend: ★ milestone · ↻ pivot · ⏸ pause · ✦ breakthrough
```

Timeline items = episodes tagged with this project + promoted milestones/decisions.

Tap → moment detail.

### 3. Decision log

Projects accumulate choices. Surface them explicitly.

```
DECISIONS (6)
┌─────────────────────────────────────────────────────────────┐
│ Working Memory Assembler as primary retrieval               │
│ Jun 2026 · Options: patch recall routers / new WMA / hybrid │
│ Chose: WMA primary with legacy flag                         │
│ Reason: eliminate retrieval sprawl                            │
│ 📎 LoreBook sprint thread · 4 messages                       │
└─────────────────────────────────────────────────────────────┘
```

Decisions extracted from episodes where user stated a choice, or manually added.

Fields: decision, date, options considered, chosen option, stated reason, evidence.

### 4. Contributors

People who shaped the project:

```
CONTRIBUTORS
  Sol — co-builder · 8 moments · Last: Jun 2026
  Ashley — early tester · 3 moments · Last: May 2026
  Kelly — onboarding feedback · 1 moment · Mar 2026
```

Tap person → character page filtered to project moments.

### 5. Moments

All episodes tagged with this project:

```
MOMENTS (23)
  [ WMA Integration Sprint · Jun 2026 ]
  [ Entity classifier design · May 2026 ]
  …
```

Same episode cards as Life Log, project-filtered.

### 6. Milestones

Explicit checkpoints — user-created or system-detected:

```
MILESTONES
  ✓ Graph V2 ontology defined · Apr 2026
  ✓ Working Memory Assembler shipped · Jun 2026
  ○ Episode UX launch · target Jul 2026
  ○ 1,000 users · open
```

### 7. Epiphanies & patterns

From Epiphany Engine — structural insights about the project:

```
INSIGHTS
  "You revisit architecture docs after every stability crisis"
  Confidence: 78% · 5 supporting moments
  [ View evidence ]
```

Shown with provenance; never as bare assertions.

### 8. Open loops

Unresolved project questions and next actions:

```
OPEN LOOPS (3)
  ○ Consolidate Life Log UI terminology
  ○ Backfill evidence for thin characters
  ○ Thread list V2 design
```

Pulled from thread open loops + extracted action items.

### 9. Preferences (revealed)

Work style signals inferred from project episodes:

```
YOUR PATTERNS ON THIS PROJECT
  Prefers sprint-based execution over continuous drip
  Documentation before implementation
  📎 4 supporting moments
```

---

## Project types — emphasis shifts

| Type | Hero emphasis | Extra section |
|---|---|---|
| **Work** (Amazon) | Role, team, status | Org chart lite, performance moments |
| **Creative** (LoreBook) | Vision, phase | Decision log, milestones |
| **Career** | Trajectory, goals | Turning points, job transitions |
| **Family** | People involved | Relationship moments, recurring rituals |
| **Health** | Current focus | Sensitive — extra trust UX, no sharing prompts |

Same template; section weights adapt.

---

## Project peek (from thread/search)

Slide-over for quick context:

```
LoreBook · ACTIVE
"Building the biographer you wish ChatGPT was."
Phase: Memory integration · 2h ago
[ 3 open loops ] [ Ask ] [ Open full project ]
```

---

## Thread list integration

Threads tagged with a project show in:
- Project page → Threads section
- Sidebar → Pinned projects strip (max 3 active)
- Thread row → project chip if `key_projects` includes it

---

## Status lifecycle UX

| Status | Badge | Behavior |
|---|---|---|
| Active | Green ACTIVE | Full timeline, open loops prominent |
| Paused | Amber PAUSED | "Paused since…" banner; timeline frozen |
| Completed | Blue DONE | Archive mode; reflection prompt |
| Abandoned | Muted | No guilt copy; "Archived" framing |
| Recurring | Purple RECURRING | Pattern emphasis (Sunday calls, weekly standup) |

---

## Empty project

```
LoreBook
No moments yet. Mention LoreBook in chat or link a thread to this project.
[ Link a thread ] [ Tell LoreBook about this project ]
```

---

## Mobile layout

```
[ Hero: name, status, purpose, Ask ]
[ Brief — accordion ]
[ Timeline — vertical, year headers ]
[ Open loops — pinned top if >0 ]
[ Moments — list ]
[ Decisions · Contributors · Milestones — tabs ]
```

---

## Success criteria

1. Opening LoreBook project answers **what, why, where we are, what's next** in 10 seconds.
2. Decision log preserves **choices and tradeoffs**, not just outcomes.
3. Contributors link to **character pages** with shared moments.
4. Epiphanies show **evidence count** always.
5. Project page and thread intelligence **share the same project chips** — one source of truth.

# Episode Experience

Date: 2026-06-15

Purpose: user-facing design for **Episodes** — the primary scene unit LoreBook surfaces after thread segmentation lands. Assumes `episodeSegmentationCore`, `entityResolutionCore`, and thread intelligence exist. Does **not** redesign backend architecture.

---

## First: Memory vs Event vs Episode (plain language)

Users should never need a glossary. Internally LoreBook has three layers; externally we show **one thing** with depth.

| Internal | What it actually is | User-facing word | Where it lives today |
|---|---|---|---|
| `chat_messages` | Raw evidence — what was said | *(hidden)* | Thread transcript |
| **Episode** | A bounded scene: who, where, when, which messages | **Moment** | *Not surfaced yet* (segmentation in progress) |
| **Event** (`resolved_events`) | A moment that earned meaning layers (emotion, cognition, identity, narrative, causal links) | **Event** (keep for power users) or fold into Moment detail | Life Log → Events tab |
| **Memory** (`character_memories`, journal cards) | Atomic fact or quote, often person-attached | **Detail inside a Moment**, not a parallel browse mode | Life Log → Memories tab, Memory Explorer |

**The consolidation rule:**

> **Moments are what you browse. Events are moments with depth. Memories are lines inside moments.**

Life Log, Memory Explorer, and EventsBook today show **three faces of the same substrate**. After episodes ship, they collapse into:

1. **Life Log** — chronological browse of Moments (episodes)
2. **Moment detail** — the Event modal you already built (meaning layers, reflection chat, sources)
3. **Memory Explorer** — search + review queue over facts, always linking back to a parent Moment

Do **not** delete `resolved_events` or `character_memories`. Rename the UX so users see one timeline, not three products.

---

## Episode Card — "Costco With Abuela"

### What the user sees (collapsed card)

```
┌─────────────────────────────────────────────────────────────┐
│  Costco With Abuela                              June 2026  │
│  ─────────────────────────────────────────────────────────  │
│  👤 Abuela          📍 Costco          💬 7 messages        │
│                                                             │
│  Time with Abuela matters more than shopping.               │
│  ─────────────────────────────────────────────────────────  │
│  From: Family check-in thread · 3 days ago                  │
│  ●●●○○  Moderate significance                               │
└─────────────────────────────────────────────────────────────┘
```

### Field hierarchy

| Priority | Field | Source | Never hide? |
|---|---|---|---|
| 1 | **Title** | LLM-titled episode or deterministic fallback | Yes |
| 2 | **Meaning line** | One-sentence theme (not summary) | Yes — this is the magic |
| 3 | **People** | Resolved entity chips (max 3 + overflow) | Yes |
| 4 | **Place** | Resolved location chip | If known |
| 5 | **When** | Fuzzy date (June 2026) not ISO timestamp | Yes |
| 6 | **Evidence count** | `messageIds.length` | Yes — trust anchor |
| 7 | **Thread provenance** | Parent thread title + relative time | Yes |
| 8 | **Significance** | Dot scale or word (minor → major) | Optional on card |

**Meaning line examples:**
- "Time with Abuela matters more than shopping."
- "First time you talked about leaving Amazon."
- "A recurring Sunday ritual with the kids."

The meaning line is **not** a message summary. It answers: *why would I care about this moment later?*

### Expanded card (hover or tap on list)

```
┌─────────────────────────────────────────────────────────────┐
│  Costco With Abuela                              June 2026  │
│  Time with Abuela matters more than shopping.               │
│                                                             │
│  PEOPLE          PLACES         PROJECTS                    │
│  Abuela          Costco         —                           │
│                                                             │
│  THEMES          RELATIONSHIPS                              │
│  Family care     Abuela (grandmother)                       │
│                                                             │
│  EVIDENCE        7 messages · Jun 12, 2026 2:14–2:41 PM   │
│  [View transcript excerpt ▾]                                │
│                                                             │
│  [ Open full moment ]  [ Ask about this ]  [ Pin to Abuela ]│
└─────────────────────────────────────────────────────────────┘
```

### Full moment detail (drill-down)

Reuse the existing **Event modal** four-tab pattern:

| Tab | Content |
|---|---|
| **Overview** | Title, meaning, people, place, date, thread link, significance |
| **Meaning** | Emotions, cognitions, identity impacts, narrative (at-the-time vs later) |
| **Connections** | Related moments, recurring scene membership, causal links, same people/place |
| **Sources** | Message excerpts with timestamps; journal entries; linked memory facts |

If the episode has not yet been promoted to a full event, show Overview + Sources only, with a subtle prompt: *"LoreBook can deepen this moment as you reflect on it."*

---

## Layout patterns

### Life Log (primary surface)

Replace the current five-tab confusion (Events / Memories / Timeline / Recurring / Calendar) with:

```
[ Moments ]  [ Calendar ]  [ Patterns ]
     ↑              ↑              ↑
  episodes      date grid    recurring scenes
  (= browse)    (= when)     (= event_candidates)
```

- **Moments** — default; episode cards in reverse chronological order
- **Calendar** — same data, date grid (keep existing calendar view)
- **Patterns** — recurring scenes (current "Recurring" tab); cross-session rhythm

Memories and raw events become **filters inside Moments**, not top-level tabs:
- Filter: `Has meaning layers` → shows promoted events
- Filter: `Has linked facts` → shows moments with character_memories attached
- Filter: `Unverified` → review queue items

### Thread sidebar strip

When viewing a thread, show a horizontal episode rail:

```
This thread · 4 moments
[ Costco With Abuela ] [ LoreBook testing ] [ Tío Juan call ] [ + ]
```

Tap → moment detail without leaving thread context.

### Character page

Episodes involving this person appear as a **Moments** section (not a separate "memories" wall):

```
Moments with Abuela (12)
[ Costco With Abuela · Jun 2026 ]
[ Sunday phone calls · recurring ]
```

### Search result

Episode card as a first-class result type (see `search-v2.md`).

---

## Interactions

| Action | Behavior |
|---|---|
| **Open full moment** | Event modal; preserves scroll position in Life Log |
| **Ask about this** | Opens chat with moment pre-loaded in working memory |
| **Pin to [Person]** | Adds to person's "pinned moments" (max 3 visible on character hero) |
| **View transcript** | Inline expand; never navigate away to raw thread unless user chooses |
| **Correct title/meaning** | Inline edit; creates correction record (trust UX) |
| **Merge with…** | If duplicate episode detected; shows confidence + reason |
| **Split moment** | Advanced: user marks message boundary (rare) |

---

## Episode vs Event — when to show which label

**Default user language: "Moment" everywhere.**

| State | Card label | Detail depth |
|---|---|---|
| Episode only (segmented, no meaning extraction) | Moment | Overview + Sources |
| Episode + meaning layers | Moment *(badge: Deep)* | Full four-tab modal |
| Recurring pattern (event_candidate) | Pattern | Pattern card with occurrence timeline |

Power-user/debug mode can show "Episode ID" and "Event ID" in Sources tab provenance panel.

---

## Relationship to existing UI

| Existing surface | After consolidation |
|---|---|
| Life Log → Events tab | Life Log → **Moments** (same data, episode-first framing) |
| Life Log → Memories tab | **Filter** inside Moments + Memory Explorer for search/review |
| Life Log → Timeline | **Moments** in list mode with year headers (merge, don't duplicate) |
| Life Log → Recurring | **Patterns** tab (unchanged concept, clearer name) |
| Memory Explorer | Search + review queue; every result links to parent Moment |
| Event modal | Moment detail modal (keep all seven meaning layers) |

---

## Empty and weak states

| State | UX |
|---|---|
| No episodes yet | "Your conversations haven't formed moments yet. Keep chatting — LoreBook groups scenes automatically." |
| Episode, no meaning | Show moment card; meaning line = deterministic fallback from participants + place |
| Episode, 1 message | Still valid; evidence count = 1; no shame copy |
| Unknown people | Show raw mention in italics + "Not linked yet" chip; tap to resolve |

---

## Success criteria

1. User searching "Costco" finds **Costco With Abuela** as a moment card, not 7 scattered messages.
2. Life Log has **one default browse mode**, not three competing ones.
3. Character pages show **moments with this person**, not a separate memory dump.
4. Every moment shows **evidence count** and **thread provenance** without digging.
5. The word **"memory"** in UI refers to atomic facts inside moments, not the whole system.

# Life Timeline — Content & IA Spec

**Status:** Ready for implementation (copy/IA only)
**Depends on:** Settled vocabulary from `timeline-consolidation-roadmap.md` — Utterance → Moment → Timeline → Chapter/Arc
**Surfaces after merge:** **Life Timeline** (browse when life happened) + **Life Saga** (read life as story)
**Out of scope:** Code, routes, file paths, data models

---

## 1. Glossary (canonical vocabulary)

Use these labels **everywhere** in product UI. Do not introduce synonyms in eyebrows, H1s, tabs, buttons, empty states, tooltips, or sidebar.

| Concept | Plain-language definition (user-facing) | Canonical UI label | Never call it |
|--------|------------------------------------------|--------------------|---------------|
| **Utterance** | A single thing you said or wrote in chat — the raw line LoreBook starts from. | **Message** *(only if evidence UI must name it; otherwise do not surface)* | Utterance, token, turn, fragment |
| **Moment** | Something that happened in your life — a dated scene you can open, edit, or post. | **Moment** | Event, memory, occurrence, scene, episode, entry, happening |
| **Timeline** | Your Moments arranged in time so you can see *when* life unfolded. | **Life Timeline** *(surface)* / **Timeline** *(short, in chrome)* | Life Log, Omni Timeline, Chronology, Memories, calendar-as-product-name |
| **Chapter** | A named stretch of your life that groups many Moments (an era or season). | **Chapter** | Period, era (as noun), life period, phase |
| **Arc** | A storyline that runs through your life across Chapters (work, love, a place, a pursuit). | **Arc** | Storyline *(except inside Life Saga body copy if already shipped — prefer Arc)*, thread, track *(system-only)*, saga-item |

### Hard rules

1. **One noun per screen role.** The merged surface is **Life Timeline**. Cards on it are **Moments**. Narrative reading lives in **Life Saga**.
2. **“Event” is banned in UI copy.** Keep it only in engineering/API internals.
3. **“Memory / Memories” is banned** as a book or tab name. Facts inside Moments may say **facts**, not memories.
4. **Utterance never appears** in nav, titles, or CTAs. Evidence chips may say **from a message**.
5. **Chapter** = time container. **Arc** = narrative thread. Do not swap them in user copy.
6. **Pattern** is allowed as a *view/filter label* (repeating rhythms), not as a fifth hierarchy layer.

### Banned → replace

| Ban | Replace with |
|-----|----------------|
| Life Log | Life Timeline |
| Omni Timeline / Timeline (as competing product name) | Life Timeline |
| Post event | Post a moment |
| Events / event card | Moments / Moment |
| Chronology (tab) | Feed |
| Memories / Memory book | *(remove)* or Facts *(subtool only)* |
| Occurrence / co-occurrence | *(never in UI)* |
| Scene (as Moment synonym) | Moment |
| Recurring scenes | Patterns |

---

## 2. Microcopy — merged Life Timeline surface

### 2.1 Page chrome

| Element | Copy |
|---------|------|
| Sidebar label | **Life Timeline** |
| Page eyebrow | **Life Timeline** |
| Page title (H1) | **Your life in time** |
| Page subtitle (one line under H1) | Browse Moments by time, calendar, or pattern — then open Life Saga when you want the story. |
| First-time hint / tooltip (info control next to H1) | **Life Timeline** shows *when* things happened. **Life Saga** tells the *story* across Chapters and Arcs. |
| Cross-link to Life Saga | Also see · **Life Saga** |
| Stats line (optional) | `{n} moments` · `{p} patterns` · `{c} chapters` *(omit zero segments)* |

### 2.2 Primary CTA

| Element | Copy |
|---------|------|
| Primary button | **Post a moment** |
| Primary button (short / mobile) | **Post** |
| Aria-label | Post a moment to your Life Timeline |
| Composer title | **Post a moment** |
| Composer submit | **Post moment** |
| Composer cancel | **Cancel** |

### 2.3 View-mode tabs (top or bottom nav)

Canonical order:

| Tab label | Short (mobile) | Purpose line (title attribute / hint) |
|-----------|----------------|----------------------------------------|
| **Feed** | Feed | Moments in time order |
| **Lanes** | Lanes | Moments across parallel life tracks |
| **Calendar** | Cal | Moments by day |
| **Moments** | Moments | Browse and manage your Moment library |
| **Patterns** | Patterns | Rhythms that keep showing up |

Do **not** add a **Story** tab on Life Timeline. Story reading is **Life Saga**.

### 2.4 Empty states

**Feed (no moments yet)**
- Title: **No Moments on your timeline yet**
- Body: When you chat about your life — or post a Moment — it shows up here in time order.
- CTA: **Post a moment**

**Lanes (no tracks yet)**
- Title: **No lanes to show yet**
- Body: As LoreBook groups your Moments into Arcs, they’ll fan out across lanes here.
- CTA: **Post a moment** · secondary: **Open Life Saga**

**Calendar (no dated moments)**
- Title: **Nothing on the calendar yet**
- Body: Dated Moments appear on the days they happened.
- CTA: **Post a moment**

**Moments library (empty)**
- Title: **Your Moment library is empty**
- Body: Post something that happened — a night out, a hard week, a small win — and it’ll live here.
- CTA: **Post a moment**

**Moments library (filters match nothing)**
- Title: **No Moments match**
- Body: Clear filters or try a different search.
- CTA: **Clear filters**

**Patterns (none)**
- Title: **No Patterns yet**
- Body: When the same kind of Moment keeps returning — weekly rituals, familiar places — it’ll show up here.
- CTA: none required · optional: **Post a moment**

### 2.5 Secondary controls (Moments library view)

| Control | Label |
|---------|--------|
| Search field placeholder | Search Moments… |
| Filter disclosure | Filters |
| Category group aria | Moment categories |
| Facts subtool entry | **Search facts** |
| Facts subtool eyebrow | Inside Moments |
| Facts subtool title | **Search facts** |
| Facts subtool blurb | Details pulled from your Moments — not a separate timeline. |
| Facts back control | **Back to Moments** |
| Patterns intro | Rhythms LoreBook notices — Sunday calls, weekly rituals, familiar places. |
| Patterns refresh | **Refresh patterns** |

### 2.6 Life Saga contrast copy (keep Saga separate)

Use when Life Timeline links out, or in Saga header:

| Element | Copy |
|---------|------|
| Saga sidebar / H1 eyebrow | **Life Saga** |
| Saga one-liner | Chapters and Arcs — the story shape of your life. |
| Saga → Timeline link | **View on Life Timeline** |
| Timeline → Saga link | **Read in Life Saga** |

---

## 3. Surface-to-job mapping

Merge **Omni Timeline** + **Life Log** → **Life Timeline**. Keep **Life Saga** separate.

### 3.1 From Omni Timeline

| Current capability | Decision | Why |
|--------------------|----------|-----|
| **Calendar** view | **View-mode toggle** → tab **Calendar** | Core “when” job; one calendar only after merge. |
| **Swimlanes** view | **View-mode toggle** → tab **Lanes** | Unique multi-track chronology; keep, rename for plain language. |
| **Chronology** (stitched list) | **View-mode toggle** → tab **Feed** | Primary time-ordered stream; retire “Chronology” as a user word. |
| **Story** view (read arcs in Omni) | **Cut as a Timeline tab** → deep-link to **Life Saga** | Avoids a second story surface; Saga owns narrative reading. |
| Generate / search-a-timeline control | **Keep** as chrome search on Life Timeline (not a tab) | Utility, not a competing browse mode. |
| “memories” count in subtitle | **Cut / reword** → count **Moments** (and Chapters if shown) | Aligns with glossary; kills Memory collision. |
| Duplicate calendar entry from other surfaces | **Cut** | Calendar lives once, as a Life Timeline mode. |

### 3.2 From Life Log (`EventsBook` behaviors Omni lacks)

| Current capability | Decision | Why |
|--------------------|----------|-----|
| **Moments** card library (grid browse) | **View-mode toggle** → tab **Moments** | Library/manage job is distinct from time-ordered Feed. |
| **Patterns** (recurring) tab | **View-mode toggle** → tab **Patterns** | Analysis of repetition; belongs on Timeline, not Saga. |
| **Post event** composer | **Keep** as primary CTA **Post a moment** | Creation belongs on Life Timeline; feed + library both benefit. |
| Category / impact / significance filters | **Keep** as filters inside **Moments** (and optionally Feed) | Browse controls, not separate surfaces. |
| **Search facts** / Memory Explorer layout | **Keep as subtool** under **Moments** (not a top-level tab) | Facts are inside Moments; must not read as a fifth timeline. |
| “Also see → Calendar” cross-link | **Cut** | Becomes an in-surface tab. |
| “Also see → Narrative Anchors” | **Keep** as cross-link | Different product concern; not chronology. |
| Page nouns Life Log / Moments / Post event mix | **Replace** with §2 microcopy | Ends on-screen synonym collision. |

### 3.3 Life Saga (unchanged ownership)

| Capability | Decision | Why |
|------------|----------|-----|
| Chapter / Arc narrative reading | **Stays separate surface: Life Saga** | Story shape ≠ time browse. |
| Omni **Story** tab content | **Absorb into Saga** (link from Timeline, don’t duplicate UI) | One story home. |
| Posting Moments | **Does not live on Saga** | Creation stays on Life Timeline. |

### 3.4 Resulting IA (target)

```
Sidebar
├── Life Timeline     ← when (Feed · Lanes · Calendar · Moments · Patterns)
└── Life Saga         ← story (Chapters · Arcs)

Life Timeline primary verb:  Post a moment
Life Saga primary verb:      (read / copy story — no “post event”)
```

---

## 4. Implementation checklist for the coding agent (copy only)

Apply labels from this doc; do not invent alternatives.

- [ ] Sidebar: single **Life Timeline** entry (replaces Omni Timeline + Life Log labels)
- [ ] H1 / eyebrow / subtitle / first-time hint match §2.1
- [ ] Primary CTA is **Post a moment** everywhere that previously said Post event
- [ ] Tabs exactly: **Feed · Lanes · Calendar · Moments · Patterns** (no Story tab)
- [ ] Empty states use §2.4 verbatim (or trim body only if space-constrained on mobile — keep titles)
- [ ] Grep UI strings and eliminate banned terms in §1
- [ ] Life Saga retains its own name; mutual “Also see” links use §2.6

---

## 5. Voice notes (short)

- Prefer *your life* / *what happened* over product jargon.
- Prefer *when* (Timeline) vs *story* (Saga) as the contrast pair in any hint.
- Numbers: always **moments**, never events.
- Patterns are *noticed rhythms*, not a place to post.

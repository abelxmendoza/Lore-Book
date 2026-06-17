# LoreBook Million-User Roadmap

Date: 2026-06-15

Purpose: define the next 12 months after the current architecture succeeds, assuming the autobiographical graph, episodes, trust layer, revealed preferences, epiphany engine, and biography engine exist. This is a product execution roadmap, not a systems redesign.

## Strategic Thesis

The path to 1 million users is not "more AI features." It is:

1. Make memory trustworthy enough for daily use.
2. Make the product useful every week, not only during deep reflection.
3. Turn accumulated time into visible value.
4. Build surfaces users return to: threads, characters, projects, biography, search, digest.
5. Let users export and preserve value so the archive feels real.

## The Next 50 Features

Ranked by user value, retention impact, implementation complexity, and strategic importance.

Complexity: S = small, M = medium, L = large, XL = platform-level.

| Rank | Feature | User value | Retention impact | Complexity | Strategic importance |
|---:|---|---|---|---:|---|
| 1 | Source-backed recall answers | Trust every life claim | Very high | L | Foundational |
| 2 | Unified semantic search | Find any memory by meaning | Very high | L | Foundational |
| 3 | Memory correction workflow | Repair wrong life record | Very high | L | Foundational |
| 4 | Private/no-memory chat | Safe disclosure | High | M | Trust |
| 5 | Thread summaries with memory delta | Resume conversations | High | M | Daily UX |
| 6 | Character Pages V3 baseline | Understand people | Very high | L | Core moat |
| 7 | Project Memory V3 baseline | Long-running continuity | Very high | L | Weekly use |
| 8 | Weekly life digest | Habit formation | Very high | L | Retention |
| 9 | Story coverage diagnostics surfaced as UX | Reveal missing evidence | High | M | Trust |
| 10 | Evidence drawer everywhere | Inspect sources | High | L | Trust |
| 11 | Relationship timelines | Emotional value | High | L | Differentiator |
| 12 | "What changed since last time?" | Return value | High | M | Retention |
| 13 | Thread branching with memory rules | Safe exploration | Medium | L | Power UX |
| 14 | Retry modes | Recover weak answers | Medium | M | Chat quality |
| 15 | Memory review queue | Confirm/correct capture | High | L | Trust |
| 16 | Life Projects | Organize domains | High | XL | Platform |
| 17 | Project-only memory | Scope sensitive context | High | XL | Trust |
| 18 | Biography chapter draft | Turn memory into story | High | L | Moat |
| 19 | Biography evidence review | Prevent creepy prose | High | L | Trust |
| 20 | Character duplicate resolver UI | Fix wrong people | High | M | Entity quality |
| 21 | Entity type correction UI | Fix Mom's House/Amazon Ring class bugs | High | M | Data quality |
| 22 | Open loops dashboard | Know what needs clarification | Medium | M | Continuity |
| 23 | Timeline gap prompts | Improve archive completeness | Medium | M | Retention |
| 24 | Relationship drift signals | Preserve important ties | High | L | Emotional moat |
| 25 | Revealed self panel improvements | Show actual priorities | High | M | Differentiator |
| 26 | Epiphany confirmation loop | Safe insight surfacing | High | L | Differentiator |
| 27 | Contradiction mirror | Truth and self-awareness | High | L | Differentiator |
| 28 | Decision history | Use past to decide now | High | L | Daily utility |
| 29 | "How do you know?" button | Fast trust inspection | Medium | M | Trust |
| 30 | Search result story cards | Search returns meaning, not snippets | Medium | M | UX |
| 31 | Source density indicators | Show memory quality | Medium | S | Trust |
| 32 | Sensitive memory controls | User governs disclosure | High | L | Trust |
| 33 | Exportable story packets | Portability and sharing | Medium | L | Growth |
| 34 | Legacy export | Long-term value | Medium | L | Moat |
| 35 | File-to-memory review | External context becomes evidence | Medium | L | Capture |
| 36 | Voice capture | Lower friction for journaling | High | L | Habit |
| 37 | Mobile quick capture | Capture life in the moment | Very high | XL | Growth |
| 38 | Return-to-thread greeting | Feels continuous | Medium | S | Retention |
| 39 | Context breadcrumbs | See why answer personalized | Medium | M | Trust |
| 40 | Character influence view | See who shaped arcs | Medium | L | Biography |
| 41 | Project decision log | Preserve tradeoffs | High | M | Project value |
| 42 | Year-in-review | Shareable personal value | High | L | Retention |
| 43 | "What did I outgrow?" | Growth insight | High | L | Differentiator |
| 44 | "Who mattered this month?" | Social reflection | Medium | M | Retention |
| 45 | Memory health dashboard | One trust surface | Medium | M | Consolidation |
| 46 | Redacted sharing | Safe collaboration | Medium | XL | Growth |
| 47 | User voice model for biography | Better writing | Medium | L | Delight |
| 48 | Import old journals/chats | Seed graph | High | XL | Activation |
| 49 | Onboarding memory seed | First-session value | Very high | M | Activation |
| 50 | Personal AI memory API | Platform expansion | Very high | XL | Endgame |

## The Next 20 Things To Delete

Be ruthless. Deletion means remove, collapse, hide, or demote.

| Rank | Delete / collapse | Why |
|---:|---|---|
| 1 | Duplicate recall routers | Users need one reliable recall path |
| 2 | Any new regex-only intent branch | Adds brittleness without product value |
| 3 | Diagnostic surfaces as user-facing tabs | Most users need one Memory Health surface |
| 4 | Internal engineering panels in Discovery | Exposes implementation, not user value |
| 5 | Raw unordered character lists | Replace with story roster and people groups |
| 6 | Orphan character cards | A person without evidence should be flagged or hidden |
| 7 | Auto-merge of same-name people | Trust-fatal for family/scene collisions |
| 8 | Generic therapist-style fallback language | Makes memory failures feel evasive |
| 9 | "I don't have a clear record" before fallback retrieval | Causes false negatives |
| 10 | Stored scores with no freshness state | Creates silent drift |
| 11 | Separate weak relationship summaries | Fold into Character/Relationship pages |
| 12 | Duplicate "What AI Knows" variants | Collapse into Memory Health |
| 13 | Low-value Discovery panels | Hide until backed by meaningful data |
| 14 | Generic mood dashboards | Users care about meaning, not shallow metrics |
| 15 | UI cards created before evidence linking | Creates "exists but no story" failures |
| 16 | Public/social memory concepts | Off-mission and trust-risky |
| 17 | Overly philosophical card-creation answers | Replace with exact verification |
| 18 | Unscoped project memory | Sensitive context must have boundaries |
| 19 | Biography blobs without evidence review | Creepy and untrustworthy |
| 20 | Any feature that cannot answer "how do you know?" | Violates the product promise |

## 12-Month Roadmap

### Months 1-2: Trust And Recall Bar

Goal: a user can ask about any remembered person, place, event, or project and get a sourced answer or an honest gap.

Ship:

- Source-backed recall answers.
- One Memory Health surface.
- Correction workflow.
- Entity type correction.
- Duplicate person resolver.
- Private/no-memory chat.
- "How do you know?" affordance.

Success metrics:

- Memory-grounded response source coverage above 90%.
- False "no record" complaints down 70%.
- Entity misclassification correction loop used successfully.
- User trust rating improves.

### Months 3-4: Threads And Search

Goal: LoreBook feels easy to return to.

Ship:

- Threads V3 metadata.
- Thread summaries and memory deltas.
- Unified semantic search.
- Return-to-thread continuity.
- Branching with memory rules.
- Open-loop tracking.

Success metrics:

- Search success rate.
- Return-to-thread continuation rate.
- Thread summary satisfaction.
- Branch recovery after weak answer.

### Months 5-6: Characters And Relationships

Goal: people become living models, not cards.

Ship:

- Character Pages V3 baseline.
- Major scenes.
- Relationship timeline.
- Influence view.
- Conflict/open-loop cards.
- Relationship story coverage.

Success metrics:

- "Who is X?" satisfaction.
- Character orphan rate.
- Relationship page revisits.
- Merge suggestion precision.

### Months 7-8: Projects And Weekly Habit

Goal: LoreBook becomes useful every week.

Ship:

- Project Memory V3 baseline.
- Project timelines.
- Decision logs.
- Weekly life digest.
- "What changed since last time?"
- Project open loops.

Success metrics:

- Weekly active users.
- Digest opens.
- Project return rate.
- Decision recall usage.

### Months 9-10: Biography And Self-Discovery

Goal: memory turns into source-backed story.

Ship:

- Biography evidence review.
- Chapter outline.
- Scene selection.
- Chapter draft.
- Growth view.
- Contradiction mirror v1.
- Epiphany confirmation loop v1.

Success metrics:

- Chapter generation.
- Thesis confirmation.
- Evidence review completion.
- "Feels true" rating.
- Correction rate that improves drafts.

### Months 11-12: Scale, Import, And Distribution

Goal: expand acquisition while protecting trust.

Ship:

- Onboarding memory seed.
- Import old journals/chats.
- Mobile quick capture plan or beta.
- Redacted story packets.
- Year-in-review.
- Legacy export v1.
- Performance/scaling hardening for 1M-user path.

Success metrics:

- Activation rate.
- Import completion.
- Week-4 retention.
- Export usage.
- Referral or sharing from redacted packets.

## Product Loops

### Daily Loop

Capture something in chat, voice, or quick note. LoreBook responds usefully and extracts candidate memory.

### Weekly Loop

Digest: what changed, who mattered, what projects moved, what remains open.

### Monthly Loop

Relationship/project/chapter review.

### Annual Loop

Year-in-review and biography chapter generation.

### Life Loop

The user's archive becomes the trusted source of their story.

## Business And Growth Strategy

### Activation

First session must produce one useful memory artifact:

- a person page
- a project brief
- a year seed
- a biography seed
- an imported memory cluster

### Retention

Retention comes from compounding:

- weekly digests
- returning threads
- improving character pages
- project continuity
- biography progress

### Monetization

The user must be the customer. Do not monetize psyche data.

Likely premium:

- larger archive/imports
- advanced biography export
- legacy/family archive
- private memory API
- project memory
- voice/multimodal capture

### Trust Positioning

Message:

> LoreBook remembers your life with sources, corrections, and privacy controls.

Avoid:

- "AI therapist"
- "AI friend that knows everything"
- "personality diagnosis"
- "social memory"

## 1 Million User Requirements

Product requirements:

- Obvious first-session value.
- Search that works.
- Private mode.
- Correctable memory.
- Exportable value.
- Weekly return loop.

Trust requirements:

- Provenance.
- Deletion semantics.
- Sensitivity controls.
- No hidden memory.
- No unsupported life claims.

Operational requirements:

- Bounded working-memory assembly.
- Incremental consolidation.
- Per-user graph isolation.
- Cache invalidation tied to graph versions.
- Import pipeline.
- Memory health telemetry.

## North Star

The best version of LoreBook becomes the place a person goes to remember, understand, correct, write, and preserve their life. One million users will not come from novelty. They will come from the first product that makes personal memory feel reliable, useful, and safe.

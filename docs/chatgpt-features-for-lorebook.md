# ChatGPT Features To Adapt For LoreBook

Date: 2026-06-15

This document converts high-value ChatGPT interaction patterns into LoreBook-specific feature proposals. The goal is not to clone ChatGPT. The goal is to build the best autobiographical AI product.

Priority scale:

- P0: build immediately
- P1: build soon
- P2: build after core trust loop is stable
- P3: consider later

Complexity scale:

- S: small
- M: medium
- L: large
- XL: platform-level

## Feature Matrix

| Feature | User Value | LoreBook Adaptation | Complexity | Priority |
|---|---|---|---:|---:|
| Conversation search | Recover old context | Search messages, memories, people, places, timeline, files, corrections | M | P0 |
| Thread summaries | Understand long chats fast | Auto-summary with entities, dates, unresolved questions, memory changes | M | P0 |
| Message editing | Correct bad input | Edit with memory correction event and source versioning | L | P0 |
| Regenerate with modes | Recover weak answers | Retry as factual, compassionate, evidence-only, biography, challenge | M | P0 |
| Conversation branching | Explore safely | Branch from message with lineage and memory isolation controls | M | P0 |
| Memory citations | Trust answers | Every life claim links to source evidence and confidence | L | P0 |
| Evidence inspection | Debug AI memory | Source drawer with exact snippets, truth state, affected nodes | L | P0 |
| Thread bookmarks | Save important moments | Bookmark message, memory, or timeline implication | S | P1 |
| Pinned memories | Keep core truths available | User-pinned facts with top-of-mind status | M | P1 |
| Conversation tags | Organize by theme | Auto/manual tags: relationship, career, grief, identity, health | M | P1 |
| Thread folders/projects | Organize long-running life domains | Life Projects: Career, Family, Love, Health, LoreBook, Grief | L | P1 |
| Project-only memory | Contain sensitive context | Scoped memory areas that do not leak into other domains | XL | P1 |
| Archived conversations | Reduce clutter | Hide from default sidebar but keep in memory if allowed | S | P1 |
| Temporary/private chat | Safe disclosure | Chat that does not create memories unless explicitly saved | M | P1 |
| Smart thread naming | Reduce clerical work | Title plus life-domain subtitle and confidence | M | P1 |
| Cross-thread recall | Cumulative intelligence | Retrieve related conversations with visible source links | L | P1 |
| Jump to referenced memory | Close trust loop | Click a cited claim and open source object | M | P1 |
| Conversation timeline | See life chronology | Show thread events on a time axis | L | P1 |
| Context breadcrumbs | Know why answer is personalized | Thread, people, arc, active memories, confidence | M | P1 |
| Suggested next actions | Make chat productive | Confirm memory, refine timeline, branch, ask about person | S | P1 |
| File upload review | Turn uploads into memory | Extract candidate facts/events, require review for high-impact claims | L | P1 |
| Conversation export | Portability | Export thread, sources, memory changes, biography snippets | M | P2 |
| Conversation sharing | Controlled collaboration | Share redacted timeline/story packet, not raw private chat by default | XL | P2 |
| Memory relevance feedback | Improve retrieval | Mark memory/source as useful, wrong, outdated, too sensitive | M | P2 |
| Memory history | Trust over time | View prior versions and restore old memory summary | L | P2 |
| Daily/weekly life digest | Retention | "What changed this week?" with memories, themes, people, arcs | L | P2 |
| Voice reflection | Low friction capture | Record thought, transcribe, classify, ask follow-up | L | P2 |
| Agentic cleanup | Productivity | "Clean up these duplicate memories" with approval queue | XL | P3 |
| Public sharing gallery | Growth | Share polished memoir excerpts only, never raw memory by default | L | P3 |
| Social feed | Engagement | Not aligned. Risks privacy and shallow behavior | XL | Never |

## Top 10 Features To Build Immediately

1. Memory citations on every life-grounded answer.
2. Evidence inspection drawer.
3. Message correction loop with source versioning.
4. Thread summaries with memory delta.
5. Conversation branching with lineage.
6. Unified semantic search across chat, memory, timeline, people, files.
7. Suggested action chips after assistant replies.
8. Smart thread titles plus life-domain subtitles.
9. Context breadcrumbs on personalized replies.
10. Temporary/private chat mode that does not write to memory by default.

## Top 10 Features To Never Build

1. Public social feed of personal memories.
2. Auto-posting life updates to external networks.
3. Gamified streaks that pressure emotional disclosure.
4. AI-generated claims with no evidence inspection.
5. Uneditable hidden memory.
6. Forced mood scoring on every message.
7. Leaderboards, rankings, or comparative life scores.
8. Dark-pattern "memory full" upgrade pressure.
9. Default public sharing of raw conversations.
10. Personality diagnosis labels presented as facts.

## Top 10 Features Most Likely To Create User Delight

1. "I found the exact conversation where you said this."
2. A beautiful life chapter generated from verified memories.
3. Relationship timeline for a person the user cares about.
4. "What changed since last time?" on returning to a thread.
5. Clickable memory evidence under every meaningful claim.
6. Auto-created thread title that captures the emotional truth.
7. Branching into "gentle", "direct", and "biography" versions.
8. Weekly life digest with themes, people, and unresolved questions.
9. A "who is this person in my life?" answer with sources.
10. A correction that visibly updates the timeline and biography.

## Top 10 Features Most Likely To Increase Retention

1. Weekly memory digest.
2. Cross-thread recall that gets better over time.
3. Relationship pages that improve with each conversation.
4. Timeline gaps surfaced as gentle prompts.
5. Life projects for long-running domains.
6. Search that finds old conversations by meaning.
7. Biography drafts that update from new memories.
8. Memory review queue for trust maintenance.
9. Return-to-thread greetings with real continuity.
10. Personal analytics that produce useful questions, not vanity scores.

## Implementation Sequence

### Phase 1: Trust Loop

- Memory citations.
- Evidence drawer.
- Correction loop.
- Unified search.
- Temporary chat.

### Phase 2: Thread Intelligence

- Thread summaries.
- Branching lineage.
- Thread bookmarks.
- Smart categories and tags.
- Pinned threads.

### Phase 3: Life Projects

- Project/folder model.
- Project-only memory.
- Per-project files/instructions.
- Project timeline view.

### Phase 4: Biography Engine Integration

- Thread-to-chapter conversion.
- Source-backed biography paragraphs.
- Life chapter diff.
- Exportable memoir packets.

### Phase 5: Proactive Life OS

- Weekly digest.
- Gap prompts.
- Relationship check-ins.
- Memory hygiene agent with approvals.


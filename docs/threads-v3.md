# Threads V3

Date: 2026-06-15

Purpose: define the best thread system for LoreBook once graph memory, episodes, projects, biographies, revealed preferences, and trust architecture exist. This is a product specification for the thread experience, not a redesign of the graph.

## Thesis

A LoreBook thread is not a chat log. It is an autobiographical workspace: a bounded context where the user thinks through a person, scene, project, decision, memory, or chapter of life.

The best thread system answers three questions before the user even opens it:

1. What was this conversation for?
2. What did LoreBook learn or change?
3. What unresolved life context remains?

## Thread Object V3

Every thread should have:

- `title`: short human name.
- `subtitle`: life domain or project.
- `purpose`: why this thread exists.
- `summary`: what was discussed.
- `memory_delta`: memories, entities, events, corrections, preferences, and biography artifacts created or changed.
- `anchors`: people, places, organizations, projects, themes, chapters, arcs.
- `time_span_discussed`: life dates referenced.
- `source_density`: how evidence-backed the thread is.
- `open_loops`: unresolved questions, ambiguities, missing dates, identity conflicts.
- `privacy_mode`: global, project, project-only, private, no-memory.
- `branch_lineage`: parent thread/message and reason for branching.
- `state`: active, pinned, archived, private, review-needed.
- `last_meaningful_change`: not just last message, but last memory/graph change.

## Before Opening A Thread

The thread list should show more than title and timestamp:

- Title and life-domain subtitle.
- People and projects involved.
- One-line summary.
- Memory delta badge: "3 memories, 1 correction, 2 open questions."
- Privacy badge.
- Source-density indicator.
- "Changed since last visit" preview.

Examples:

- `Tía Grace's House` — Family / LoreBook origin scene. `4 people · 1 scene · 1 open ambiguity`
- `Amazon Hiring Process` — Career project. `7 events · 2 decisions · updated yesterday`
- `Ashley After Club Metro` — Love & Relationships. `relationship story · closed arc`

## While Chatting

The composer stays simple. The thread context is quietly active.

### Context Rail

Optional, collapsible rail:

- Current thread purpose.
- Active anchors.
- Retrieved memories.
- Newly detected entities.
- Open questions.
- Memory mode.

Default is clean. One click reveals "why this answer is personalized."

### Reply Modes

Threads should support explicit response modes:

- `Recall`: facts and sources.
- `Reflect`: grounded interpretation.
- `Biography`: narrative prose from evidence.
- `Correct`: fix memory/timeline/entity.
- `Plan`: future action.
- `Archivist`: conservative evidence-only.
- `Challenge`: gently question a belief or pattern.

Mode should be visible when it changes. The system should not slip from recall into therapy-like reflection without signaling it.

### Automatic Behaviors

During the conversation, LoreBook should:

- Detect entities and anchors.
- Pull current thread, project, graph neighborhood, and relevant episodes.
- Show subtle retrieval stage text for memory-heavy answers.
- Capture candidate memory deltas.
- Detect ambiguous entities and ask disambiguation only when needed.
- Flag contradictions instead of silently resolving them.
- Offer action chips after meaningful turns:
  - "Save as memory"
  - "Correct this"
  - "Add to timeline"
  - "Open character page"
  - "Branch this interpretation"
  - "Use in biography"

## After Leaving A Thread

When the user leaves, LoreBook should run a lightweight closeout:

- Generate or update summary.
- Record memory delta.
- Attach evidence to created claims.
- Update anchors and project links.
- Create open-loop prompts.
- Update biography candidates.
- Mark thread source density.
- Queue follow-up consolidation if the thread was emotionally or narratively significant.

The thread should become an artifact, not a transcript dump.

## Thread Views

### Recent

Default operational view. Sorted by recent meaningful activity.

### Pinned

Long-lived threads the user keeps returning to: active projects, family questions, biography chapters.

### Life Projects

Threads grouped under projects like LoreBook, Amazon, Family, Robotics, Health, Love.

### People

Threads grouped by primary person. Useful for "everything about Ashley" or "all Tío Juan threads."

### Timeline

Threads arranged by the life period discussed, not the chat date. A conversation today about childhood belongs in childhood.

### Unresolved

Threads with missing facts, contradictions, entity conflicts, or unanswered clarifying questions.

### Private

Threads excluded from global memory unless explicitly saved.

## Branching

Branches are essential because life interpretation is not linear.

Branch types:

- `Alternative interpretation`
- `Correction branch`
- `Biography draft`
- `Planning branch`
- `Private branch`
- `Evidence-only branch`

Every branch keeps:

- Parent thread.
- Parent message.
- Divergence reason.
- Memory inheritance rule.
- Whether branch outputs can affect global memory.

## Thread Memory Rules

Threads must avoid contaminating the life graph accidentally:

- Global threads can update global memory.
- Project threads prioritize project memory.
- Project-only threads do not leak outside the project.
- Private threads do not write memory unless user approves.
- Branches inherit memory read access but do not inherit write permission automatically.
- Speculative reflection never becomes fact without confirmation.

## Best-In-Class Thread Moments

- "Since you last opened this, LoreBook linked Ashley to the Club Metro night."
- "This thread created a new open question: are Juan and Tío Juan the same person?"
- "This is a private branch; nothing here will update memory unless you save it."
- "This conversation changed your Amazon project timeline."
- "You have three threads about Tía Grace's house. Merge their scene evidence?"

## Success Metrics

- Return-to-thread continuation rate.
- Thread search success rate.
- Percentage of memory-grounded threads with source density above threshold.
- Correction-to-resolution rate.
- Branch usage after weak answers.
- Private mode usage and trust rating.
- User-reported "I found the conversation I needed."

## Non-Goals

- Do not turn threads into a file tree users must manage.
- Do not expose every graph operation.
- Do not make thread creation require choosing a category.
- Do not make private mode scary or technical.
- Do not let speculative branches silently update biography.

## Product Principle

A thread should feel as easy as ChatGPT, but leave behind something much more valuable: an evidence-backed, correctable piece of the user's life record.

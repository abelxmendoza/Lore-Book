# LoreKeeper Core Constitution v1

**Phase 3: The Sensemaking Contract Layer**

---

## Core Principle

**"No system may consume memory without declaring how it interprets truth."**

This is the missing layer that turns LoreKeeper from a brilliant engine into a governable epistemic OS.

---

## Hard Rules (Non-Negotiable)

These rules are locked in and cannot be overridden:

1. **No consumer without a contract** - Every system that accesses memory must declare a Sensemaking Contract
2. **No belief promotion, ever** - `allow_belief_to_fact` must always be `false`
3. **Inference must be labeled** - All inferences must be labeled as HYPOTHESIS, INSIGHT, or SUGGESTION
4. **Uncertainty must surface, not hide** - Contracts must explicitly require uncertainty labeling
5. **Contracts are system-owned, not LLM-owned** - Contracts cannot be modified by LLMs or user prompts

---

## Architecture Hierarchy

```
Conversation (Chat) - Source of Truth
   ↓
Memory Graph (Canonical State) - Structured, time-aware
   ↓
Sensemaking Contract - Epistemic Rules
   ↓
Filtered, Typed, Safe View
```

**Chat is upstream of everything.**

---

## The Four Simultaneous Processes

Every chat message participates in:

1. **Truth-Seeking (Epistemic Layer)**
   - Is this first-hand or second-hand?
   - Is this belief stable or provisional?
   - Does this contradict earlier claims?
   - Nothing is assumed true just because it's said once.

2. **Memory Structuring (Ontology Layer)**
   - Decomposes chat into: memories, perceptions, reactions, decisions, claims, revisions
   - Prevents duplication, belief ossification, narrative drift

3. **Contradiction & Duplication Handling**
   - Does not overwrite, delete, or collapse contradictions prematurely
   - Tracks parallel beliefs, belief lifespans, confidence decay, reconciliation moments
   - **Contradiction is treated as data, not error.**

4. **Narrative Compilation (Presentation Layer)**
   - Biographies, timelines, profiles are compiled artifacts, not the memory itself

---

## Sensemaking Contracts

A Sensemaking Contract is a formal declaration of epistemic rules that govern how a system may consume memory.

### Contract Components

- **Allowed Knowledge Types**: EXPERIENCE, FEELING, BELIEF, FACT, DECISION, QUESTION
- **Disallowed Knowledge Types**: Explicitly forbidden types
- **Minimum Confidence**: Threshold for memory access (0.0 - 1.0)
- **Contradiction Policy**: ALLOW_PARALLEL, FILTER_UNSTABLE, REQUIRE_RESOLUTION
- **Temporal Scope**: ALL_TIME, RECENT_ONLY, EXPLICIT_RANGE
- **Promotion Rules**: Whether inference is allowed and how it's labeled
- **Output Constraints**: Requirements for uncertainty labeling, source citation, contradiction surfacing

### Built-in Contracts

1. **Archivist Contract**
   - Purpose: Strict factual recall only
   - Allowed: EXPERIENCE, FACT
   - Disallowed: BELIEF, FEELING, DECISION, QUESTION
   - No interpretation, no advice, no synthesis beyond listing

2. **Analyst Contract**
   - Purpose: Pattern observation without prescription
   - Allowed: EXPERIENCE only
   - Disallowed: BELIEF, FEELING, FACT, DECISION, QUESTION
   - Powers pattern summaries, trend detection, continuity intelligence
   - Still no advice

3. **Reflector Contract**
   - Purpose: Help user see themselves, not change themselves
   - Allowed: EXPERIENCE, FEELING, BELIEF
   - Disallowed: FACT, DECISION, QUESTION
   - Enables identity mirrors, emotional reflection, narrative coherence without authority

---

## Design Rules (Locked In)

### Rule 1: Chat never edits views directly

Chat only:
- adds evidence
- refines confidence
- introduces revisions
- triggers questions

**Views update because memory changed, not because chat "edited a bio."**

### Rule 2: Contradictions are preserved, not resolved early

Example:
- "I hated robotics"
- "Actually I always loved building"
- "I think I hated the environment, not the work"

**All three coexist, time-bound.**

### Rule 3: Truth is negotiated, not declared

The system may ask:
- "Do you still believe this?"
- "Was this later disproven?"
- "Does this feel accurate now?"

Never:
- "This is false"
- "You were wrong"

### Rule 4: Biographies are queries, not files

A biography is just:
- a filtered traversal over structured memory

That's why you can generate:
- fight-only bios
- robotics-only bios
- love-life bios
- different tones, audiences, eras

**From the same corpus.**

### Rule 5: Lorebooks never modify memory

**A Lorebook can never modify memory.**
**Only chat and engines can.**

**Lorebooks are readers, not writers.**

---

## What This Enables (Safely)

Only after this layer:

- **Strategist Persona (Phase 4)** - Because assumptions must be labeled, advice can be gated, refusal is legitimate
- **Narrative Diffing** - Because belief evolution is tracked, revisions are explicit, no retroactive rewriting
- **External Exports** - Because consumers can see epistemic boundaries, claims are typed, uncertainty is visible

---

## Why This Is the Right Moment

You already have:
- knowledge typing
- confidence tracking
- symbol resolution
- recall eligibility rules

The SCL does not add intelligence.
**It adds governance.**

That's exactly what mature systems need next.

---

## Final Framing

**Phase 1**: Memory existed
**Phase 2**: Memory became epistemically safe
**Phase 3**: Memory becomes governable

This is the step that ensures LoreKeeper never betrays its own philosophy as it grows.

---

**Mental model locked in.**
**Architecture aligned.**
**Ready for the future.**


# Sensemaking Contracts Reference Table

**Phase 3: The Sensemaking Contract Layer**

This table provides a quick reference for all available Sensemaking Contracts in LoreKeeper.

---

## Contract Comparison

| Contract | Purpose | Allowed Types | Disallowed Types | Min Confidence | Contradiction Policy | Inference | Use Cases |
|----------|---------|--------------|------------------|----------------|---------------------|-----------|-----------|
| **Archivist** | Strict factual recall | EXPERIENCE, FACT | BELIEF, FEELING, DECISION, QUESTION | 0.5 | ALLOW_PARALLEL | ❌ No | Factual queries, historical lookup, source verification |
| **Analyst** | Pattern observation | EXPERIENCE | BELIEF, FEELING, FACT, DECISION, QUESTION | 0.6 | FILTER_UNSTABLE | ✅ Yes (INSIGHT) | Pattern summaries, trend detection, continuity intelligence |
| **Reflector** | Self-reflection | EXPERIENCE, FEELING, BELIEF | FACT, DECISION, QUESTION | 0.4 | ALLOW_PARALLEL | ✅ Yes (REFLECTION) | Identity mirrors, emotional reflection, narrative coherence |

---

## Detailed Contract Specifications

### Archivist Contract

**ID**: `archivist`

**Description**: Strict factual recall. No interpretation, no advice, no synthesis beyond listing.

**Knowledge Types**:
- ✅ **Allowed**: EXPERIENCE, FACT
- ❌ **Disallowed**: BELIEF, FEELING, DECISION, QUESTION

**Confidence Threshold**: 0.5

**Contradiction Policy**: `ALLOW_PARALLEL`
- Keeps all contradictions visible
- Does not filter or resolve

**Promotion Rules**:
- `allow_belief_to_fact`: `false` (hard rule)
- `allow_inference`: `false`
- `inference_label`: N/A

**Output Constraints**:
- ✅ Must label uncertainty
- ✅ Must cite sources
- ✅ Must surface contradictions

**Example Use Cases**:
- "What happened on March 15th?"
- "Show me all entries about Sarah"
- "What are the facts about my job?"

---

### Analyst Contract

**ID**: `analyst`

**Description**: Pattern observation without prescription. Identifies trends and patterns, but never gives advice.

**Knowledge Types**:
- ✅ **Allowed**: EXPERIENCE
- ❌ **Disallowed**: BELIEF, FEELING, FACT, DECISION, QUESTION

**Confidence Threshold**: 0.6

**Contradiction Policy**: `FILTER_UNSTABLE`
- Filters out low-confidence contradictory units
- Only shows stable patterns

**Promotion Rules**:
- `allow_belief_to_fact`: `false` (hard rule)
- `allow_inference`: `true`
- `inference_label`: `INSIGHT`

**Output Constraints**:
- ✅ Must label uncertainty
- ✅ Must cite sources
- ✅ Must surface contradictions

**Example Use Cases**:
- "What patterns do you see in my work?"
- "How has my mood changed over time?"
- "What trends are emerging in my relationships?"

---

### Reflector Contract

**ID**: `reflector`

**Description**: Helps you see yourself. Shows your experiences, feelings, and beliefs without judgment or advice.

**Knowledge Types**:
- ✅ **Allowed**: EXPERIENCE, FEELING, BELIEF
- ❌ **Disallowed**: FACT, DECISION, QUESTION

**Confidence Threshold**: 0.4

**Contradiction Policy**: `ALLOW_PARALLEL`
- Keeps all contradictions visible
- Shows complexity without judgment

**Promotion Rules**:
- `allow_belief_to_fact`: `false` (hard rule)
- `allow_inference`: `true`
- `inference_label`: `REFLECTION`

**Output Constraints**:
- ✅ Must label uncertainty
- ❌ Must cite sources: `false`
- ❌ Must surface contradictions: `false`

**Example Use Cases**:
- "How do I feel about this?"
- "What do I believe about myself?"
- "Show me my emotional journey"

---

## Contract Selection Guide

### When to Use Archivist
- You need factual, verifiable information
- You want to see all contradictions
- You need source citations
- You don't want interpretation or advice

### When to Use Analyst
- You want to identify patterns and trends
- You need insights but not advice
- You want stable, high-confidence observations
- You're looking for continuity intelligence

### When to Use Reflector
- You want to understand yourself better
- You need emotional and belief context
- You want to see complexity without judgment
- You're exploring identity and self-awareness

---

## Hard Rules (All Contracts)

These rules apply to ALL contracts and cannot be overridden:

1. **`allow_belief_to_fact` must always be `false`**
   - Beliefs can never be promoted to facts
   - This is a core epistemic principle

2. **Minimum confidence must be between 0.0 and 1.0**
   - Contracts must specify a valid confidence threshold

3. **Allowed and disallowed types must not overlap**
   - A knowledge type cannot be both allowed and disallowed

4. **Contracts are system-owned**
   - Contracts cannot be modified by LLMs
   - Contracts cannot be modified by user prompts
   - Only system code can define contracts

---

## Implementation Notes

- Contracts are enforced at the memory access layer
- All memory retrieval goes through contract filtering
- Personas bind to contracts (personas are views, not agents)
- Contract violations are logged but do not block access (fail-safe)

---

## Future Contracts (Planned)

- **Strategist Contract** (Phase 4)
  - Purpose: Goal-oriented planning with explicit assumption labeling
  - Will require Phase 3 infrastructure

- **Narrator Contract**
  - Purpose: Story compilation with temporal awareness
  - Will use belief evolution tracking

---

**Last Updated**: Phase 3 Implementation
**Status**: Active


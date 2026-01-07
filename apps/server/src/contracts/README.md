# Sensemaking Contract Layer (SCL)

**Phase 3: The Sensemaking Contract Layer**

## Core Principle

**"No system may consume memory without declaring how it interprets truth."**

This layer sits between compiled memory (LNC) and anything that reasons, reflects, analyzes, or advises.

---

## Architecture

```
Compiled Memory (EntryIR)
   ↓
Contract Enforcer (The Gate)
   ↓
Constrained Memory View
   ↓
Downstream Systems (Reasoning, Reflection, Analysis, Advice)
```

**Rule: No system touches memory without passing through this.**

---

## Usage Example

```typescript
import { contractEnforcer } from './contractEnforcer';
import { ARCHIVIST_CONTRACT } from './sensemakingContract';
import type { EntryIR } from '../services/compiler/types';

// Get compiled entries (from LNC)
const compiledEntries: EntryIR[] = await getCompiledEntries(userId);

// Apply contract
const memoryView = contractEnforcer.apply(
  ARCHIVIST_CONTRACT,
  compiledEntries
);

// Downstream systems only see memoryView.entries
// They cannot access unfiltered memory
```

---

## Built-in Contracts

### Archivist Contract
- **Purpose**: Pure Recall
- **Allowed**: EXPERIENCE, FACT
- **Min Confidence**: 0.5
- **Inference**: Not allowed
- **Use Case**: Factual queries, historical lookup

### Analyst Contract
- **Purpose**: Patterns, Not Opinions
- **Allowed**: EXPERIENCE
- **Min Confidence**: 0.6
- **Inference**: Allowed (labeled as INSIGHT)
- **Use Case**: Pattern detection, trend analysis

### Reflector Contract
- **Purpose**: Identity Mirror
- **Allowed**: EXPERIENCE, FEELING, BELIEF
- **Min Confidence**: 0.3
- **Inference**: Allowed (labeled as REFLECTION)
- **Use Case**: Self-reflection, identity exploration

---

## Why This Matters

**The Problem**: Even perfectly typed, epistemically clean memory can be misused.

**Example (without SCL)**:
- User says: "I felt ignored at work last year."
- System uses that BELIEF, mixes it with EXPERIENCE, runs analytics, generates advice
- System treats it like a stable fact
- **Result**: Belief laundering into strategy

**What SCL Fixes**:
- Forces every system to answer: "What am I allowed to do with this memory?"
- Before it sees anything
- Boundaries are code, not conventions
- No accidental overreach
- No silent epistemic corruption

---

## One Sentence Summary

**LNC makes memory honest. SCL makes intelligence honest.**

You cannot have safe strategy, planning, or insight without this layer.


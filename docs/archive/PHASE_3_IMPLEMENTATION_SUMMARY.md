# Phase 3 Implementation Summary: Sensemaking Contract Layer (SCL)

**Status**: ✅ Complete

---

## Overview

Phase 3 implements the Sensemaking Contract Layer (SCL), the missing governance layer that ensures no system may consume memory without declaring how it interprets truth.

---

## What Was Implemented

### Backend (✅ Complete)

1. **Contract System** (`apps/server/src/contracts/`)
   - `sensemakingContract.ts` - Contract interface and built-in contracts
   - `contractResolver.ts` - Contract resolution and filtering
   - `memoryViewBuilder.ts` - Builds filtered memory views based on contracts
   - `contractAwareMemoryRetriever.ts` - Contract-aware memory retrieval

2. **Built-in Contracts**
   - **Archivist Contract**: Strict factual recall (EXPERIENCE, FACT only)
   - **Analyst Contract**: Pattern observation (EXPERIENCE only, allows inference)
   - **Reflector Contract**: Self-reflection (EXPERIENCE, FEELING, BELIEF)

3. **Integration**
   - Updated `personaController.ts` to use contracts
   - Personas now bind to contracts (personas are views, not agents)

### Frontend (✅ Complete)

1. **Contract Badge Component** (`apps/web/src/components/chat/ContractBadge.tsx`)
   - Displays active contract with tooltip
   - Shows capabilities and limitations
   - Interactive hover/click tooltip

### Documentation (✅ Complete)

1. **LoreKeeper Core Constitution v1** (`LOREKEEPER_CORE_CONSTITUTION.md`)
   - Hard rules (non-negotiable)
   - Architecture hierarchy
   - Design rules (locked in)
   - What this enables

2. **Sensemaking Contracts Table** (`SENSEMAKING_CONTRACTS_TABLE.md`)
   - Quick reference for all contracts
   - Detailed specifications
   - Contract selection guide
   - Implementation notes

---

## Architecture

```
Memory Graph (Canonical State)
   ↓
Sensemaking Contract (Epistemic Rules)
   ↓
Contract Resolver (Applies Filters)
   ↓
Memory View Builder (Builds Safe Views)
   ↓
Filtered, Typed, Safe Memory View
```

---

## Hard Rules (Locked In)

1. **No consumer without a contract** - Every system must declare a contract
2. **No belief promotion, ever** - `allow_belief_to_fact` must always be `false`
3. **Inference must be labeled** - All inferences labeled as HYPOTHESIS, INSIGHT, or SUGGESTION
4. **Uncertainty must surface** - Contracts require uncertainty labeling
5. **Contracts are system-owned** - Cannot be modified by LLMs or user prompts

---

## Contract Specifications

### Archivist Contract
- **Purpose**: Strict factual recall
- **Allowed**: EXPERIENCE, FACT
- **Disallowed**: BELIEF, FEELING, DECISION, QUESTION
- **Min Confidence**: 0.5
- **Contradiction Policy**: ALLOW_PARALLEL
- **Inference**: Not allowed

### Analyst Contract
- **Purpose**: Pattern observation without prescription
- **Allowed**: EXPERIENCE
- **Disallowed**: BELIEF, FEELING, FACT, DECISION, QUESTION
- **Min Confidence**: 0.6
- **Contradiction Policy**: FILTER_UNSTABLE
- **Inference**: Allowed (labeled as INSIGHT)

### Reflector Contract
- **Purpose**: Self-reflection without judgment
- **Allowed**: EXPERIENCE, FEELING, BELIEF
- **Disallowed**: FACT, DECISION, QUESTION
- **Min Confidence**: 0.4
- **Contradiction Policy**: ALLOW_PARALLEL
- **Inference**: Allowed (labeled as REFLECTION)

---

## Integration Points

### Persona Controller
- Updated to map personas to contracts
- `getContractForPersona()` function added
- Personas are now views, not agents

### Memory Retrieval
- Contract-aware retrieval available via `contractAwareMemoryRetriever`
- Existing memory retrieval unchanged (backward compatible)
- New systems should use contract-aware retrieval

---

## What This Unlocks (Safely)

Only after this layer:

- ✅ **Strategist Persona (Phase 4)** - Assumptions must be labeled, advice can be gated
- ✅ **Narrative Diffing** - Belief evolution tracked, revisions explicit
- ✅ **External Exports** - Consumers see epistemic boundaries, claims typed, uncertainty visible

---

## Next Steps

1. **Integrate Contract Badge into Chat UI**
   - Add badge to chat header or footer
   - Show active contract for each conversation
   - Allow contract switching (future)

2. **Update Chat Service to Use Contracts**
   - Pass contract ID in chat requests
   - Apply contract filtering to memory retrieval
   - Show contract in responses

3. **Add Contract Selection UI**
   - Allow users to select contract for conversations
   - Show contract capabilities/limitations
   - Persist contract choice per conversation

4. **Phase 4: Strategist Persona**
   - Design Strategist contract
   - Implement with explicit assumption labeling
   - Gate advice behind contract rules

---

## Files Created/Modified

### Created
- `apps/server/src/contracts/sensemakingContract.ts`
- `apps/server/src/contracts/contractResolver.ts`
- `apps/server/src/contracts/memoryViewBuilder.ts`
- `apps/server/src/contracts/contractAwareMemoryRetriever.ts`
- `apps/web/src/components/chat/ContractBadge.tsx`
- `LOREKEEPER_CORE_CONSTITUTION.md`
- `SENSEMAKING_CONTRACTS_TABLE.md`
- `PHASE_3_IMPLEMENTATION_SUMMARY.md`

### Modified
- `apps/server/src/services/personaController.ts` - Added contract mapping

---

## Testing Recommendations

1. **Contract Validation**
   - Test contract validation rules
   - Ensure `allow_belief_to_fact` is always false
   - Verify confidence thresholds work

2. **Memory Filtering**
   - Test each contract filters correctly
   - Verify knowledge type filtering
   - Test contradiction policies

3. **Persona Integration**
   - Test persona-to-contract mapping
   - Verify backward compatibility
   - Test contract-aware memory retrieval

4. **UI Components**
   - Test ContractBadge component
   - Verify tooltip displays correctly
   - Test responsive design

---

## Notes

- All contracts are backward compatible
- Existing memory retrieval unchanged
- New systems should use contract-aware retrieval
- Contracts are system-owned (cannot be modified by LLMs)
- Hard rules are non-negotiable

---

**Implementation Date**: Phase 3
**Status**: ✅ Complete
**Ready for**: Phase 4 (Strategist Persona)


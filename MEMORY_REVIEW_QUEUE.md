# LORE-KEEPER MEMORY REVIEW QUEUE (MRQ)

## Overview

The **Memory Review Queue (MRQ)** allows memory ingestion to feel automatic while preserving correctness, consent, and reversibility. The system automatically classifies risk levels and only requires user review for medium/high-risk memories.

## Core Principle

**Automatic ≠ Silent**

Memory flows freely unless it affects:
- Identity
- Relationships
- Intent
- Contradicts existing truth

## Data Models

### MemoryProposal
A proposed memory awaiting review:
- **Entity ID**: Which entity this claim is about
- **Claim Text**: The proposed claim
- **Perspective ID**: Which perspective this is from
- **Confidence**: Extraction confidence (0.0 - 1.0)
- **Temporal Context**: When this claim is valid
- **Source Excerpt**: Original text that led to this proposal
- **Reasoning**: Why this memory was inferred
- **Affected Claim IDs**: Existing claims this might affect
- **Risk Level**: LOW, MEDIUM, or HIGH
- **Status**: PENDING, APPROVED, REJECTED, EDITED, DEFERRED

### MemoryDecision
A decision made on a proposal:
- **Proposal ID**: Which proposal was decided
- **Decision**: APPROVE, REJECT, EDIT, or DEFER
- **Edited Text**: If edited, the new text
- **Edited Confidence**: If edited, the new confidence
- **Decided By**: USER or SYSTEM
- **Reason**: Why this decision was made

## Risk Classification

### LOW Risk
- Low confidence (< 0.6)
- No identity impact
- No contradictions with existing claims
- **Action**: Auto-approved, never surfaces in queue

### MEDIUM Risk
- High confidence (>= 0.6)
- System perspective
- **Action**: Queued for review

### HIGH Risk
- Affects identity (core values, beliefs, life-defining moments)
- Contradicts existing claims
- **Action**: Queued for review (high priority)

## Ingestion Pipeline

1. **Text Ingestion**: User provides text
2. **Entity/Claim Extraction**: System extracts entities and claims
3. **Risk Classification**: System classifies risk level
4. **Proposal Creation**: Memory proposal created
5. **Auto-Approval Check**: If LOW risk, auto-approve
6. **Queue for Review**: If MEDIUM/HIGH risk, add to queue

## User Decision Handlers

### Approve
- Commits the claim to memory
- Creates perspective claim if applicable
- Records decision
- Finalizes proposal as APPROVED

### Reject
- Does not commit claim
- Records decision with reason
- Finalizes proposal as REJECTED
- Logs rejection in continuity events

### Edit
- Commits claim with edited text/confidence
- Records decision with edits
- Finalizes proposal as EDITED

### Defer
- Keeps proposal in queue
- Updates status to DEFERRED
- Can be reviewed later

## API Endpoints

### GET `/api/mrq/pending`
Get pending memory review queue items, ordered by risk level (HIGH first).

**Response:**
```json
{
  "items": [
    {
      "id": "proposal-1",
      "entity_id": "entity-1",
      "claim_text": "Proposed claim text",
      "confidence": 0.8,
      "risk_level": "HIGH",
      "created_at": "2025-01-02T12:00:00Z",
      "reasoning": "Why this was inferred",
      "source_excerpt": "Original text..."
    }
  ]
}
```

### GET `/api/mrq/proposals/:id`
Get a specific proposal with full details.

**Response:**
```json
{
  "proposal": {
    "id": "proposal-1",
    "entity_id": "entity-1",
    "claim_text": "Proposed claim",
    "perspective_id": "perspective-1",
    "confidence": 0.8,
    "temporal_context": { ... },
    "source_excerpt": "...",
    "reasoning": "...",
    "affected_claim_ids": ["claim-1", "claim-2"],
    "risk_level": "HIGH",
    "status": "PENDING"
  }
}
```

### POST `/api/mrq/proposals/:id/approve`
Approve a memory proposal.

**Response:**
```json
{
  "decision": {
    "id": "decision-1",
    "proposal_id": "proposal-1",
    "decision": "APPROVE",
    "decided_by": "USER",
    "timestamp": "2025-01-02T12:00:00Z"
  },
  "success": true
}
```

### POST `/api/mrq/proposals/:id/reject`
Reject a memory proposal.

**Request:**
```json
{
  "reason": "Not accurate"
}
```

**Response:**
```json
{
  "decision": {
    "id": "decision-1",
    "proposal_id": "proposal-1",
    "decision": "REJECT",
    "decided_by": "USER",
    "reason": "Not accurate",
    "timestamp": "2025-01-02T12:00:00Z"
  },
  "success": true
}
```

### POST `/api/mrq/proposals/:id/edit`
Edit a memory proposal before approving.

**Request:**
```json
{
  "new_text": "Edited claim text",
  "new_confidence": 0.9
}
```

**Response:**
```json
{
  "decision": {
    "id": "decision-1",
    "proposal_id": "proposal-1",
    "decision": "EDIT",
    "decided_by": "USER",
    "edited_text": "Edited claim text",
    "edited_confidence": 0.9,
    "timestamp": "2025-01-02T12:00:00Z"
  },
  "success": true
}
```

### POST `/api/mrq/proposals/:id/defer`
Defer a memory proposal for later review.

**Response:**
```json
{
  "decision": {
    "id": "decision-1",
    "proposal_id": "proposal-1",
    "decision": "DEFER",
    "decided_by": "USER",
    "timestamp": "2025-01-02T12:00:00Z"
  },
  "success": true
}
```

## Integration with OMEGA MEMORY ENGINE

The MRQ is automatically integrated:

1. **Text Ingestion**: When `omegaMemoryService.ingestText()` is called, proposals are automatically created
2. **Risk Classification**: Each claim is classified for risk
3. **Auto-Approval**: Low-risk memories are auto-approved
4. **Queue Management**: Medium/high-risk memories are queued
5. **Decision Tracking**: All decisions are logged

## UI Contract

### Async Review (Never Interrupts Flow)
- MRQ is asynchronous by default
- Users can continue using the app
- Review queue accessible via sidebar or dedicated page

### Grouped by Risk Level
- HIGH risk items shown first (red)
- MEDIUM risk items shown second (amber)
- LOW risk items never shown (auto-approved)

### Proposal Display
Each proposal shows:
- **Proposed Memory**: The claim text
- **Why Inferred**: Reasoning explanation
- **What It Affects**: List of affected claims
- **Confidence**: Extraction confidence score
- **Perspective**: Which perspective this is from
- **Source Excerpt**: Original text that led to this

### Actions
- **Approve**: Accept as-is
- **Edit**: Modify text/confidence before approving
- **Reject**: Decline (logged, not erased)
- **Defer**: Review later

### Rejection Logging
- Rejections are logged in continuity events
- Not erased, preserved for audit
- Can be reviewed later

### Low-Risk Memories
- Never surface in queue by default
- Can be reviewed later if needed
- Auto-approved immediately

## Example Flow

### Low-Risk Memory (Auto-Approved)
```
1. User: "I had coffee this morning"
2. System: Extracts claim "Had coffee" (confidence: 0.5)
3. Risk Classification: LOW (no identity impact, low confidence)
4. Auto-Approval: Claim committed immediately
5. User: Never sees this in queue
```

### High-Risk Memory (Queued)
```
1. User: "I'm a parent now"
2. System: Extracts claim "Is a parent" (confidence: 0.9)
3. Risk Classification: HIGH (affects identity)
4. Queue: Added to MRQ with HIGH priority
5. User: Sees in queue, can approve/reject/edit
```

### Contradiction (Queued)
```
1. Existing: "John is a good person" (confidence: 0.8)
2. New: "John is not a good person" (confidence: 0.7)
3. Risk Classification: HIGH (contradicts existing)
4. Queue: Added to MRQ with HIGH priority
5. User: Sees contradiction, can resolve
```

## Design Principles

1. **Automatic by Default**: Low-risk memories flow automatically
2. **Consent for High-Risk**: User approval required for identity/contradictions
3. **Reversibility**: All decisions can be reviewed and reversed
4. **Transparency**: Reasoning always provided
5. **Non-Intrusive**: Never interrupts user flow

## Future Enhancements

1. **Batch Operations**: Approve/reject multiple proposals at once
2. **Smart Suggestions**: AI suggests edits for proposals
3. **Learning from Decisions**: Improve risk classification based on user decisions
4. **Priority Scoring**: More sophisticated priority calculation
5. **Notification System**: Alert users about high-priority proposals
6. **Review History**: View all past decisions
7. **Deferred Queue**: Separate view for deferred proposals

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


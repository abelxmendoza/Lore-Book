# LORE-KEEPER PERSPECTIVE-AWARE MEMORY LAYER

## Overview

The **Perspective-Aware Memory Layer** allows multiple viewpoints to coexist for the same entity, claim, or event while preserving truth-seeking. The system never collapses perspectives unless explicitly instructed.

## Core Concept

**Truth ≠ single belief**  
**Truth = set of perspectives + confidence + time**

The system preserves all perspectives, allowing users to see:
- What "Self" believes
- What "Other Person" believes
- What "System" infers
- What "Group" consensus is
- Historical perspectives
- Fictional perspectives

## Data Models

### Perspective
Represents a viewpoint or lens through which claims are made:
- **Type**: SELF, OTHER_PERSON, GROUP, SYSTEM, FICTIONAL, HISTORICAL
- **Owner Entity**: Optional entity that holds this perspective
- **Label**: Human-readable name (e.g., "Abel (self)", "Coach Felipe")
- **Reliability Modifier**: Multiplies evidence reliability (0.0 - 2.0)

### PerspectiveClaim
A claim from a specific perspective:
- **Base Claim ID**: Links to the underlying claim
- **Perspective ID**: Which perspective this is from
- **Text**: The claim text from this perspective
- **Confidence**: Confidence in this perspective's claim
- **Sentiment**: POSITIVE, NEGATIVE, NEUTRAL, MIXED
- **Temporal Context**: When this perspective held this view
- **Is Active**: Whether this perspective claim is currently active

### PerspectiveDispute
Tracks disagreements between perspectives:
- **Perspective Claim A & B**: The two conflicting claims
- **Reason**: Why they disagree
- **Resolved**: Whether the dispute has been resolved

## Key Features

### 1. Perspective-Aware Claim Ingestion
When a claim is ingested, it's automatically associated with a perspective (default: SELF).

```typescript
await perspectiveService.ingestClaimWithPerspective(
  userId,
  claim,
  perspectiveId
);
```

### 2. Contradiction Detection (Per Perspective)
The system detects contradictions between different perspectives, not within the same perspective.

```typescript
const contradictions = await perspectiveService.detectPerspectiveContradictions(
  userId,
  baseClaimId
);
```

### 3. Perspective-Aware Truth Ranking
Claims are ranked considering:
- **Recency** (25%): Time decay
- **Confidence** (25%): Original confidence
- **Evidence Count** (15%): Supporting evidence
- **Evidence Reliability** (15%): Evidence quality
- **Perspective Reliability** (20%): Perspective modifier

```typescript
const ranked = await perspectiveService.rankClaimsByPerspective(
  entityId,
  userId
);
```

### 4. Non-Collapsing Summarization
Summaries preserve all perspectives, clearly separating:
- Agreements (where perspectives align)
- Disputes (where perspectives conflict)
- Uncertainties (where perspectives are unclear)

```typescript
const summary = await perspectiveService.summarizeEntityWithPerspectives(
  entityId,
  userId
);
```

### 5. Perspective Evolution
Perspectives can evolve over time, with old versions preserved:

```typescript
const evolved = await perspectiveService.evolvePerspectiveClaim(
  userId,
  pClaimId,
  newText
);
```

## API Endpoints

### GET `/api/perspectives`
List all perspectives for the user.

**Response:**
```json
{
  "perspectives": [
    {
      "id": "perspective-1",
      "type": "SELF",
      "label": "Self",
      "reliability_modifier": 1.0
    }
  ]
}
```

### POST `/api/perspectives`
Create a new perspective.

**Request:**
```json
{
  "type": "OTHER_PERSON",
  "label": "Coach Felipe",
  "owner_entity_id": "entity-123",
  "reliability_modifier": 0.9
}
```

### POST `/api/perspectives/defaults`
Get or create default perspectives (SELF, SYSTEM).

### POST `/api/perspectives/claims`
Ingest a claim with a specific perspective.

**Request:**
```json
{
  "claim_id": "claim-123",
  "perspective_id": "perspective-1"
}
```

### GET `/api/perspectives/claims/:claimId`
Get all perspective claims for a base claim.

**Response:**
```json
{
  "perspective_claims": [
    {
      "id": "pclaim-1",
      "perspective_id": "perspective-1",
      "text": "Claim from self perspective",
      "confidence": 0.8
    },
    {
      "id": "pclaim-2",
      "perspective_id": "perspective-2",
      "text": "Claim from other perspective",
      "confidence": 0.7
    }
  ]
}
```

### GET `/api/perspectives/contradictions/:claimId`
Detect contradictions between perspectives for a claim.

**Response:**
```json
{
  "contradictions": [
    {
      "perspective_claim_a": { ... },
      "perspective_claim_b": { ... },
      "similarity_score": 0.2
    }
  ]
}
```

### GET `/api/perspectives/entities/:entityId/ranked`
Rank claims by perspective for an entity.

**Response:**
```json
{
  "ranked_claims": [
    {
      "claim_id": "claim-1",
      "perspective_id": "perspective-1",
      "perspective_label": "Self",
      "score": 0.85,
      "text": "Claim text"
    }
  ]
}
```

### GET `/api/perspectives/entities/:entityId/summary`
Get entity summary with all perspectives (non-collapsing).

**Response:**
```json
{
  "entity_id": "entity-1",
  "summary": "Multi-perspective summary...",
  "perspectives": [
    {
      "perspective_id": "perspective-1",
      "perspective_label": "Self",
      "claims": [ ... ]
    }
  ],
  "disputes": [ ... ],
  "agreements": [ ... ],
  "uncertainties": [ ... ]
}
```

### POST `/api/perspectives/claims/:claimId/evolve`
Evolve a perspective claim over time.

**Request:**
```json
{
  "new_text": "Updated claim text"
}
```

## Integration with OMEGA MEMORY ENGINE

The perspective layer is automatically integrated:

1. **Claim Ingestion**: When text is ingested, claims are automatically associated with the SELF perspective
2. **Contradiction Detection**: Perspective contradictions are detected separately from base contradictions
3. **Truth Ranking**: Perspective reliability modifiers affect truth scores
4. **Summarization**: Entity summaries preserve all perspectives

## UI Contract

### Stacked Perspectives
Claims display all perspectives stacked:
- Each perspective shown with its label
- Color-coded by perspective type
- Confidence scores visible
- Disputes highlighted

### Perspective Toggle
Users can toggle perspectives on/off:
- Show only SELF perspective
- Show only OTHER_PERSON perspectives
- Show all perspectives
- Filter by perspective type

### Dispute Visibility
Disputes are always visible, never hidden:
- Red indicators for contradictions
- Click to see dispute details
- Option to resolve disputes

### Summary Labels
System summaries clearly label perspective sources:
- "From Self perspective: ..."
- "From Coach Felipe perspective: ..."
- "System inference: ..."

### No Silent Collapse
The system never silently collapses perspectives:
- All perspectives preserved
- Evolution tracked over time
- History maintained

## Example Use Cases

### 1. Self vs. Other Perspectives
```
Base Claim: "John is a good person"

Self Perspective: "John is a good person" (confidence: 0.9)
Other Perspective (Coach Felipe): "John needs improvement" (confidence: 0.7)

Result: Both perspectives preserved, dispute detected
```

### 2. Historical Evolution
```
2020: Self perspective: "I'm not good at coding" (confidence: 0.8)
2024: Self perspective: "I'm a skilled developer" (confidence: 0.9)

Result: Both preserved, evolution tracked
```

### 3. Group Consensus
```
Base Claim: "Team performance"

Self Perspective: "We did well" (confidence: 0.7)
Group Perspective: "We exceeded expectations" (confidence: 0.9)

Result: Group perspective weighted higher due to reliability modifier
```

## Design Principles

1. **Truth = Multiple Perspectives**: Never force a single conclusion
2. **Preserve All Viewpoints**: Never collapse unless instructed
3. **Track Evolution**: Perspectives change over time
4. **Highlight Disagreements**: Make disputes visible
5. **Weight by Reliability**: Perspective modifiers affect truth scores

## Future Enhancements

1. **Perspective Inference**: Automatically infer perspectives from context
2. **Perspective Merging**: Allow users to merge similar perspectives
3. **Perspective Templates**: Pre-defined perspective types
4. **Perspective Analytics**: Statistics on perspective agreements/disputes
5. **Multi-Entity Perspectives**: Perspectives that span multiple entities
6. **Perspective Confidence Learning**: Adjust reliability modifiers based on accuracy

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


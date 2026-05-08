# OMEGA MEMORY ENGINE

## Overview

The **OMEGA MEMORY ENGINE** is a time-aware, truth-seeking knowledge system that differentiates people, characters, locations, and updates the correct entities over time. It implements the core principles of preserving truth through temporal tracking, confidence scoring, and evidence-based validation.

## Core Design Principles

1. **No claim is ever deleted** - Claims are marked inactive, preserving full history
2. **Truth = time + confidence + evidence** - Multi-factor truth ranking
3. **Entities have stable IDs** - Consistent entity resolution
4. **AI suggests, human approves** - Safe auto-update with human oversight
5. **System prefers evolution over overwrite** - Temporal tracking of changes

## Data Models

### Entity
- Represents people, characters, locations, organizations, or events
- Has stable ID, primary name, aliases, and type
- Tracks creation and update timestamps

### Claim
- Statement about an entity with temporal validity
- Has confidence score (0.0 - 1.0)
- Can be active or inactive (never deleted)
- Tracks start_time and end_time for temporal validity

### Relationship
- Connection between entities
- Has type (e.g., "coach_of", "rival_of", "located_at")
- Tracks confidence and temporal validity
- Can be active or inactive

### Evidence
- Supporting documentation for claims
- Links to source content
- Tracks timestamp and source

## Features

### 1. Ingestion Pipeline
- Extracts entities from text
- Resolves entities (finds existing or creates new)
- Extracts claims about entities
- Detects conflicts with existing claims
- Marks conflicting claims inactive
- Extracts relationships between entities
- Generates update suggestions (requires approval)

### 2. Conflict Detection
- Detects semantic opposites
- Marks conflicting claims inactive
- Lowers confidence of conflicting claims
- Preserves full history

### 3. Truth Ranking Engine
- Scores claims based on:
  - **Recency** (40% weight) - Time decay function
  - **Confidence** (40% weight) - Original confidence score
  - **Evidence** (20% weight) - Number of supporting evidence items
- Returns ranked list of claims

### 4. Narrative Summarization
- Generates entity summaries using ranked claims
- Includes active relationships
- Notes uncertainty when appropriate
- Uses LLM for natural language generation

### 5. Safe Auto-Update
- AI analyzes text and suggests updates
- Suggestions include:
  - New claims
  - Ended claims
  - Relationship changes
  - Entity updates
- Human approval required before applying

## API Endpoints

### POST `/api/omega-memory/ingest`
Ingest text and extract entities, claims, relationships.

**Request:**
```json
{
  "text": "John is a good person and lives in New York",
  "source": "USER"
}
```

**Response:**
```json
{
  "entities": [...],
  "claims": [...],
  "relationships": [...],
  "conflicts_detected": 0,
  "suggestions": [...]
}
```

### GET `/api/omega-memory/entities`
Get all entities for the user, optionally filtered by type.

**Query Parameters:**
- `type` (optional): Filter by entity type (PERSON, CHARACTER, LOCATION, ORG, EVENT)

### GET `/api/omega-memory/entities/:id/claims`
Get claims for an entity.

**Query Parameters:**
- `active_only` (optional, default: true): Only return active claims

### GET `/api/omega-memory/entities/:id/ranked-claims`
Get ranked claims for an entity (sorted by truth score).

### GET `/api/omega-memory/entities/:id/summary`
Get entity summary with narrative description.

### POST `/api/omega-memory/claims/:id/evidence`
Add evidence to support a claim.

**Request:**
```json
{
  "content": "Supporting evidence text",
  "source": "journal_entry_123"
}
```

### POST `/api/omega-memory/suggestions/:id/approve`
Approve and apply an update suggestion.

**Request:**
```json
{
  "type": "new_claim",
  "entity_id": "entity-123",
  "description": "Add new claim about entity",
  "confidence": 0.8,
  "proposed_data": {...}
}
```

## Database Schema

### Tables
- `omega_entities` - Entity storage
- `omega_claims` - Claim storage with temporal tracking
- `omega_relationships` - Relationship storage
- `omega_evidence` - Evidence storage

### Security
- Row Level Security (RLS) enabled on all tables
- User isolation via `user_id` foreign keys
- All operations require authentication

## Usage Example

```typescript
// Ingest text
const result = await omegaMemoryService.ingestText(
  userId,
  "John is a good person. He lives in New York.",
  'USER'
);

// Get ranked claims for an entity
const rankedClaims = await omegaMemoryService.rankClaims(entityId);

// Get entity summary
const summary = await omegaMemoryService.summarizeEntity(entityId);

// Approve a suggestion
await omegaMemoryService.approveUpdate(userId, suggestion);
```

## Future Enhancements

1. **LLM Integration** - Use OpenAI for entity extraction and claim analysis
2. **Semantic Similarity** - Better conflict detection using embeddings
3. **Evidence Scoring** - Weight evidence by source reliability
4. **Temporal Reasoning** - Better handling of time-based contradictions
5. **Relationship Inference** - Automatically infer relationships from claims
6. **Confidence Learning** - Adjust confidence based on evidence accumulation

## Testing

Tests are located in:
- `apps/server/tests/services/omegaMemoryService.test.ts`
- `apps/server/tests/routes/omegaMemory.test.ts`

Run tests with:
```bash
cd apps/server
npm test -- omegaMemory
```

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


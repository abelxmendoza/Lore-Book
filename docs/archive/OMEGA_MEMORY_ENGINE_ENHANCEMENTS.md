# OMEGA MEMORY ENGINE — Enhancements

## Overview

The OMEGA MEMORY ENGINE has been enhanced with advanced AI capabilities, semantic similarity, evidence scoring, and temporal reasoning.

## 1. LLM Integration

### Entity Extraction
- Uses OpenAI GPT-4o-mini for Named Entity Recognition (NER)
- Extracts entities with confidence scores
- Identifies aliases and alternative names
- Returns structured JSON with entity types (PERSON, CHARACTER, LOCATION, ORG, EVENT)

### Claim Extraction
- LLM extracts factual claims about entities
- Includes sentiment analysis (POSITIVE, NEGATIVE, NEUTRAL, MIXED)
- Extracts temporal context (start_time, end_time, is_ongoing)
- Generates embeddings for semantic similarity

### Relationship Extraction
- Identifies relationships between entities
- Extracts relationship types (e.g., "coach_of", "friend_of", "located_at")
- Includes temporal validity for relationships

### Narrative Summarization
- Uses LLM to generate comprehensive entity summaries
- Considers temporal evolution
- Notes uncertainty and contradictions
- Incorporates evidence and confidence levels

### Update Suggestions
- AI analyzes text and suggests updates
- Proposes new claims, ended claims, relationship changes
- Requires human approval before applying
- Conservative confidence thresholds (≥0.7)

### Contradiction Detection
- Uses LLM to verify if claims are contradictory
- Only flags high-confidence contradictions (≥0.7)
- Considers semantic meaning, not just keywords

## 2. Semantic Similarity

### Embedding Generation
- All claims and entities get vector embeddings (1536 dimensions)
- Uses OpenAI text-embedding-3-small model
- Embeddings cached for performance

### Conflict Detection
- Calculates cosine similarity between claim embeddings
- Low similarity (<0.3) + temporal overlap = potential conflict
- LLM verifies if it's actually a contradiction

### Entity Matching
- Semantic search for entity resolution
- Finds similar entities even with different names
- Uses vector similarity search (PostgreSQL pgvector)
- Falls back to exact/alias matching if semantic search fails

### Similar Claim Finding
- Uses vector similarity to find related claims
- Helps detect conflicts and contradictions
- More accurate than keyword-based search

## 3. Evidence Scoring

### Source Reliability
Evidence sources are weighted by reliability:
- **user_verified**: 1.0 (highest)
- **journal_entry**: 0.9
- **chat**: 0.7
- **ai_inferred**: 0.6
- **external**: 0.5 (lowest)

### Evidence-Weighted Scoring
- Claims with more reliable evidence rank higher
- Average reliability score of all evidence
- Count of evidence items also factors in

### Enhanced Truth Ranking
New ranking formula:
- **Recency** (30%): Time decay function
- **Confidence** (25%): Original extraction confidence
- **Evidence Count** (15%): Number of supporting evidence
- **Evidence Reliability** (15%): Average reliability score
- **Temporal Confidence** (15%): Confidence in temporal context

## 4. Temporal Reasoning

### Temporal Overlap Detection
- Checks if two claims overlap in time
- Handles ongoing claims (no end_time)
- Only conflicts matter if they overlap temporally

### Temporal Context
- Claims include temporal context metadata
- Tracks start_time, end_time, is_ongoing
- Temporal confidence score (0.0-1.0)

### Time-Based Contradictions
- Detects contradictions that occur at the same time
- Separates historical changes from conflicts
- Example: "John worked at Company A (2020-2023)" vs "John worked at Company B (2024-)" = no conflict

### Temporal Confidence
- Higher confidence for claims with clear temporal context
- Lower confidence for vague or inferred timestamps
- Factors into truth ranking

## Database Enhancements

### New Columns
- `omega_claims.embedding` (vector(1536)): Semantic embeddings
- `omega_entities.embedding` (vector(1536)): Entity embeddings
- `omega_evidence.reliability_score` (float): Source reliability
- `omega_evidence.source_type` (text): Type of evidence source
- `omega_claims.temporal_context` (jsonb): Temporal metadata
- `omega_claims.temporal_confidence` (float): Temporal confidence

### Indexes
- Vector similarity indexes for fast semantic search
- Uses ivfflat index with cosine distance
- Optimized for conflict detection queries

### Functions
- `match_omega_entities()`: Semantic entity matching
- `find_similar_claims_semantic()`: Similar claim search
- `temporal_overlap()`: Time range overlap detection
- `detect_temporal_contradiction()`: Temporal contradiction check

### Views
- `omega_claims_with_evidence`: Pre-calculated evidence-weighted scores

## API Enhancements

### POST `/api/omega-memory/claims/:id/evidence`
Now accepts `source_type` parameter:
```json
{
  "content": "Supporting evidence",
  "source": "entry_123",
  "source_type": "journal_entry" | "chat" | "external" | "user_verified" | "ai_inferred"
}
```

## Usage Examples

### Ingest Text with LLM
```typescript
const result = await omegaMemoryService.ingestText(
  userId,
  "John Doe is a software engineer who lives in Seattle. He works at Microsoft.",
  'USER'
);
// Automatically extracts:
// - Entities: John Doe (PERSON), Seattle (LOCATION), Microsoft (ORG)
// - Claims: "is a software engineer", "lives in Seattle", "works at Microsoft"
// - Relationships: John Doe -> located_at -> Seattle, John Doe -> works_at -> Microsoft
```

### Semantic Conflict Detection
```typescript
// Automatically detects if "John is good" conflicts with "John is not good"
// Uses embeddings + LLM verification
```

### Evidence Scoring
```typescript
await omegaMemoryService.addEvidence(
  userId,
  claimId,
  "User verified this claim",
  "verification_123",
  "user_verified" // Highest reliability
);
```

### Temporal Reasoning
```typescript
// Claims with temporal overlap are checked for contradictions
// "John worked at A (2020-2023)" and "John worked at B (2024-)" = no conflict
// "John worked at A (2020-2023)" and "John worked at B (2021-2022)" = potential conflict
```

## Performance Considerations

- Embeddings are cached to reduce API calls
- Vector indexes enable fast similarity search
- LLM calls are batched where possible
- Fallback mechanisms for API failures
- Conservative confidence thresholds reduce false positives

## Future Enhancements

1. **Batch Processing**: Process multiple texts in parallel
2. **Embedding Caching**: More aggressive caching strategy
3. **Confidence Learning**: Adjust confidence based on evidence accumulation
4. **Relationship Inference**: Automatically infer relationships from claims
5. **Temporal Reasoning**: Better handling of relative time references
6. **Multi-language Support**: Entity extraction in multiple languages

---

**Status**: ✅ All enhancements implemented
**Version**: 2.0.0
**Last Updated**: 2025-01-02


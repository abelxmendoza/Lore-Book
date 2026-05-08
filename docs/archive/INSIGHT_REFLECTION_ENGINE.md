# LORE-KEEPER INSIGHT & REFLECTION ENGINE (IRE)

## Overview

The **Insight & Reflection Engine (IRE)** surfaces meaningful, explainable patterns from existing memory **WITHOUT asserting new truth**. Insights are observations, not facts, and never modify memory directly.

## Core Principles

1. **Insights are observations, not facts**
2. **Insights NEVER write to memory directly**
3. **Insights must be explainable with receipts**
4. **User controls visibility and dismissal**

## Data Models

### Insight
An observation about patterns in memory:
- **Type**: PATTERN, TREND, DIVERGENCE, SHIFT, RECURRING_THEME
- **Title**: Human-readable title
- **Description**: Detailed explanation
- **Confidence**: System confidence in pattern (0.0 - 1.0)
- **Scope**: ENTITY, TIME, RELATIONSHIP, or SELF
- **Related IDs**: Links to entities, claims, perspectives
- **Time Window**: When this pattern was observed
- **Dismissed**: Whether user has dismissed this insight

### InsightEvidence
Supporting claims for an insight:
- **Insight ID**: Which insight this supports
- **Claim ID**: Which claim provides evidence
- **Explanation**: Why this claim supports the insight

## Insight Types

### PATTERN
Recurring patterns in claims:
- Sentiment patterns (e.g., "Often positive about X")
- Topic patterns (e.g., "Frequently discusses Y")
- Relationship patterns (e.g., "Regularly mentions Z")

**Example:**
```
Title: "Recurring sentiment pattern detected"
Description: "You frequently express positive sentiment about your work"
Confidence: 0.75
Scope: ENTITY
```

### TREND
Trends over time:
- Increasing/decreasing sentiment
- Confidence trends
- Frequency trends

**Example:**
```
Title: "Trend detected"
Description: "Sentiment about work has become more positive over time"
Confidence: 0.70
Scope: TIME
```

### DIVERGENCE
Perspective disagreements:
- Different perspectives disagree on same claim
- Strong semantic divergence between viewpoints

**Example:**
```
Title: "Perspective divergence detected"
Description: "Self and Coach Felipe have different views on this claim"
Confidence: 0.85
Scope: RELATIONSHIP
```

### SHIFT
Temporal shifts:
- Sentiment shifts (positive → negative)
- Confidence shifts (high → low)
- Behavioral shifts

**Example:**
```
Title: "Temporal shift detected"
Description: "Emotional shift from positive to negative over time"
Confidence: 0.80
Scope: TIME
```

### RECURRING_THEME
Global recurring themes:
- Themes that appear across multiple entities
- Topics that recur throughout history
- Patterns that span time and entities

**Example:**
```
Title: "Recurring theme in your history"
Description: "Theme 'personal growth' appears frequently"
Confidence: 0.65
Scope: SELF
```

## API Endpoints

### POST `/api/insights/generate`
Generate insights for the user.

**Response:**
```json
{
  "insights": [
    {
      "id": "insight-1",
      "type": "PATTERN",
      "title": "Recurring sentiment pattern detected",
      "description": "...",
      "confidence": 0.75,
      "scope": "ENTITY",
      "related_entity_ids": ["entity-1"],
      "related_claim_ids": ["claim-1", "claim-2"],
      "dismissed": false
    }
  ],
  "count": 1
}
```

### GET `/api/insights`
Get insights with optional filters.

**Query Parameters:**
- `type`: Filter by type (PATTERN, TREND, DIVERGENCE, SHIFT, RECURRING_THEME)
- `scope`: Filter by scope (ENTITY, TIME, RELATIONSHIP, SELF)
- `dismissed`: Filter by dismissed status (true/false)
- `limit`: Limit results

**Response:**
```json
{
  "insights": [ ... ],
  "count": 5
}
```

### GET `/api/insights/:id`
Get insight explanation with evidence.

**Response:**
```json
{
  "insight": {
    "id": "insight-1",
    "type": "PATTERN",
    "title": "...",
    "description": "...",
    "confidence": 0.75
  },
  "evidence": [
    {
      "id": "evidence-1",
      "claim_id": "claim-1",
      "explanation": "This claim supports the insight..."
    }
  ],
  "disclaimer": "This is an observation, not a fact."
}
```

### POST `/api/insights/:id/dismiss`
Dismiss an insight (hides it from future queries).

**Response:**
```json
{
  "success": true
}
```

## Insight Generation Pipeline

1. **Get Active Entities**: Fetch all entities for user
2. **Generate Entity Insights**: For each entity:
   - Detect patterns
   - Detect shifts
   - Detect perspective divergence
3. **Generate Global Insights**: Detect recurring themes
4. **Save Insights**: Store insights with evidence
5. **Create Evidence**: Link supporting claims to insights

## Pattern Detection

### Sentiment Patterns
Groups claims by sentiment and detects recurring patterns:
- Requires at least 3 occurrences
- Must represent 30%+ of claims
- Confidence based on frequency ratio

### Topic Patterns
Uses semantic embeddings to cluster claims by topic:
- Groups similar claims together
- Detects recurring topics
- Confidence based on cluster size

## Temporal Shift Detection

### Sentiment Shift
Compares early vs. late claims:
- Splits claims into two time periods
- Calculates average sentiment for each
- Detects significant shifts (>0.3 difference)

### Confidence Shift
Tracks confidence changes over time:
- Compares early vs. late confidence
- Detects significant shifts (>0.2 difference)

## Perspective Divergence Detection

1. Gets all perspective claims for a base claim
2. Calculates semantic similarity between perspectives
3. Low similarity = high divergence
4. Creates insight if divergence > 0.5

## Recurring Theme Detection

1. Gets all claims across all entities
2. Uses LLM to identify topics
3. Clusters claims by semantic topic
4. Creates insights for themes with frequency >= 3

## UI Contract

### Insight Cards
Insights appear as optional "Insight Cards":
- **Title**: Insight title
- **Type Badge**: Color-coded by type
- **Confidence Meter**: Visual confidence indicator
- **Scope Badge**: Entity, Time, Relationship, or Self
- **Expand Button**: View full description and evidence

### Card Expansion
When expanded, shows:
- **Full Description**: Detailed explanation
- **Evidence List**: All supporting claims
- **Related Entities**: Links to affected entities
- **Time Window**: When pattern was observed
- **Disclaimer**: "This is an observation, not a fact."

### User Actions
- **Dismiss**: Hide insight permanently
- **View Evidence**: See all supporting claims
- **View Related**: Navigate to related entities/claims

### Visibility Control
- Users can filter by type, scope, dismissed status
- Dismissed insights hidden by default
- Can view dismissed insights if needed

## Design Principles

1. **Observations, Not Facts**: Insights never assert new truth
2. **Explainable**: Every insight has evidence
3. **User Control**: Users can dismiss insights
4. **Non-Intrusive**: Insights are optional, never forced
5. **Reversible**: Dismissed insights can be viewed again

## Example Insights

### Pattern Insight
```
Type: PATTERN
Title: "Recurring positive sentiment about work"
Description: "You frequently express positive sentiment about your work. This pattern appears in 8 out of 20 claims (40%)."
Confidence: 0.75
Scope: ENTITY
Evidence: [claim-1, claim-3, claim-5, ...]
```

### Shift Insight
```
Type: SHIFT
Title: "Temporal shift detected"
Description: "Shift detected from positive to negative sentiment over time. Strength: 0.65"
Confidence: 0.80
Scope: TIME
Evidence: [claim-10, claim-11, claim-12, ...]
```

### Divergence Insight
```
Type: DIVERGENCE
Title: "Perspective divergence detected"
Description: "Self and Coach Felipe have different views on this claim"
Confidence: 0.85
Scope: RELATIONSHIP
Evidence: [perspective-claim-1, perspective-claim-2]
```

## Future Enhancements

1. **Insight Scheduling**: Auto-generate insights on schedule
2. **Insight Notifications**: Alert users about new insights
3. **Insight Analytics**: Track which insights are most valuable
4. **Custom Insight Types**: Allow users to define custom patterns
5. **Insight Comparison**: Compare insights across time periods
6. **Insight Export**: Export insights for external analysis

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


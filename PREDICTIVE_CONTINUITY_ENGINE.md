# LORE-KEEPER PREDICTIVE CONTINUITY ENGINE (PCE)

## Overview

The **Predictive Continuity Engine (PCE)** surfaces probabilistic future trajectories based on past patterns, decisions, and outcomes **WITHOUT asserting certainty or giving instructions**. Predictions are probabilistic, never write to memory, always cite evidence, and are optional and dismissible.

## Core Principles

1. **Predictions are probabilistic, not deterministic**
2. **Predictions NEVER write to memory**
3. **Predictions ALWAYS cite past evidence**
4. **Predictions are optional and dismissible**
5. **System never says "you should"**

## Data Models

### Prediction
A probabilistic future trajectory:
- **Title**: Human-readable title
- **Description**: What the prediction suggests
- **Probability**: Likelihood (0.0 - 1.0)
- **Confidence**: Model confidence (0.0 - 1.0)
- **Prediction Type**: BEHAVIORAL, RELATIONAL, CAREER, EMOTIONAL, DECISION_OUTCOME, PATTERN_CONTINUATION
- **Scope**: ENTITY, SELF, RELATIONSHIP, TIME
- **Related IDs**: Entities, decisions, insights, claims
- **Time Horizon**: SHORT, MEDIUM, LONG
- **Dismissed**: Whether user dismissed it

### PredictionEvidence
Evidence supporting a prediction:
- **Source Type**: DECISION_HISTORY, OUTCOME_HISTORY, INSIGHT_PATTERN, TEMPORAL_TREND
- **Reference ID**: ID of source (decision, insight, claim, etc.)
- **Explanation**: Why this evidence supports the prediction

## Prediction Types

### DECISION_OUTCOME
Predicts likely outcome based on similar past decisions:
- Analyzes outcomes of similar decisions
- Calculates probability distribution
- Cites decision history as evidence

### PATTERN_CONTINUATION
Predicts that a pattern will continue:
- Based on insights of type PATTERN or RECURRING_THEME
- Estimates continuation probability
- Cites pattern evidence

### RELATIONAL
Predicts relationship trajectory:
- Analyzes temporal trends in claims
- Detects positive/negative/neutral trajectories
- Cites temporal trend evidence

### BEHAVIORAL
Predicts behavioral patterns (future enhancement)

### CAREER
Predicts career trajectories (future enhancement)

### EMOTIONAL
Predicts emotional patterns (future enhancement)

## API Endpoints

### POST `/api/predictions/generate`
Generate predictions based on context.

**Request:**
```json
{
  "entity_ids": ["entity-1"],
  "decision_ids": ["decision-1"],
  "insight_ids": ["insight-1"],
  "claim_ids": ["claim-1"],
  "message": "I'm considering a career change"
}
```

**Response:**
```json
{
  "predictions": [
    {
      "id": "prediction-1",
      "title": "Likely outcome based on similar past decisions",
      "description": "Based on 5 similar past decisions, outcomes tend to be positive...",
      "probability": 0.7,
      "confidence": 0.6,
      "prediction_type": "DECISION_OUTCOME",
      "time_horizon": "MEDIUM"
    }
  ],
  "count": 1
}
```

### GET `/api/predictions`
Get predictions for user with optional filters.

**Query Parameters:**
- `dismissed`: Filter by dismissed status (default: false)
- `prediction_type`: Filter by type
- `scope`: Filter by scope
- `limit`: Limit results

**Response:**
```json
{
  "predictions": [
    {
      "id": "prediction-1",
      "title": "Pattern likely to continue",
      "probability": 0.75,
      "confidence": 0.8,
      "dismissed": false
    }
  ],
  "count": 1
}
```

### GET `/api/predictions/:id`
Get prediction with evidence.

**Response:**
```json
{
  "prediction": {
    "id": "prediction-1",
    "title": "Likely outcome",
    "description": "...",
    "probability": 0.7,
    "confidence": 0.6
  },
  "evidence": [
    {
      "id": "evidence-1",
      "source_type": "DECISION_HISTORY",
      "reference_id": "decision-1",
      "explanation": "Based on 5 similar past decisions"
    }
  ],
  "disclaimer": "This is a probabilistic projection, not advice."
}
```

### POST `/api/predictions/:id/dismiss`
Dismiss a prediction.

**Response:**
```json
{
  "success": true
}
```

## Prediction Generation Pipeline

1. **Context Analysis**: Analyze provided context
2. **Decision-Based Predictions**: Analyze similar past decisions
3. **Pattern Continuation**: Detect continuing patterns
4. **Relational Trajectories**: Analyze relationship trends
5. **Evidence Collection**: Collect supporting evidence
6. **Prediction Creation**: Create predictions with evidence

## Decision-Based Prediction

When similar past decisions are found:
1. Analyze outcomes of similar decisions
2. Calculate outcome distribution
3. Determine most likely outcome
4. Calculate probability and confidence
5. Create prediction with evidence

**Example:**
```
Similar Decisions: 5 career decisions
Outcomes: 3 POSITIVE, 1 NEGATIVE, 1 MIXED
Most Likely: POSITIVE (60% probability)
Confidence: 0.6 (based on sample size)
```

## Pattern Continuation

When patterns are detected:
1. Find active insights of type PATTERN or RECURRING_THEME
2. Estimate continuation probability
3. Describe how pattern might continue
4. Create prediction with evidence

**Example:**
```
Pattern: "Recurring positive sentiment about work"
Continuation Probability: 0.75
Description: "This pattern may continue based on past observations"
```

## Relational Trajectory

When relationship trends are detected:
1. Analyze claims over time
2. Detect sentiment trends
3. Determine trajectory direction
4. Calculate probability and confidence
5. Create prediction with evidence

**Example:**
```
Trajectory: Positive (improving)
Probability: 0.7
Confidence: 0.6
Time Horizon: MEDIUM
```

## Chatbot Integration

The chatbot can surface predictions:
- When user asks for reflection
- Shows predictions alongside insights
- Includes disclaimer: "These are possible trajectories based on past data"
- Never gives advice or says "you should"

**Example Response:**
```
Here are some possible trajectories based on past patterns:

**Pattern likely to continue**
The pattern "Recurring positive sentiment about work" may continue.
(Probability: 75%, Confidence: 80%)

**Likely outcome based on similar past decisions**
Based on 5 similar past decisions, outcomes tend to be positive.
(Probability: 60%, Confidence: 60%)

These are observations and probabilistic projections, not facts or advice.
```

## UI Contract

### Prediction Cards
Show prediction with:
- **Title & Description**: What the prediction suggests
- **Probability & Confidence**: Visual indicators
- **Prediction Type**: Badge showing type
- **Time Horizon**: SHORT, MEDIUM, LONG
- **Evidence**: Expandable evidence section
- **Dismiss Button**: Dismiss permanently

### Display Rules
- **Optional**: Never forced on user
- **Dismissible**: Can be dismissed permanently
- **Evidence Always Visible**: Expand to see evidence
- **No Actions**: Predictions never trigger actions
- **Clear Disclaimers**: "Probabilistic projection, not advice"

## Design Principles

1. **Probabilistic, Not Deterministic**: Always show probability
2. **Never Write to Memory**: Predictions are observations only
3. **Always Cite Evidence**: Every prediction has evidence
4. **Optional & Dismissible**: User controls visibility
5. **No Advice**: Never say "you should"

## Integration

The PCE integrates with:
- **DECISION MEMORY ENGINE**: For decision-based predictions
- **INSIGHT ENGINE**: For pattern continuation
- **OMEGA MEMORY ENGINE**: For relational trajectories
- **CONVERSATIONAL ORCHESTRATION**: For chatbot integration

## Example Predictions

### Decision Outcome Prediction
```
Title: "Likely outcome based on similar past decisions"
Description: "Based on 5 similar career decisions, outcomes tend to be positive (60% probability)."
Probability: 0.6
Confidence: 0.6
Evidence: 5 similar past decisions
```

### Pattern Continuation
```
Title: "Pattern likely to continue"
Description: "The pattern 'Recurring positive sentiment about work' may continue."
Probability: 0.75
Confidence: 0.8
Evidence: Pattern insight
```

### Relational Trajectory
```
Title: "Relationship trajectory observed"
Description: "The relationship trajectory appears to be improving based on recent patterns."
Probability: 0.7
Confidence: 0.6
Evidence: Temporal trend in claims
```

## Future Enhancements

1. **More Prediction Types**: Behavioral, career, emotional
2. **Confidence Calibration**: Improve confidence calculations
3. **Prediction Validation**: Track prediction accuracy
4. **Prediction Learning**: Learn from past predictions
5. **Custom Prediction Models**: User-defined models
6. **Prediction Comparison**: Compare different predictions

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


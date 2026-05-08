# LORE-KEEPER DECISION MEMORY ENGINE (DME)

## Overview

The **Decision Memory Engine (DME)** captures WHY a decision was made at the time, preserving context, values, uncertainty, and intent **WITHOUT judging outcomes or asserting correctness**. Decisions are immutable snapshots that can have outcomes linked later.

## Core Principles

1. **Decisions are snapshots, not verdicts**
2. **No decision is labeled "right" or "wrong"**
3. **Decisions are immutable once recorded**
4. **Outcomes are linked later, never overwritten**

## Data Models

### Decision
An immutable snapshot of a decision:
- **Title**: Human-readable title
- **Description**: What the decision was about
- **Decision Type**: RELATIONSHIP, CAREER, HEALTH, FINANCIAL, CREATIVE, SOCIAL, PERSONAL, OTHER
- **Entity IDs**: People, organizations, or self involved
- **Related Claim IDs**: Claims that informed the decision
- **Related Insight IDs**: Insights that informed the decision
- **Perspective ID**: Usually SELF perspective
- **Confidence**: Confidence at time of decision (0.0 - 1.0)
- **Uncertainty Notes**: What was unclear at the time

### DecisionOption
Options considered for the decision:
- **Option Text**: Description of the option
- **Perceived Risks**: Risks associated with this option
- **Perceived Rewards**: Rewards associated with this option
- **Confidence**: Confidence in this option (0.0 - 1.0)

### DecisionRationale
Why the decision was made:
- **Reasoning**: Freeform explanation
- **Values Considered**: e.g., freedom, stability, growth
- **Emotions Present**: e.g., fear, hope, excitement
- **Constraints**: e.g., money, time, energy
- **Known Unknowns**: What was unclear

### DecisionOutcome
Outcome linked post-hoc (never overwrites):
- **Outcome Text**: Description of what happened
- **Sentiment**: POSITIVE, NEGATIVE, MIXED, UNCLEAR
- **Linked Claim IDs**: Claims that describe the outcome
- **Recorded At**: When outcome was recorded

## Decision Types

- **RELATIONSHIP**: Decisions about relationships
- **CAREER**: Career-related decisions
- **HEALTH**: Health-related decisions
- **FINANCIAL**: Financial decisions
- **CREATIVE**: Creative decisions
- **SOCIAL**: Social decisions
- **PERSONAL**: Personal decisions
- **OTHER**: Other types

## API Endpoints

### POST `/api/decisions/propose`
Propose decision capture (for chatbot integration).

**Request:**
```json
{
  "message": "I'm deciding whether to take this job",
  "entity_ids": ["entity-1"],
  "claim_ids": ["claim-1"],
  "insight_ids": ["insight-1"]
}
```

**Response:**
```json
{
  "proposal": {
    "id": "decision-1",
    "title": "Career decision",
    "description": "Deciding whether to take this job",
    "decision_type": "CAREER",
    "confidence": 0.7
  }
}
```

### POST `/api/decisions`
Record a decision with options and rationale.

**Request:**
```json
{
  "decision": {
    "title": "Career decision",
    "description": "Should I take this job?",
    "decision_type": "CAREER",
    "entity_ids": ["entity-1"],
    "confidence": 0.7,
    "uncertainty_notes": "Not sure about work-life balance"
  },
  "options": [
    {
      "option_text": "Take the job",
      "perceived_risks": "Long hours, less time with family",
      "perceived_rewards": "Better pay, career growth",
      "confidence": 0.8
    },
    {
      "option_text": "Stay at current job",
      "perceived_risks": "Stagnation, lower pay",
      "perceived_rewards": "Stability, work-life balance",
      "confidence": 0.6
    }
  ],
  "rationale": {
    "reasoning": "I value growth but also work-life balance",
    "values_considered": ["growth", "stability", "family"],
    "emotions_present": ["excitement", "anxiety", "fear"],
    "constraints": ["financial obligations", "family time"],
    "known_unknowns": "Not sure about company culture"
  }
}
```

**Response:**
```json
{
  "decision": { ... },
  "options": [ ... ],
  "rationale": { ... },
  "outcomes": []
}
```

### GET `/api/decisions`
Get decisions with optional filters.

**Query Parameters:**
- `decision_type`: Filter by type
- `entity_id`: Filter by entity
- `limit`: Limit results
- `offset`: Pagination offset

**Response:**
```json
{
  "decisions": [
    {
      "id": "decision-1",
      "title": "Career decision",
      "decision_type": "CAREER",
      "created_at": "2025-01-02T12:00:00Z",
      "confidence": 0.7
    }
  ],
  "count": 1
}
```

### GET `/api/decisions/:id`
Get decision summary with all related data.

**Response:**
```json
{
  "decision": { ... },
  "options": [ ... ],
  "rationale": { ... },
  "outcomes": [ ... ]
}
```

### GET `/api/decisions/similar`
Get similar past decisions.

**Query Parameters:**
- `decision_type`: Filter by type
- `entity_ids`: Filter by entities
- `message`: Use semantic similarity
- `threshold`: Similarity threshold (default: 0.6)

**Response:**
```json
{
  "decisions": [ ... ],
  "count": 5
}
```

### POST `/api/decisions/:id/outcomes`
Record decision outcome (post-hoc).

**Request:**
```json
{
  "outcome_text": "Took the job and it worked out well",
  "sentiment": "POSITIVE",
  "linked_claim_ids": ["claim-1", "claim-2"]
}
```

**Response:**
```json
{
  "outcome": {
    "id": "outcome-1",
    "decision_id": "decision-1",
    "outcome_text": "Took the job and it worked out well",
    "sentiment": "POSITIVE",
    "recorded_at": "2025-01-02T13:00:00Z"
  }
}
```

## Decision Capture Pipeline

1. **Context Analysis**: Analyze conversation or user input
2. **Entity Extraction**: Identify relevant entities
3. **Claim Extraction**: Find relevant claims
4. **Insight Extraction**: Find relevant insights
5. **Type Inference**: Classify decision type
6. **Confidence Calculation**: Calculate confidence based on available information
7. **Proposal Creation**: Create decision proposal

## User-Gated Recording

Decisions are never forced:
- Optional prompts suggest decision capture
- User explicitly records decision
- All context preserved at time of decision
- Immutable once recorded

## Outcome Linking (Post-Hoc)

Outcomes are linked later:
- Multiple outcomes can be linked
- Never overwrites original decision
- Records what actually happened
- Links to claims that describe outcome
- Sentiment captured but not judgment

## Chatbot Integration

The chatbot can surface decision memory:
- When user asks for decision support
- Shows similar past decisions
- Includes rationale and values
- Non-prescriptive: "This reflects past reasoning, not advice"

## UI Contract

### Decision Cards
Show decision with:
- **Title & Description**: What the decision was
- **Decision Type**: Category badge
- **Options Considered**: All options with risks/rewards
- **Rationale**: Values, emotions, constraints
- **Confidence & Uncertainty**: How certain at the time
- **Outcomes**: Linked outcomes (if any)

### Decision Capture
- **Optional Prompts**: Suggest capture when relevant
- **Never Forced**: User chooses to record
- **Context Preserved**: All context at time of decision
- **Immutable**: Cannot edit once recorded

### Outcome Recording
- **Add Later**: Outcomes added post-hoc
- **Multiple Outcomes**: Can link multiple outcomes
- **Never Overwrites**: Original decision unchanged
- **Links to Claims**: Connects to memory claims

## Example Decision

```
Title: "Career decision"
Description: "Should I take this new job offer?"

Options:
1. Take the job
   - Risks: Long hours, less time with family
   - Rewards: Better pay, career growth
   - Confidence: 0.8

2. Stay at current job
   - Risks: Stagnation, lower pay
   - Rewards: Stability, work-life balance
   - Confidence: 0.6

Rationale:
- Reasoning: "I value growth but also work-life balance"
- Values: growth, stability, family
- Emotions: excitement, anxiety, fear
- Constraints: financial obligations, family time
- Unknowns: Company culture, team dynamics

Confidence: 0.7
Uncertainty: "Not sure about work-life balance"

[Later...]

Outcome:
- Text: "Took the job and it worked out well"
- Sentiment: POSITIVE
- Recorded: 3 months later
```

## Design Principles

1. **Snapshots, Not Verdicts**: Decisions are time-capsules
2. **No Judgment**: Never label as "right" or "wrong"
3. **Immutable**: Cannot edit once recorded
4. **Post-Hoc Outcomes**: Outcomes linked later
5. **Context Preservation**: All context saved

## Integration

The DME integrates with:
- **CONVERSATIONAL ORCHESTRATION**: For decision support
- **CONTINUITY LAYER**: For event tracking
- **OMEGA MEMORY ENGINE**: For related claims
- **INSIGHT ENGINE**: For relevant insights
- **PERSPECTIVE SERVICE**: For perspective tracking

## Future Enhancements

1. **Decision Templates**: Pre-defined decision structures
2. **Decision Analytics**: Statistics on decision patterns
3. **Decision Comparison**: Compare similar decisions
4. **Decision Learning**: Learn from past decisions
5. **Decision Recommendations**: Suggest based on patterns
6. **Decision Export**: Export for external analysis

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


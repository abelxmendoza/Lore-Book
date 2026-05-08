# LORE-KEEPER GOAL TRACKING & VALUE ALIGNMENT ENGINE (GVAE)

## Overview

The **Goal Tracking & Value Alignment Engine (GVAE)** tracks stated values and goals over time and surfaces alignment or drift **WITHOUT moral judgment or prescriptive advice**. Values are declared, goals are optional and mutable, alignment is observational, and drift is surfaced neutrally.

## Core Principles

1. **Values are declared, never inferred silently**
2. **Goals are optional and mutable**
3. **Alignment is observational, not evaluative**
4. **Drift is surfaced, not criticized**
5. **No system ever says "you should"**

## Data Models

### Value
A user-declared value:
- **Name**: e.g., "Freedom", "Stability"
- **Description**: What this value means
- **Priority**: Relative importance (0.0 - 1.0)
- **Created At**: When declared
- **Ended At**: When value was ended (if applicable)

### Goal
A user-declared goal:
- **Title**: Human-readable title
- **Description**: What the goal is
- **Goal Type**: PERSONAL, CAREER, RELATIONSHIP, HEALTH, FINANCIAL, CREATIVE
- **Related Value IDs**: Values this goal relates to
- **Target Timeframe**: SHORT, MEDIUM, LONG
- **Confidence**: Confidence in goal commitment (0.0 - 1.0)
- **Status**: ACTIVE, PAUSED, COMPLETED, ABANDONED
- **Created At**: When declared
- **Ended At**: When completed or abandoned

### GoalSignal
A signal indicating goal alignment:
- **Source Type**: CLAIM, DECISION, INSIGHT, OUTCOME
- **Reference ID**: ID of source
- **Alignment Score**: -1.0 (misaligned) to +1.0 (aligned)
- **Explanation**: Why this signal indicates alignment
- **Recorded At**: When signal was recorded

### AlignmentSnapshot
Aggregated alignment score over time:
- **Alignment Score**: -1.0 to +1.0
- **Confidence**: Model confidence (0.0 - 1.0)
- **Time Window**: Start and end of time period
- **Generated At**: When snapshot was created

## API Endpoints

### POST `/api/goals/values`
Declare a value.

**Request:**
```json
{
  "name": "Freedom",
  "description": "Value freedom and independence",
  "priority": 0.8
}
```

**Response:**
```json
{
  "value": {
    "id": "value-1",
    "name": "Freedom",
    "description": "Value freedom and independence",
    "priority": 0.8,
    "created_at": "2025-01-02T12:00:00Z"
  }
}
```

### GET `/api/goals/values`
Get values for user.

**Query Parameters:**
- `active_only`: Filter active values (default: true)

**Response:**
```json
{
  "values": [
    {
      "id": "value-1",
      "name": "Freedom",
      "priority": 0.8
    }
  ],
  "count": 1
}
```

### PATCH `/api/goals/values/:id/priority`
Update value priority.

**Request:**
```json
{
  "priority": 0.9
}
```

### POST `/api/goals/goals`
Declare a goal.

**Request:**
```json
{
  "title": "Advance in career",
  "description": "Get promoted to senior role",
  "goal_type": "CAREER",
  "related_value_ids": ["value-1"],
  "target_timeframe": "MEDIUM",
  "confidence": 0.7
}
```

**Response:**
```json
{
  "goal": {
    "id": "goal-1",
    "title": "Advance in career",
    "status": "ACTIVE",
    "created_at": "2025-01-02T12:00:00Z"
  }
}
```

### GET `/api/goals/goals`
Get goals for user.

**Query Parameters:**
- `status`: Filter by status
- `goal_type`: Filter by type
- `limit`: Limit results

**Response:**
```json
{
  "goals": [
    {
      "id": "goal-1",
      "title": "Advance in career",
      "status": "ACTIVE",
      "goal_type": "CAREER"
    }
  ],
  "count": 1
}
```

### GET `/api/goals/goals/:id`
Get goal with alignment data.

**Response:**
```json
{
  "goal": { ... },
  "signals": [
    {
      "id": "signal-1",
      "source_type": "CLAIM",
      "alignment_score": 0.7,
      "explanation": "Claim aligns with goal"
    }
  ],
  "snapshots": [
    {
      "id": "snapshot-1",
      "alignment_score": 0.75,
      "confidence": 0.6,
      "generated_at": "2025-01-02T12:00:00Z"
    }
  ]
}
```

### PATCH `/api/goals/goals/:id/status`
Update goal status.

**Request:**
```json
{
  "status": "PAUSED"
}
```

### POST `/api/goals/goals/:id/evaluate`
Evaluate goal signals.

**Response:**
```json
{
  "signals": [ ... ],
  "count": 5
}
```

### POST `/api/goals/goals/:id/alignment`
Compute alignment for a goal.

**Response:**
```json
{
  "snapshot": {
    "id": "snapshot-1",
    "alignment_score": 0.75,
    "confidence": 0.6,
    "time_window": {
      "start": "2025-01-01T00:00:00Z",
      "end": "2025-01-02T00:00:00Z"
    }
  }
}
```

### GET `/api/goals/goals/:id/drift`
Detect goal drift.

**Response:**
```json
{
  "drift": {
    "title": "Goal alignment drift observed",
    "description": "Alignment has decreased over time...",
    "disclaimer": "This is an observation, not a judgment.",
    "goal_id": "goal-1",
    "trend": "downward"
  }
}
```

## Signal Ingestion

Signals are read-only analysis from:
1. **Claims**: Analyze how claims align with goals
2. **Decisions**: Analyze how decisions align with goals
3. **Insights**: Analyze how insights align with goals
4. **Outcomes**: Analyze how outcomes align with goals

Each signal has:
- **Alignment Score**: -1.0 (misaligned) to +1.0 (aligned)
- **Explanation**: Why this signal indicates alignment
- **Source**: Where the signal came from

## Alignment Scoring

Alignment is computed from signals:
1. Collect all signals for a goal
2. Calculate weighted average alignment score
3. Calculate confidence based on signal count
4. Derive time window from signals
5. Create alignment snapshot

**Formula:**
```
alignment_score = weighted_average(signals.alignment_score)
confidence = min(1.0, signal_count / 10)
```

## Drift Detection

Drift is detected by analyzing alignment snapshots:
1. Get alignment snapshots over time
2. Detect downward trend (needs at least 3 snapshots)
3. Create drift observation if trend detected
4. Describe drift neutrally

**Trend Detection:**
- **Downward**: Recent average < older average by > 0.2
- **Upward**: Recent average > older average by > 0.2
- **Stable**: Difference < 0.2

## Chatbot Integration

The chatbot can surface goal alignment:
- When user asks for reflection
- Shows goal alignment alongside insights
- Includes disclaimer: "Alignment reflects observed patterns, not intent."
- Never judges or gives advice

**Example Response:**
```
Goal Alignment:

**Advance in career**
Alignment: 75% (Confidence: 60%)

**Improve health**
Alignment: 60% (Confidence: 50%)

Alignment reflects observed patterns, not intent.
```

## UI Contract

### Value Management
- **Explicit Declaration**: Values must be explicitly declared
- **Editable Priority**: Users can update priority
- **No Silent Inference**: System never infers values

### Goal Management
- **Optional**: Goals are optional
- **Mutable**: Users can pause, complete, or abandon goals
- **No Penalty**: No judgment for changing goals
- **Linked Values**: Goals show related values

### Alignment Display
- **Visual Indicators**: Show alignment score visually
- **Time Series**: Show alignment over time
- **Signals**: Show contributing signals
- **Neutral Language**: "Alignment observed" not "You're aligned"

### Drift Display
- **Neutral Phrasing**: "Drift observed" not "You're drifting"
- **No Alerts**: Surfaces observations, not warnings
- **Optional**: Users can dismiss drift observations

## Design Principles

1. **Declared, Not Inferred**: Values and goals are explicit
2. **Observational, Not Evaluative**: Alignment is observed, not judged
3. **Neutral Language**: No moral judgment or prescriptive advice
4. **Optional & Mutable**: Goals can be changed without penalty
5. **No "Should"**: System never says "you should"

## Integration

The GVAE integrates with:
- **OMEGA MEMORY ENGINE**: For claim analysis
- **DECISION MEMORY ENGINE**: For decision analysis
- **INSIGHT ENGINE**: For insight analysis
- **CONVERSATIONAL ORCHESTRATION**: For chatbot integration

## Example Workflow

1. **Declare Values**:
   ```
   Value: "Freedom" (Priority: 0.8)
   Value: "Stability" (Priority: 0.6)
   ```

2. **Declare Goal**:
   ```
   Goal: "Advance in career"
   Related Values: ["Freedom"]
   Target: MEDIUM term
   ```

3. **Signals Collected**:
   ```
   Claim: "Took new job" → Alignment: 0.7
   Decision: "Career decision" → Alignment: 0.8
   Insight: "Career pattern" → Alignment: 0.6
   ```

4. **Alignment Computed**:
   ```
   Alignment Score: 0.7
   Confidence: 0.6
   ```

5. **Drift Detected** (if applicable):
   ```
   "Goal alignment drift observed"
   "Alignment has decreased from 0.8 to 0.5 over time"
   "This is an observation, not a judgment."
   ```

## Future Enhancements

1. **Value Evolution**: Track how values change over time
2. **Goal Templates**: Pre-defined goal structures
3. **Alignment Predictions**: Predict future alignment
4. **Value Conflicts**: Detect conflicting values
5. **Goal Dependencies**: Link related goals
6. **Alignment Analytics**: Statistics on alignment patterns

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02


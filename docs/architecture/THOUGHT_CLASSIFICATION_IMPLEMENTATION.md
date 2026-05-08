# Thought Classification and Response System

## Overview

A system that catches passing thoughts mid-flight and responds with appropriate posture—without fumbling, moralizing, or being corny.

**Target**: <300ms end-to-end processing

## Core Problem Solved

A passing thought like "I feel behind" is:
- Incomplete
- Emotionally loaded
- Context-light
- Often defensive or self-critical

The system classifies the thought, checks known patterns, and responds with the right posture—**before** it gets lost or the user moves on.

## Architecture

### 1. Thought Classification (<100ms)

**Service**: `thoughtClassificationService.ts`

**Types Detected**:
- `passing_thought` - fleeting, low commitment
- `insecurity` - self-worth / comparison / fear
- `belief` - "I am X", "People think Y"
- `emotion_spike` - anger, shame, sadness
- `decision_probe` - "Should I..."
- `memory_ping` - recalling past event
- `mixed` - multiple types

**Method**: Pattern matching (fast) → LLM (nuanced) if needed

### 2. Insecurity Graph (<50ms)

**Service**: `insecurityGraphService.ts`

**What It Does**:
- Checks if we've seen this theme before
- Tracks frequency, intensity trends, related domains
- No moralizing—just pattern matching

**Example Match**:
```
Thought: "I feel behind"
Matches:
- Career comparison (frequency: 8, intensity: stable)
- Money milestone anxiety (frequency: 3, intensity: increasing)
```

### 3. Response Posture Decision (<50ms)

**Service**: `thoughtResponseService.ts`

**Postures**:
- **Reflect** - mirror it back clean (default for insecurities)
- **Clarify** - ask 1 sharp question (when pattern is known)
- **Stabilize** - reduce emotional spike (for emotion_spike)
- **Reframe** - challenge belief (only if earned, frequency >= 5)

**Decision Logic**:
```typescript
if (thought_type === 'insecurity') {
  if (matches.length > 0 && match_confidence > 0.7) {
    return 'clarify'; // Known pattern - can be direct
  }
  return 'reflect'; // New pattern - reflect first
}

if (thought_type === 'emotion_spike') {
  return 'stabilize';
}

if (thought_type === 'belief' && confidence > 0.8) {
  return 'reframe'; // Only if high confidence
}
```

### 4. Response Generation (<100ms)

**Service**: `thoughtResponseService.ts`

**Response Templates** (Never Corny):

**Good Response** (Example: "I feel behind"):
```
"Behind who — people from high school, or where you thought you'd be by now?"
```

**Why This Works**:
- Doesn't deny the feeling
- Narrows the comparison axis
- Keeps agency with user
- No empty calories ("Everyone moves at their own pace 😊")

**Context-Aware Response** (When pattern is known):
```
"This usually shows up when you're thinking about money or career timelines. 
Is that what's firing right now, or is it something else?"
```

**Why This Works**:
- Remembers patterns, not secrets
- Asks permission
- Doesn't assume correctness

## Guardrails

The system **never**:
- ❌ Over-diagnoses
- ❌ Lectures
- ❌ Minimizes ("it's not that bad")
- ❌ Jumps to motivation or advice
- ❌ Pathologizes normal human doubt

**Insecurities are signals, not bugs.**

## Database Schema

**Migration**: `migrations/20250323_thought_classification.sql`

### Tables

1. **thought_classifications** - Classified thoughts
2. **insecurity_patterns** - Recurring insecurity themes
3. **insecurity_instances** - Individual instances
4. **thought_responses** - Generated responses with posture

## API Endpoints

**Base Path**: `/api/thoughts`

### Main Entry Point

- `POST /process` - Process thought end-to-end (<300ms)
  ```json
  {
    "thoughtText": "I feel behind",
    "entryId": "optional",
    "messageId": "optional"
  }
  ```

  Response:
  ```json
  {
    "classification": {
      "type": "insecurity",
      "confidence": 0.85
    },
    "insecurity_matches": [
      {
        "theme": "career comparison",
        "domain": "career",
        "frequency": 8,
        "match_confidence": 0.9
      }
    ],
    "response": {
      "posture": "clarify",
      "text": "Behind who — people from high school, or where you thought you'd be by now?"
    },
    "processing_time_ms": 245
  }
  ```

### Quick Classification

- `POST /classify` - Quick classification only (for UI feedback)
  ```json
  {
    "thoughtText": "I feel behind"
  }
  ```

### Insecurity Patterns

- `GET /insecurities` - Get user's insecurity patterns
- `GET /insecurities?domain=career` - Filter by domain

### Feedback

- `PUT /responses/:responseId/feedback` - Record if response was helpful
  ```json
  {
    "wasHelpful": true
  }
  ```

## Integration with Chat

**Location**: `apps/server/src/services/omegaChatService.ts`

**Integration Point**: After message is saved, before LLM response

```typescript
// Fire-and-forget: Process passing thoughts (non-blocking)
this.processPassingThought(userId, message, savedMessage.id).catch(err => {
  logger.debug({ err, userId }, 'Thought processing failed (non-blocking)');
});
```

**Behavior**:
- Only processes short messages (<200 chars) that aren't questions
- Non-blocking (doesn't slow down chat)
- Results stored for UI to query separately
- Can optionally include response in chat metadata

## Usage Examples

### Example 1: New Insecurity

**Input**: "I feel behind"

**Processing**:
1. Classifies as `insecurity` (confidence: 0.85)
2. No matching patterns found
3. Posture: `reflect` (new pattern)
4. Response: "Behind who — people from high school, or where you thought you'd be by now?"

**Result**: User clarifies, pattern gets recorded

### Example 2: Known Insecurity

**Input**: "I feel behind" (after 8 previous instances)

**Processing**:
1. Classifies as `insecurity` (confidence: 0.85)
2. Matches "career comparison" pattern (frequency: 8, confidence: 0.9)
3. Posture: `clarify` (known pattern, can be direct)
4. Response: "This usually shows up when you're thinking about money or career timelines. Is that what's firing right now, or is it something else?"

**Result**: Context-aware response that acknowledges the pattern

### Example 3: Emotion Spike

**Input**: "I'm so angry right now"

**Processing**:
1. Classifies as `emotion_spike` (confidence: 0.9)
2. Posture: `stabilize`
3. Response: "That's a lot of anger. What happened that brought this up?"

**Result**: Acknowledges intensity without minimizing

### Example 4: Belief

**Input**: "I'm always the one who messes things up"

**Processing**:
1. Classifies as `belief` (confidence: 0.8)
2. If frequency >= 5: Posture `reframe`
3. Response: "You've thought this before. Is it still true, or has something changed?"

**Result**: Gentle challenge only if earned

## Response Templates

### Reflect (Default)
- "Behind who — people from high school, or where you thought you'd be by now?"
- "Not enough for what, or for whom?"
- "Compared to what standard?"
- "Always? Or does it just feel that way right now?"

### Clarify (When Pattern Known)
- "This usually shows up when you're thinking about [domain]. Is that what's firing right now, or is it something else?"
- "Is this about where you thought you'd be by this age, or comparing to others?"

### Stabilize (Emotion Spikes)
- "That's a lot of anger. What happened that brought this up?"
- "Shame is heavy. What's making you feel that way?"
- "That sounds really hard. What happened?"

### Reframe (Only If Earned)
- "You've thought this before about [domain]. Is it still true, or has something changed?"

## Key Principles

1. **Speed**: <300ms end-to-end
2. **Respect**: Never minimize, lecture, or pathologize
3. **Pattern Memory**: Remembers how you usually struggle
4. **Permission**: Asks, doesn't assume
5. **Non-Blocking**: Never interrupts chat flow
6. **Signals, Not Bugs**: Insecurities are data, not errors

## Why This Fits LoreBook

You're not trying to:
- "Fix" the user
- Force positivity
- Replace humans

You're trying to build:
- A system that doesn't panic when the user shows doubt
- A mind that knows when to shut up and when to ask one good question

**That's elite design.**

## Files Created

### Database
- `migrations/20250323_thought_classification.sql`

### Services
- `apps/server/src/services/thoughtClassification/thoughtClassificationService.ts`
- `apps/server/src/services/insecurityGraph/insecurityGraphService.ts`
- `apps/server/src/services/thoughtResponse/thoughtResponseService.ts`
- `apps/server/src/services/thoughtOrchestration/thoughtOrchestrationService.ts`

### API Routes
- `apps/server/src/routes/thoughts.ts`
- Registered in `apps/server/src/routes/routeRegistry.ts`

### Integration
- `apps/server/src/services/omegaChatService.ts` - Integrated `processPassingThought()`

## Next Steps (Optional)

1. **UI Integration**: Show thought responses in chat UI
2. **Gentle Interruption**: Option to interrupt chat with thought response
3. **Pattern Visualization**: Show insecurity patterns over time
4. **Response Learning**: Use feedback to improve response quality
5. **Spiral Detection**: Detect when thoughts are spiraling and intervene

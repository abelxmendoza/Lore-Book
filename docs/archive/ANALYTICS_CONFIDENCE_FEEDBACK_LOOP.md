# Analytics → Entity Confidence Feedback Loop

## Overview
This system uses analytics signals to adjust entity confidence, surface uncertainty honestly, and prevent analytics from appearing certain when meaning is ambiguous.

## Core Principles
- Analytics NEVER increase certainty beyond evidence
- Confidence decays without reinforcement
- Ambiguity lowers confidence, not truth
- Analytics obey entity confidence, not override it
- No prescriptive behavior, only observation

## Implementation

### 1. Database Schema
**File**: `migrations/20250224_entity_confidence_snapshots.sql`

- `entity_confidence_snapshots` table tracks confidence evolution
- Stores confidence, derivation source (USAGE, ANALYTICS, MERGE, CORRECTION, DECAY), reason, and metadata
- Indexed for efficient queries

### 2. Entity Confidence Service
**File**: `apps/server/src/services/entityConfidenceService.ts`

**Key Functions**:
- `deriveAnalyticsSignals()` - Extracts signals from analytics:
  - INTERACTION_DIVERSITY: High diversity = positive signal
  - RELATIONSHIP_DEPTH: Deep relationships = positive, shallow = negative
  - CONFLICT_RATE: High conflict = negative signal (uncertainty)
  - TEMPORAL_CONSISTENCY: Limited time depth = negative, long-term = positive
  - SENTIMENT_STABILITY: Stable sentiment = positive signal

- `updateEntityConfidenceFromAnalytics()` - Updates confidence based on weighted signals
- `applyConfidenceDecay()` - Decays confidence for entities not seen in 90+ days
- `shouldSurfaceAnalytics()` / `getEntityConfidenceGate()` - Determines if analytics should be shown:
  - UNCERTAIN mode: Confidence < 0.5 → "This analysis is tentative due to limited clarity"
  - SOFT mode: Has active overrides → "Interpretation adjusted based on your feedback"
  - NORMAL mode: Standard display

- `softenAnalyticsLanguage()` - Softens analytics language for low confidence entities

### 3. Analytics Service Integration
**Files**: 
- `apps/server/src/services/characterAnalyticsService.ts`
- `apps/server/src/services/locationAnalyticsService.ts`
- `apps/server/src/services/groupAnalyticsService.ts`

After calculating analytics, each service automatically:
- Calls `entityConfidenceService.updateEntityConfidenceFromAnalytics()` (fire and forget)
- Updates entity confidence based on analytics signals

### 4. Chatbot Integration
**File**: `apps/server/src/services/omegaChatService.ts`

**Changes**:
- Loads entity confidence and analytics gate when `entityContext` is provided
- Softens analytics language if confidence < 0.5
- Includes confidence percentage and disclaimers in system prompt
- Chatbots can explain why analytics might be tentative

**Example Context**:
```
**CURRENT CHARACTER ANALYTICS** (Confidence: 45%) (for the character being discussed):

⚠️ This analysis is tentative due to limited clarity.

- Closeness: 60/100 - Moderate closeness
...
```

### 5. Signal Extraction Logic

**Positive Signals** (increase confidence):
- High interaction diversity (+0.2, weight 0.6)
- Deep relationships (+0.15, weight 0.7)
- Long-term consistency (+0.15, weight 0.8)
- Stable sentiment (+0.1, weight 0.6)

**Negative Signals** (decrease confidence):
- High conflict rate (-0.4, weight 0.9)
- Shallow relationships (-0.1, weight 0.5)
- Limited temporal depth (-0.2, weight 0.7)

### 6. Confidence Decay
- Entities not seen in 90+ days decay by 5% per period
- Prevents stale entities from maintaining high confidence
- Only applies to entities with confidence > 0.1

### 7. Confidence Gating
- **UNCERTAIN** (< 0.5): Shows disclaimer, softens language
- **SOFT** (has overrides): Shows adjustment message
- **NORMAL** (≥ 0.5, no overrides): Standard display

## Usage

### Automatic Updates
Confidence is automatically updated when:
1. Analytics are calculated (via analytics services)
2. Entities are merged (via entity resolution)
3. User corrections are applied (via correction system)
4. Decay is applied (scheduled job)

### Manual Access
```typescript
import { entityConfidenceService } from './services/entityConfidenceService';

// Get confidence gate
const gate = await entityConfidenceService.shouldSurfaceAnalytics(userId, entityId, 'CHARACTER');

// Get confidence history
const history = await entityConfidenceService.getConfidenceHistory(userId, entityId);

// Apply decay (typically scheduled)
await entityConfidenceService.applyConfidenceDecay(userId);
```

## UI Contract
- Confidence badges subtly reflect analytics influence
- Tooltips explain confidence shifts ("why this changed")
- Analytics panels respect confidence gating
- No alerts, no nags, no forced review
- Corrections dashboard remains the control surface

## Future Enhancements
- UI components to display confidence badges
- Tooltips showing confidence history
- Scheduled job for automatic decay
- Confidence visualization in analytics dashboards


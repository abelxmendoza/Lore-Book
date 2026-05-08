# Will + Soul Integration Implementation

## Overview

This document describes the implementation of the Will (Agency) and Soul (Continuity) layers into the Lore-Keeper monolith, following the architecture blueprint.

## What Was Implemented

### 1. Will Engine Module (`apps/server/src/services/will/`)

**Purpose**: Detects moments where action != impulse (agency/will events)

**Files Created**:
- `willEngine.ts` - Main engine that processes entries to detect will events
- `willStorage.ts` - Database operations for will events
- `types.ts` - TypeScript type definitions
- `index.ts` - Module exports
- `llmRules.ts` - LLM usage constraints

**Key Features**:
- Infers impulse from emotion/identity/past patterns
- Extracts actual action from entry text
- Computes similarity between impulse and action
- Creates will events only when action != impulse (confidence > 0.6)
- Estimates cost of choosing action over impulse
- Generates meaning reflections

### 2. Continuity Aggregator Module (`apps/server/src/services/continuity/`)

**Purpose**: Computes "soul" profile - persistent patterns across time and change

**Files Created**:
- `continuityAggregator.ts` - Main aggregator that computes continuity profiles
- `continuityProfileStorage.ts` - Database operations for continuity profiles
- `continuityTypes.ts` - TypeScript type definitions

**Key Features**:
- Extracts persistent values (survive across identity shifts, emotional changes)
- Identifies recurring themes (especially during stress periods)
- Computes identity stability score
- Tracks agency metrics (density, trend)
- Detects drift flags (identity, values, agency)

### 3. Database Migrations

**Files Created**:
- `migrations/20260110_will_engine.sql` - Creates `will_events` table
- `migrations/20260110_continuity_profiles.sql` - Creates `continuity_profiles` table

**Tables**:
- `will_events`: Stores will/agency moments
- `continuity_profiles`: Stores computed soul profiles (versioned)

### 4. Engine Integration

**Modified Files**:
- `apps/server/src/services/engineRuntime/engineRegistry.ts` - Added `will` engine to registry
- `apps/server/src/services/continuity/continuityService.ts` - Added continuity profile computation and agency drift detection

**Integration Points**:
- Will Engine runs automatically when engines are triggered (after emotion/identity processing)
- Continuity Aggregator can be called on-demand or periodically
- Agency drift detection integrated into continuity analysis

### 5. API Endpoints

**Files Created**:
- `apps/server/src/routes/will.ts` - Will events API
- `apps/server/src/routes/continuityProfile.ts` - Continuity profile API

**Endpoints**:
- `GET /api/will/events` - Get will events
- `GET /api/will/agency-metrics` - Get agency metrics
- `POST /api/will/process-entry` - Manually process entry for will events
- `GET /api/continuity-profile/profile` - Get latest continuity profile
- `GET /api/continuity-profile/profile/history` - Get profile history
- `POST /api/continuity-profile/profile/compute` - Trigger profile computation

**Modified Files**:
- `apps/server/src/routes/routeRegistry.ts` - Registered new routes

## Architecture Principles

1. **Will = Signal Extracted from Behavior**: Will events are only created when action != impulse
2. **Soul = Pattern Extracted from Time**: Continuity profiles are computed, not stored directly
3. **LLM = Interpreter, Data = Ground Truth**: LLM assists but never creates ground truth
4. **Extend, Don't Replace**: All existing engines remain intact

## Usage

### Will Events

Will events are automatically detected when:
1. A new journal entry is created
2. Engines are triggered (via engine orchestrator)
3. Will Engine processes the latest entry
4. Action differs from inferred impulse (similarity < 0.6, confidence > 0.6)

### Continuity Profiles

Continuity profiles should be computed:
- Periodically (weekly/monthly) - not on every entry (too expensive)
- On-demand via API endpoint
- When user requests soul/essence insights

## Data Flow

```
New Entry Created
  ↓
Engines Triggered
  ↓
Emotion Engine → Emotion Events
Identity Engine → Identity Statements
  ↓
Will Engine → Detects action != impulse → Creates Will Event
  ↓
Continuity Analysis → Includes Agency Drift Detection
  ↓
(Periodically) Continuity Aggregator → Computes Soul Profile
```

## Key Metrics

**Will Events**:
- `agency_density`: Will events per time period
- `agency_trend`: increasing/decreasing/stable
- `last_will_event`: Timestamp of most recent will event

**Continuity Profile**:
- `persistent_values`: Values that survive across change
- `recurring_themes`: Themes that recur under stress
- `identity_stability_score`: 0-1 score of identity consistency
- `drift_flags`: Indicators of identity/values/agency drift

## Next Steps (Optional Enhancements)

1. **Enhanced Value Extraction**: Use LLM to extract values more accurately
2. **Theme Clustering**: Use embeddings for better theme similarity
3. **Past Pattern Analysis**: Load actual behavioral patterns for impulse inference
4. **UI Integration**: Display will events and continuity profiles in frontend
5. **Periodic Jobs**: Schedule continuity profile computation

## Testing

To test the implementation:

1. **Create a journal entry** that shows agency (action != impulse)
2. **Check will events**: `GET /api/will/events`
3. **Compute continuity profile**: `POST /api/continuity-profile/profile/compute`
4. **View profile**: `GET /api/continuity-profile/profile`

## Notes

- Will Engine uses LLM for impulse/action inference - ensure OpenAI API key is configured
- Continuity Aggregator is computationally expensive - use sparingly
- All data is user-scoped with RLS policies
- Migrations must be run before using the features

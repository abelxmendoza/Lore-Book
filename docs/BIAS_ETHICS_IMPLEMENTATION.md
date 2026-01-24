# Bias Detection & Ethics Review Implementation

## Overview

Implementation of Phase 2 (Bias & Ethics) from the Life Story Challenges Solution document. This system addresses fundamental challenges in biography and autobiography writing by detecting bias, reviewing entries for potential harm, and tracking consent.

## Database Schema

**Migration**: `migrations/20250322_bias_ethics_system.sql`

### Tables Created

1. **bias_detections** - Stores detected biases in journal entries
2. **ethics_reviews** - Reviews entries for potential harm before publication
3. **consent_records** - Tracks consent from subjects mentioned in entries
4. **publication_versions** - Manages different versions of publications
5. **memory_reliability_scores** - Scores memory reliability
6. **retelling_groups** - Groups entries that retell the same event
7. **meaning_emergence** - Tracks when events become meaningful
8. **context_prompts** - Prompts user to add missing context

## Services Implemented

### 1. Bias Detection Service (`biasDetectionService.ts`)

**Location**: `apps/server/src/services/biasDetection/biasDetectionService.ts`

**Features**:
- Detects self-serving bias (making oneself look good)
- Detects protective bias (protecting reputation)
- Detects cultural bias (cultural lens filtering)
- Detects temporal bias (present perspective on past)
- Detects emotional bias (negativity/positivity skew)

**Methods**:
- `detectBiases(userId, entry)` - Detect all biases in an entry
- `getBiasesForEntry(userId, entryId)` - Get biases for an entry
- `getUserBiases(userId, limit)` - Get all biases for a user

**Detection Methods**:
- Pattern matching for common bias indicators
- LLM analysis for nuanced detection
- Emotional pattern analysis from recent entries

### 2. Ethics Review Service (`ethicsReviewService.ts`)

**Location**: `apps/server/src/services/ethicsReview/ethicsReviewService.ts`

**Features**:
- Analyzes entries for potential harm to subjects
- Suggests actions (redact, anonymize, delay publication, get consent)
- Tracks review status

**Methods**:
- `reviewEntry(userId, entry)` - Review an entry for ethics
- `getReviewForEntry(userId, entryId)` - Get review for an entry
- `updateReviewStatus(userId, reviewId, status, notes)` - Update review status
- `getPendingReviews(userId)` - Get all pending reviews

**Harm Types Detected**:
- Reputation harm
- Privacy harm
- Emotional harm
- Legal harm

### 3. Consent Tracking Service (`consentTrackingService.ts`)

**Location**: `apps/server/src/services/consentTracking/consentTrackingService.ts`

**Features**:
- Tracks consent for inclusion, publication, sensitive content, quotes, photos
- Checks if entries can be published based on consent
- Manages consent expiration and revocation

**Methods**:
- `recordConsent(userId, subjectName, consentType, status, options)` - Record consent
- `getConsent(userId, subjectName, consentType)` - Get consent status
- `canPublishEntry(userId, entryId)` - Check if entry can be published
- `getUserConsents(userId, status)` - Get all consents for user
- `revokeConsent(userId, consentId)` - Revoke consent

**Consent Types**:
- `inclusion` - Can be mentioned
- `publication` - Can be published
- `sensitive_content` - Can include sensitive content
- `quotes` - Can be quoted
- `photos` - Can include photos

### 4. Memory Reliability Service (`memoryReliabilityService.ts`)

**Location**: `apps/server/src/services/memoryReliability/memoryReliabilityService.ts`

**Features**:
- Scores memory reliability based on multiple factors
- Calculates temporal distance penalty
- Accounts for emotional state at time of recording
- Tracks retelling count
- Measures consistency with cross-references

**Methods**:
- `calculateReliability(userId, entry)` - Calculate and store reliability score
- `getReliabilityScore(userId, entryId)` - Get reliability score for entry

**Reliability Factors**:
- Temporal distance (days between event and recording)
- Emotional state (trauma, stress, calm, euphoria, neutral)
- Retelling count (how many times story was retold)
- Cross-reference consistency (agreement with other entries)

**Scoring Formula**:
```
reliability = 1.0 - temporal_penalty - emotional_penalty - retelling_penalty + consistency_bonus
```

## API Endpoints

**Base Path**: `/api/bias-ethics`

### Bias Detection

- `GET /bias/:entryId` - Get bias detections for an entry
- `POST /bias/detect/:entryId` - Detect biases in an entry
- `GET /bias` - Get all bias detections for user

### Ethics Review

- `GET /ethics/:entryId` - Get ethics review for an entry
- `POST /ethics/review/:entryId` - Review an entry for ethics
- `PUT /ethics/:reviewId/status` - Update review status
- `GET /ethics/pending` - Get pending reviews

### Consent Tracking

- `POST /consent` - Record consent
- `GET /consent` - Get consent records
- `GET /consent/check/:entryId` - Check if entry can be published
- `PUT /consent/:consentId/revoke` - Revoke consent

### Memory Reliability

- `GET /reliability/:entryId` - Get reliability score for an entry
- `POST /reliability/calculate/:entryId` - Calculate reliability score

## Integration Points

### Automatic Detection

These services can be integrated into the entry creation/update flow:

1. **After Entry Creation**:
   ```typescript
   // In entry creation handler
   await biasDetectionService.detectBiases(userId, entry);
   await ethicsReviewService.reviewEntry(userId, entry);
   await memoryReliabilityService.calculateReliability(userId, entry);
   ```

2. **Before Publication**:
   ```typescript
   // Before generating biography or publishing
   const consentCheck = await consentTrackingService.canPublishEntry(userId, entryId);
   if (!consentCheck.can_publish) {
     // Show warnings or block publication
   }
   ```

### UI Integration

The frontend can:
- Show bias warnings when viewing entries
- Display ethics review status
- Show consent status for mentioned people
- Display memory reliability scores
- Prompt for missing consent before publication

## Next Steps

### Phase 3: Memory Reliability (Partially Complete)
- ✅ Memory reliability scoring
- ⏳ Trauma-aware processing (needs enhancement)
- ⏳ Retelling detection (needs enhancement)
- ⏳ Cross-reference validation (needs enhancement)

### Phase 4: Context & Meaning
- ⏳ Context prompting system
- ⏳ Meaning emergence tracking
- ⏳ Retrospective significance detection

### Phase 5: Journal Quality
- ⏳ Mood bias correction
- ⏳ Signal-to-noise analysis
- ⏳ Theme extraction

## Usage Examples

### Detect Bias in Entry

```typescript
const result = await biasDetectionService.detectBiases(userId, entry);
if (result.bias_detected) {
  console.log('Biases detected:', result.biases);
  console.log('Suggested questions:', result.biases[0].suggested_questions);
}
```

### Review Entry for Ethics

```typescript
const review = await ethicsReviewService.reviewEntry(userId, entry);
if (review.potential_harm.length > 0) {
  console.log('Potential harm detected:', review.potential_harm);
  console.log('Suggested actions:', review.suggested_actions);
}
```

### Check Publication Consent

```typescript
const check = await consentTrackingService.canPublishEntry(userId, entryId);
if (!check.can_publish) {
  console.log('Missing consents:', check.missing_consents);
  // Prompt user to get consent
}
```

### Calculate Memory Reliability

```typescript
const score = await memoryReliabilityService.calculateReliability(userId, entry);
console.log('Reliability score:', score.reliability_score);
console.log('Factors:', score.factors);
```

## Notes

- All services use RLS (Row Level Security) for data protection
- Services are designed to be non-destructive (preserve all data)
- LLM analysis is optional and falls back to pattern matching
- All timestamps are stored in ISO format
- Services are idempotent (can be called multiple times safely)

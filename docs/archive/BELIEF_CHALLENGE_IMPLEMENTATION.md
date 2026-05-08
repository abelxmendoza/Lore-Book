# Safe Belief Challenge & Reframing Engine

## Overview

The Belief Challenge Engine allows the system to safely, gradually, and respectfully challenge harmful beliefs only when appropriate, without shame, gaslighting, or loss of trust.

## Architecture

### Folder Structure
```
apps/server/src/services/conversationCentered/beliefChallenge/
├── types.ts                          # Type definitions
├── beliefEligibilityService.ts       # HARD SAFETY LOCK
├── beliefEvaluator.ts                # Pattern intelligence
├── beliefChallengeGenerator.ts        # Language generation
├── beliefConfidenceUpdater.ts        # Confidence updates
└── index.ts                          # Public interface
```

## Components

### 1. Types (`types.ts`)

Defines core types:
- `BeliefRiskLevel`: 'low' | 'medium' | 'high'
- `BeliefChallengeEligibility`: Eligibility result with reason and risk level
- `BeliefChallengeStyle`: 'gentle' | 'curious' | 'reflective'
- `BeliefChallenge`: Challenge prompt with style
- `BeliefEvaluation`: Pattern analysis (repetition, reward correlation, contradictions)

### 2. Belief Eligibility Service (`beliefEligibilityService.ts`)

**HARD SAFETY LOCK** - Nothing bypasses this file.

**Absolute Blocks:**
- ❌ Shame + Isolation state (highest risk)
- ❌ Dependency fear present (high risk)
- ❌ Low confidence beliefs (< 0.3) - epistemically fragile
- ❌ Relational strain + low confidence (< 0.5)
- ❌ Beliefs less than 7 days old (too recent)

**Rules:**
- If eligibility is `false`, do NOT generate a challenge
- Risk levels guide decision-making
- Age gate prevents premature challenges

### 3. Belief Evaluator (`beliefEvaluator.ts`)

Evaluates beliefs for patterns that indicate gentle exploration might be helpful:

- **Repetition Count**: How many times this belief pattern has appeared (same subject, last 90 days)
- **Reward Correlation**: Average reward from actions influenced by this belief (-1.0 to 1.0)
- **Contradicting Evidence**: Count of journal entries that explicitly contradict this perception

**Evaluation Criteria:**
- Challenge if `repetitionCount > 2` (belief is repeated)
- Challenge if `rewardCorrelation < -0.3` (belief leads to negative outcomes)
- Challenge if `contradictingEvidenceCount > 0` (evidence contradicts belief)

### 4. Belief Challenge Generator (`beliefChallengeGenerator.ts`)

Generates gentle, curious, or reflective challenges.

**Styles:**
- **gentle**: "I might be wrong, but can we look at this gently together?"
- **curious**: "Can I ask something, just to understand better?"
- **reflective**: "I'm noticing a pattern here. How does this belief affect how you see yourself?"

**Principles:**
- 🚫 No confrontation
- 🚫 No correction
- 🚫 No authority
- ✅ Collaborative exploration
- ✅ Question-based understanding
- ✅ Pattern-noticing reflection

### 5. Belief Confidence Updater (`beliefConfidenceUpdater.ts`)

Safely updates belief confidence based on signals.

**Rules:**
- Confidence stays between 0.1 and 0.8 (never becomes "fact", never drops to zero)
- Small increments (0.05 for reinforced, -0.05 for questioned, -0.1 for contradicted)
- Prevents sudden changes

**Signals:**
- `reinforced`: Belief is reinforced by new evidence (+0.05)
- `questioned`: Belief is questioned by user (-0.05)
- `contradicted`: Belief is contradicted by evidence (-0.1)

## Integration

### Integration Point: `omegaChatService.ts`

**Location:** After ResponseSafetyService, before response generation

**Flow:**
1. Check if safety context allows belief challenges (no shame, no isolation, no dependency fear)
2. Get recent perceptions (last 5, non-retracted)
3. Filter to perceptions older than 7 days with confidence >= 0.3
4. For each eligible perception:
   - Check eligibility via `isBeliefChallengeAllowed()`
   - If eligible, evaluate the belief
   - If evaluation shows need (repetition > 2, negative reward, or contradictions):
     - Generate challenge
     - Inject into system prompt as **OPTIONAL** exploration
5. Limit to 1 challenge per conversation to avoid overwhelming

**Example Integration:**
```typescript
// BELIEF CHALLENGE: Check if we can safely challenge a belief
if (safetyContext && !safetyContext.hasShame && !safetyContext.hasIsolationLanguage && !safetyContext.hasDependencyFear) {
  const recentPerceptions = await perceptionService.getPerceptionEntries(userId, {
    limit: 5,
    retracted: false,
  });

  const eligiblePerceptions = recentPerceptions.filter(p => {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays >= 7 && p.confidence_level >= 0.3;
  });

  for (const perception of eligiblePerceptions.slice(0, 2)) {
    const eligibility = isBeliefChallengeAllowed(perception, safetyContext);
    
    if (eligibility.eligible) {
      const evaluation = await evaluateBelief(userId, perception.id);
      
      if (evaluation.repetitionCount > 2 || evaluation.rewardCorrelation < -0.3 || evaluation.contradictingEvidenceCount > 0) {
        const challenge = generateBeliefChallenge(perception, 'curious', evaluation);
        systemPrompt += `\n\n**OPTIONAL BELIEF EXPLORATION**: ${challenge.challengePrompt}\n`;
        break; // Only one challenge per conversation
      }
    }
  }
}
```

## Safety Guarantees

✅ **No Shaming**: Challenges are collaborative, not confrontational
✅ **No Gaslighting**: System acknowledges beliefs as valid, just explores them
✅ **No Forced Reframes**: Challenges are optional, only if conversation naturally flows
✅ **No Belief Ossification**: Confidence updates prevent beliefs from becoming rigid
✅ **No Unsafe Timing**: Hard safety locks prevent challenges during vulnerable states

## Example Flow

**Scenario:** User has belief "My family disrespects me for not working with my hands" (repeated 3 times, created 10 days ago, confidence 0.4)

1. **Safety Check**: User is not in shame/isolation/dependency fear state ✅
2. **Eligibility Check**: 
   - Age: 10 days > 7 days ✅
   - Confidence: 0.4 >= 0.3 ✅
   - No safety blocks ✅
3. **Evaluation**:
   - Repetition: 3 > 2 ✅
   - Reward correlation: -0.2 (slightly negative)
   - Contradictions: 0
4. **Challenge Generated**:
   - Style: 'curious'
   - Prompt: "Can I ask something, just to understand better? You've mentioned this a few times — do you feel it's always true, or are there moments when it might not be?"
5. **System Prompt Injection**: Added as optional exploration, only if conversation naturally allows

## Future Enhancements

1. **Belief → Action Causal Graphs**: Visualize how beliefs influence actions
2. **Belief Drift Visualization**: Track how beliefs evolve over time
3. **UI Belief Review Flow**: Allow users to review and reflect on beliefs
4. **RL Reward Shaping**: Use belief correction outcomes to shape RL rewards

## Testing

To test the belief challenge system:

1. Create a perception entry with:
   - Age > 7 days
   - Confidence >= 0.3
   - Repeated 3+ times (or has negative reward correlation, or has contradictions)

2. Send a chat message when NOT in shame/isolation/dependency fear state

3. Check logs for: `Generated belief challenge`

4. Verify response includes optional belief exploration (if conversation naturally allows)

## Notes

- Belief challenges are **optional** - they only appear if the conversation naturally flows that way
- System respects user autonomy - never forces exploration
- Challenges are gentle, curious, or reflective - never confrontational
- Hard safety locks prevent unsafe timing
- Confidence updates are gradual to prevent sudden changes

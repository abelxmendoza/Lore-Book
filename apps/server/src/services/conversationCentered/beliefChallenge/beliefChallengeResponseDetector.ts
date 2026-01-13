// =====================================================
// BELIEF CHALLENGE RESPONSE DETECTOR
// Purpose: Detects user responses to belief challenges and updates confidence
// =====================================================

import { logger } from '../../../logger';
import { updateBeliefConfidence, type ConfidenceSignal } from './beliefConfidenceUpdater';

export type ChallengeResponseType = 'questioned' | 'reinforced' | 'contradicted' | 'neutral' | 'unclear';

/**
 * Detect how user responded to a belief challenge
 * 
 * @param userMessage User's response message
 * @param challengePrompt The challenge prompt that was presented
 * @returns Response type indicating how belief was affected
 */
export function detectChallengeResponse(
  userMessage: string,
  challengePrompt?: string
): ChallengeResponseType {
  const lowerMessage = userMessage.toLowerCase().trim();

  // Indicators of questioning/challenging the belief
  const questioningPatterns = [
    /\b(maybe|perhaps|possibly|might|could be|not sure|uncertain|don't know|unclear)\b/i,
    /\b(you're right|that's true|good point|i see|i hadn't thought|never considered)\b/i,
    /\b(sometimes|not always|depends|varies|different|changes)\b/i,
    /\b(i guess|i suppose|maybe not|perhaps not|could be wrong)\b/i,
  ];

  // Indicators of reinforcing the belief
  const reinforcingPatterns = [
    /\b(always|never|every time|consistently|definitely|absolutely|for sure|certainly)\b/i,
    /\b(that's exactly|you don't understand|you're wrong|no|that's not true)\b/i,
    /\b(i know|i'm sure|i'm certain|no doubt|without question)\b/i,
  ];

  // Indicators of contradicting the belief
  const contradictingPatterns = [
    /\b(actually|wait|no|that's wrong|incorrect|not true|false|mistaken)\b/i,
    /\b(i was wrong|i made a mistake|i misremembered|i misunderstood)\b/i,
    /\b(that never happened|that's not what happened|that's incorrect)\b/i,
  ];

  // Check for questioning
  if (questioningPatterns.some(pattern => pattern.test(lowerMessage))) {
    return 'questioned';
  }

  // Check for reinforcing
  if (reinforcingPatterns.some(pattern => pattern.test(lowerMessage))) {
    return 'reinforced';
  }

  // Check for contradicting
  if (contradictingPatterns.some(pattern => pattern.test(lowerMessage))) {
    return 'contradicted';
  }

  // Check for neutral/acknowledgment (doesn't change belief)
  const neutralPatterns = [
    /\b(ok|okay|sure|got it|i see|thanks|thank you|alright)\b/i,
  ];

  if (neutralPatterns.some(pattern => pattern.test(lowerMessage)) && lowerMessage.length < 20) {
    return 'neutral';
  }

  // Default to unclear if we can't determine
  return 'unclear';
}

/**
 * Process belief challenge response and update confidence
 * 
 * @param userId User ID
 * @param perceptionId Perception that was challenged
 * @param userMessage User's response message
 * @param challengePrompt Optional challenge prompt that was presented
 */
export async function processChallengeResponse(
  userId: string,
  perceptionId: string,
  userMessage: string,
  challengePrompt?: string
): Promise<void> {
  try {
    const responseType = detectChallengeResponse(userMessage, challengePrompt);

    // Map response type to confidence signal
    let signal: ConfidenceSignal | null = null;

    switch (responseType) {
      case 'questioned':
        signal = 'questioned';
        break;
      case 'reinforced':
        signal = 'reinforced';
        break;
      case 'contradicted':
        signal = 'contradicted';
        break;
      case 'neutral':
      case 'unclear':
        // Don't update confidence for neutral/unclear responses
        logger.debug(
          { perceptionId, userId, responseType },
          'Challenge response was neutral/unclear, not updating confidence'
        );
        return;
    }

    if (signal) {
      await updateBeliefConfidence(userId, perceptionId, signal);
      logger.info(
        { perceptionId, userId, signal, responseType },
        'Updated belief confidence based on challenge response'
      );
    }
  } catch (error) {
    logger.error(
      { error, perceptionId, userId },
      'Failed to process challenge response'
    );
  }
}

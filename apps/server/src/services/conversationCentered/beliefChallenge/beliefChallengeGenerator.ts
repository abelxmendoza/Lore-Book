// =====================================================
// BELIEF CHALLENGE GENERATOR
// Purpose: Generates gentle, curious, or reflective challenges to beliefs
// 🚫 No confrontation, no correction, no authority
// =====================================================

import { logger } from '../../../logger';

import type { BeliefChallenge, BeliefChallengeStyle } from './types';

export type PerceptionForChallenge = {
  id: string;
  content: string;
  subject_alias?: string;
};

/**
 * Generate a belief challenge prompt
 * 
 * Styles:
 * - gentle: Soft, collaborative exploration
 * - curious: Question-based, understanding-focused
 * - reflective: Pattern-noticing, self-reflection
 * 
 * @param perception The perception to challenge
 * @param style The challenge style
 * @param evaluation Optional evaluation data to inform the challenge
 * @returns Challenge prompt
 */
export function generateBeliefChallenge(
  perception: PerceptionForChallenge,
  style: BeliefChallengeStyle,
  evaluation?: {
    repetitionCount: number;
    rewardCorrelation: number;
    contradictingEvidenceCount: number;
  }
): BeliefChallenge {
  let prompt = '';

  switch (style) {
    case 'gentle':
      prompt = `I might be wrong, but can we look at this gently together? `;
      if (perception.subject_alias) {
        prompt += `You've mentioned that ${perception.subject_alias} ${perception.content.toLowerCase()}. `;
      } else {
        prompt += `You've mentioned that ${perception.content.toLowerCase()}. `;
      }
      prompt += `I'm curious - has there ever been a time when this felt different, or when you saw it another way?`;
      break;

    case 'curious':
      if (evaluation && evaluation.repetitionCount > 2) {
        prompt = `Can I ask something, just to understand better? `;
        prompt += `You've mentioned this a few times — do you feel it's always true, or are there moments when it might not be?`;
      } else {
        prompt = `I'm curious about something. `;
        if (perception.subject_alias) {
          prompt += `You've said that ${perception.subject_alias} ${perception.content.toLowerCase()}. `;
        } else {
          prompt += `You've said that ${perception.content.toLowerCase()}. `;
        }
        prompt += `What makes you feel that way?`;
      }
      break;

    case 'reflective':
      prompt = `I'm noticing a pattern here. `;
      if (perception.subject_alias) {
        prompt += `You've mentioned a few times that ${perception.subject_alias} ${perception.content.toLowerCase()}. `;
      } else {
        prompt += `You've mentioned a few times that ${perception.content.toLowerCase()}. `;
      }
      prompt += `How does this belief affect how you see yourself, or how you interact with others?`;
      break;
  }

  logger.debug(
    { perceptionId: perception.id, style, promptLength: prompt.length },
    'Generated belief challenge'
  );

  return {
    perceptionId: perception.id,
    challengePrompt: prompt,
    style,
  };
}

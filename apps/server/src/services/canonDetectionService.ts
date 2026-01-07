// =====================================================
// CANON DETECTION SERVICE (PHASE 3.6)
// Purpose: Classify canon status with conservative defaults
// Note: Default is CANON unless strong signal detected
// =====================================================

import { logger } from '../logger';
import type { CanonStatus, CanonMetadata } from './compiler/types';

export class CanonDetectionService {
  /**
   * Classify canon status (Phase 3.6)
   * Conservative by design: default is CANON unless strong signal detected
   */
  classifyCanon(text: string): CanonMetadata {
    const lowerText = text.toLowerCase().trim();

    // ROLEPLAY patterns
    const roleplayPatterns = [
      /\b(let's pretend|let us pretend)\b/i,
      /\b(roleplay|role play|rp)\b/i,
      /\b(i'm playing|i am playing|playing a character|acting as)\b/i,
      /\b(in character|out of character|ooc|ic)\b/i,
      /\b(pretend that|pretend we|pretend i)\b/i,
    ];

    if (roleplayPatterns.some(pattern => pattern.test(text))) {
      return {
        status: 'ROLEPLAY',
        source: 'SYSTEM',
        confidence: 0.8,
        classified_at: new Date().toISOString(),
      };
    }

    // HYPOTHETICAL patterns
    const hypotheticalPatterns = [
      /\b(what if|what if i|what if we|what if they)\b/i,
      /\b(imagine if|imagine that|imagine i|imagine we)\b/i,
      /\b(suppose that|suppose i|suppose we)\b/i,
      /\b(if i were|if we were|if they were)\b/i,
      /\b(scenario where|scenario in which)\b/i,
      /\b(hypothetically|hypothetical|hypothetical scenario)\b/i,
    ];

    if (hypotheticalPatterns.some(pattern => pattern.test(text))) {
      return {
        status: 'HYPOTHETICAL',
        source: 'SYSTEM',
        confidence: 0.7,
        classified_at: new Date().toISOString(),
      };
    }

    // FICTIONAL patterns (creative writing indicators)
    const fictionalPatterns = [
      /\b(once upon a time|in a world|in a land)\b/i,
      /\b(the protagonist|the hero|the villain)\b/i,
      /\b(chapter \d+|part \d+|act \d+)\b/i,
      /\b(he said|she said|they said)\b/i, // Third person narrative
      /\b(dialogue markers|quotation-heavy)\b/i,
    ];

    // Check for third-person narrative (strong fiction signal)
    const thirdPersonPronouns = /\b(he|she|they|him|her|them|his|hers|theirs)\b/gi;
    const firstPersonPronouns = /\b(i|me|my|mine|we|us|our|ours)\b/gi;
    const thirdPersonCount = (text.match(thirdPersonPronouns) || []).length;
    const firstPersonCount = (text.match(firstPersonPronouns) || []).length;

    // If significantly more third-person than first-person, likely fiction
    if (thirdPersonCount > firstPersonCount * 2 && thirdPersonCount > 3) {
      return {
        status: 'FICTIONAL',
        source: 'SYSTEM',
        confidence: 0.7,
        classified_at: new Date().toISOString(),
      };
    }

    if (fictionalPatterns.some(pattern => pattern.test(text))) {
      return {
        status: 'FICTIONAL',
        source: 'SYSTEM',
        confidence: 0.7,
        classified_at: new Date().toISOString(),
      };
    }

    // THOUGHT_EXPERIMENT patterns
    const thoughtExperimentPatterns = [
      /\b(thought experiment|philosophically|philosophical)\b/i,
      /\b(abstract reasoning|theoretical|in theory)\b/i,
      /\b(conceptual|conceptually|philosophy)\b/i,
    ];

    if (thoughtExperimentPatterns.some(pattern => pattern.test(text))) {
      return {
        status: 'THOUGHT_EXPERIMENT',
        source: 'SYSTEM',
        confidence: 0.7,
        classified_at: new Date().toISOString(),
      };
    }

    // META patterns (talking about the system)
    const metaPatterns = [
      /\b(how does lorekeeper|how does the system|the system does|the bot does)\b/i,
      /\b(lorekeeper should|lorekeeper can|lorekeeper will)\b/i,
      /\b(update the system|change the system|system behavior)\b/i,
      /\b(meta|talking about lorekeeper|about this app)\b/i,
    ];

    if (metaPatterns.some(pattern => pattern.test(text))) {
      return 'META';
    }

    // No clear signal - return null (defaults to CANON)
    return null;
  }

  /**
   * Determine final canon status with user override (Phase 3.6)
   * User override always wins and is auditable
   */
  determineCanonStatus(
    text: string,
    userOverride?: CanonStatus
  ): CanonMetadata {
    // User override always wins
    if (userOverride) {
      return {
        status: userOverride,
        source: 'USER',
        confidence: 1.0, // User override is always certain
        classified_at: new Date().toISOString(),
        overridden_at: new Date().toISOString(),
      };
    }

    // Try heuristic classification
    const classified = this.classifyCanon(text);
    logger.debug(
      { status: classified.status, confidence: classified.confidence, textLength: text.length },
      'Classified canon status'
    );
    return classified;
  }

  /**
   * Override canon status (user-initiated, auditable)
   */
  overrideCanon(
    entryId: string,
    status: CanonStatus,
    userId: string
  ): CanonMetadata {
    logger.info({ entryId, status, userId }, 'User overriding canon status');

    return {
      status,
      source: 'USER',
      confidence: 1.0,
      classified_at: new Date().toISOString(),
      overridden_at: new Date().toISOString(),
    };
  }
}

export const canonDetectionService = new CanonDetectionService();


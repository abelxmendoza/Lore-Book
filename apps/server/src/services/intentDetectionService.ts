// =====================================================
// INTENT DETECTION SERVICE
// Purpose: Detect user intent from messages
// =====================================================

import { logger } from '../logger';

export type UserIntent =
  | 'VENTING'
  | 'REFLECTION'
  | 'SOCIAL_DISCUSSION'
  | 'FACTUAL_RECALL'
  | 'STRATEGIC_THINKING'
  | 'PATTERN_INQUIRY'
  | 'CASUAL_CHAT';

interface IntentContext {
  message: string;
  lowFactDensity?: boolean;
  recentTopics?: string[];
}

export class IntentDetectionService {
  /**
   * Detect user intent from message and context
   */
  detectUserIntent(message: string, context?: IntentContext): UserIntent {
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(/\s+/);

    // VENTING: Strong emotion + low fact density
    if (this.containsStrongEmotion(message) && (context?.lowFactDensity ?? true)) {
      return 'VENTING';
    }

    // REFLECTION: Processing feelings or experiences
    if (
      lowerMessage.includes('why do i feel') ||
      lowerMessage.includes('why do i think') ||
      lowerMessage.includes('i feel') ||
      lowerMessage.includes('i think') ||
      lowerMessage.includes('i wonder') ||
      lowerMessage.includes('processing') ||
      lowerMessage.includes('reflecting') ||
      this.isReflective(message)
    ) {
      return 'REFLECTION';
    }

    // SOCIAL_DISCUSSION: People dynamics, gossip, relationships
    if (
      lowerMessage.includes('gossip') ||
      lowerMessage.includes('relationship') ||
      lowerMessage.includes('dynamic') ||
      lowerMessage.includes('between') ||
      lowerMessage.includes('and') && this.referencesPeople(message) ||
      this.isGossipLanguage(message)
    ) {
      return 'SOCIAL_DISCUSSION';
    }

    // FACTUAL_RECALL: What happened, when, who
    if (
      lowerMessage.includes('what happened') ||
      lowerMessage.includes('when did') ||
      lowerMessage.includes('who was') ||
      lowerMessage.includes('tell me about') ||
      lowerMessage.includes('what did') ||
      lowerMessage.startsWith('when') ||
      lowerMessage.startsWith('who')
    ) {
      return 'FACTUAL_RECALL';
    }

    // STRATEGIC_THINKING: Planning, decisions, tradeoffs
    if (
      lowerMessage.includes('should i') ||
      lowerMessage.includes('decision') ||
      lowerMessage.includes('plan') ||
      lowerMessage.includes('strategy') ||
      lowerMessage.includes('tradeoff') ||
      lowerMessage.includes('choose') ||
      lowerMessage.includes('goal')
    ) {
      return 'STRATEGIC_THINKING';
    }

    // PATTERN_INQUIRY: Noticing themes or repetition
    if (
      lowerMessage.includes('pattern') ||
      lowerMessage.includes('notice') ||
      lowerMessage.includes('theme') ||
      lowerMessage.includes('recurring') ||
      lowerMessage.includes('keep happening') ||
      lowerMessage.includes('always') ||
      lowerMessage.includes('tend to')
    ) {
      return 'PATTERN_INQUIRY';
    }

    // Default to casual chat
    return 'CASUAL_CHAT';
  }

  /**
   * Check if message contains strong emotion
   */
  private containsStrongEmotion(message: string): boolean {
    const emotionalWords = [
      'frustrated',
      'angry',
      'sad',
      'upset',
      'annoyed',
      'disappointed',
      'excited',
      'happy',
      'worried',
      'anxious',
      'stressed',
      'overwhelmed',
      '!!!',
      '??',
    ];

    const lowerMessage = message.toLowerCase();
    return emotionalWords.some(word => lowerMessage.includes(word));
  }

  /**
   * Check if message is reflective
   */
  private isReflective(message: string): boolean {
    const reflectivePhrases = [
      'i wonder',
      'i think',
      'i feel',
      'i realize',
      'i notice',
      'makes me think',
      'makes me feel',
      'i\'m processing',
      'i\'m reflecting',
    ];

    const lowerMessage = message.toLowerCase();
    return reflectivePhrases.some(phrase => lowerMessage.includes(phrase));
  }

  /**
   * Check if message references people
   */
  private referencesPeople(message: string): boolean {
    const peopleWords = [
      'person',
      'people',
      'friend',
      'colleague',
      'they',
      'them',
      'he',
      'she',
      'relationship',
      'dynamic',
    ];

    const lowerMessage = message.toLowerCase();
    return peopleWords.some(word => lowerMessage.includes(word));
  }

  /**
   * Check if message uses gossip language
   */
  private isGossipLanguage(message: string): boolean {
    const gossipPhrases = [
      'heard',
      'rumor',
      'gossip',
      'they said',
      'apparently',
      'supposedly',
      'i heard that',
    ];

    const lowerMessage = message.toLowerCase();
    return gossipPhrases.some(phrase => lowerMessage.includes(phrase));
  }
}

export const intentDetectionService = new IntentDetectionService();


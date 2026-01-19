// =====================================================
// INTEREST DETECTOR
// Purpose: Detect and extract interests from conversations
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';
import { supabaseAdmin } from '../supabaseClient';

export interface DetectedInterest {
  interest_name: string;
  interest_category?: string; // e.g., 'hobby', 'career', 'entertainment', 'learning', 'social', 'creative', 'physical', 'intellectual', 'other'
  confidence: number; // 0-1
  emotional_intensity: number; // 0-1
  sentiment: number; // -1 to +1
  evidence: string; // Quote from text
  context?: string; // Additional context about the interest
  action_taken?: boolean; // Did they do something related?
  action_type?: string; // 'purchase', 'research', 'join', 'learn', 'create', 'share', 'discuss'
  influence_on_decision?: boolean; // Did this interest influence a decision?
  knowledge_depth?: 'surface' | 'moderate' | 'deep' | 'expert'; // Depth of knowledge shown
  time_investment_minutes?: number; // Estimated time spent
}

export interface InterestMention {
  interest_id: string;
  source_entry_id?: string;
  source_message_id?: string;
  mention_text: string;
  emotional_intensity: number;
  sentiment: number;
  word_count: number;
  time_spent_minutes?: number;
  mentioned_with_people?: string[];
  mentioned_at_location?: string;
  related_events?: string[];
  action_taken: boolean;
  action_type?: string;
  influence_on_decision: boolean;
  metadata?: Record<string, unknown>;
}

export class InterestDetector {
  /**
   * Detect interests from text using LLM
   */
  async detectInterests(
    userId: string,
    content: string,
    entryId?: string,
    messageId?: string
  ): Promise<DetectedInterest[]> {
    try {
      const { openai } = await import('../../services/openaiClient');
      
      const prompt = `Analyze this text and detect any interests, passions, hobbies, or topics the person is interested in. Return JSON only, no markdown.

Text: "${content}"

Look for:
1. Explicit interests: "I'm interested in...", "I love...", "I'm passionate about...", "I'm into..."
2. Implicit interests: Deep discussion, questions, research, purchases, joining groups
3. Behavioral signals: Actions taken related to interest (buying, researching, learning, creating)
4. Decision influence: "Because I love X, I decided to..." or "My interest in X led me to..."
5. Knowledge depth: How much they know about the topic (surface mention vs deep discussion)

For each interest detected, extract:
- interest_name: The name of the interest (e.g., "photography", "machine learning", "cooking")
- interest_category: One of: hobby, career, entertainment, learning, social, creative, physical, intellectual, other
- confidence: 0.0-1.0 (how confident you are this is actually an interest)
- emotional_intensity: 0.0-1.0 (how passionate/excited they seem about it)
- sentiment: -1.0 to +1.0 (negative to positive feeling about it)
- evidence: A short quote from the text showing the interest
- context: Additional context about the interest if mentioned
- action_taken: true if they did something related (bought, researched, joined, learned, created)
- action_type: Type of action if action_taken is true
- influence_on_decision: true if the interest influenced a decision
- knowledge_depth: surface, moderate, deep, or expert based on how much they know
- time_investment_minutes: Estimated minutes spent if mentioned or implied

Return JSON in this format:
{
  "interests": [
    {
      "interest_name": "name",
      "interest_category": "category",
      "confidence": 0.0-1.0,
      "emotional_intensity": 0.0-1.0,
      "sentiment": -1.0 to 1.0,
      "evidence": "quote",
      "context": "context or null",
      "action_taken": true/false,
      "action_type": "type or null",
      "influence_on_decision": true/false,
      "knowledge_depth": "surface|moderate|deep|expert",
      "time_investment_minutes": number or null
    }
  ]
}

If no interests found, return {"interests": []}.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an interest detection assistant. Detect interests, passions, and hobbies from text and return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"interests": []}');
      const interests: DetectedInterest[] = result.interests || [];

      // Filter by confidence threshold
      return interests.filter(i => i.confidence >= 0.5);
    } catch (error) {
      logger.error({ error, userId, content }, 'Failed to detect interests');
      return [];
    }
  }

  /**
   * Calculate interest level from a single mention
   */
  calculateInterestLevelFromMention(mention: InterestMention, interest: DetectedInterest): number {
    let score = 0.0;
    
    // Base: Emotional intensity (0-0.30)
    score += mention.emotional_intensity * 0.30;
    
    // Behavioral impact: Action taken (0-0.25)
    if (mention.action_taken) {
      score += 0.25;
      // Bonus for specific action types
      if (mention.action_type === 'purchase') score += 0.05;
      if (mention.action_type === 'learn' || mention.action_type === 'research') score += 0.05;
      if (mention.action_type === 'create') score += 0.10;
    }
    
    // Influence score: Decision influence (0-0.20)
    if (mention.influence_on_decision) {
      score += 0.20;
    }
    
    // Knowledge depth (0-0.15)
    const depthScores: Record<string, number> = {
      'surface': 0.05,
      'moderate': 0.10,
      'deep': 0.15,
      'expert': 0.15
    };
    score += depthScores[interest.knowledge_depth || 'surface'] || 0.05;
    
    // Time investment (0-0.10)
    if (mention.time_spent_minutes) {
      const hours = mention.time_spent_minutes / 60;
      score += Math.min(0.10, hours / 10); // Max 0.10 for 10+ hours
    }
    
    return Math.min(1.0, score);
  }

  /**
   * Calculate behavioral impact score for an interest
   */
  calculateBehavioralImpact(interest: DetectedInterest, allMentions: InterestMention[]): number {
    let score = 0.0;
    
    // Count actions taken
    const actionCount = allMentions.filter(m => m.action_taken).length;
    score += Math.min(0.5, actionCount / 5); // Max 0.5 for 5+ actions
    
    // Weight by action type
    const actionWeights: Record<string, number> = {
      'purchase': 0.3,
      'learn': 0.2,
      'research': 0.2,
      'join': 0.25,
      'create': 0.35,
      'share': 0.15,
      'discuss': 0.1
    };
    
    allMentions.forEach(mention => {
      if (mention.action_taken && mention.action_type) {
        score += actionWeights[mention.action_type] || 0.1;
      }
    });
    
    return Math.min(1.0, score);
  }

  /**
   * Calculate influence score for an interest
   */
  calculateInfluenceScore(interest: DetectedInterest, allMentions: InterestMention[]): number {
    let score = 0.0;
    
    // Count decision influences
    const influenceCount = allMentions.filter(m => m.influence_on_decision).length;
    score += Math.min(0.6, influenceCount / 3); // Max 0.6 for 3+ influences
    
    // Sentiment impact (strong positive or negative = influence)
    const avgSentiment = allMentions.reduce((sum, m) => sum + m.sentiment, 0) / allMentions.length;
    score += Math.abs(avgSentiment) * 0.2; // Strong feelings = influence
    
    // Emotional intensity (passion = influence)
    const avgIntensity = allMentions.reduce((sum, m) => sum + m.emotional_intensity, 0) / allMentions.length;
    score += avgIntensity * 0.2;
    
    return Math.min(1.0, score);
  }

  /**
   * Calculate knowledge depth score
   */
  calculateKnowledgeDepthScore(interest: DetectedInterest, allMentions: InterestMention[]): number {
    const depthScores: Record<string, number> = {
      'surface': 0.2,
      'moderate': 0.5,
      'deep': 0.8,
      'expert': 1.0
    };
    
    // Average knowledge depth from all mentions
    const depths = allMentions.map(m => {
      const metadata = m.metadata || {};
      return depthScores[metadata.knowledge_depth as string] || 0.2;
    });
    
    if (depths.length === 0) return 0.2;
    
    const avgDepth = depths.reduce((sum, d) => sum + d, 0) / depths.length;
    
    // Boost if they show deep knowledge in multiple mentions
    const deepMentions = depths.filter(d => d >= 0.8).length;
    const boost = Math.min(0.2, deepMentions / 5);
    
    return Math.min(1.0, avgDepth + boost);
  }

  /**
   * Detect if interest influenced a decision
   */
  detectDecisionInfluence(content: string, interestName: string): boolean {
    const lowerContent = content.toLowerCase();
    const lowerInterest = interestName.toLowerCase();
    
    const influencePatterns = [
      new RegExp(`because (i|we) (love|like|enjoy|am into|am interested in) ${lowerInterest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      new RegExp(`${lowerInterest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (led|made|influenced|inspired) (me|us) to`, 'i'),
      new RegExp(`(my|our) (interest|passion|love) (for|in) ${lowerInterest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (led|made|influenced)`, 'i'),
      new RegExp(`decided to.*${lowerInterest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      new RegExp(`${lowerInterest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*(decision|choice|because)`, 'i')
    ];
    
    return influencePatterns.some(pattern => pattern.test(lowerContent));
  }

  /**
   * Normalize interest name (for unique constraint)
   */
  normalizeInterestName(name: string): string {
    // Normalize to lowercase, trim, remove extra spaces
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}

export const interestDetector = new InterestDetector();

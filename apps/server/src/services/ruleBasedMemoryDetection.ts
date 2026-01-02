import { logger } from '../logger';

/**
 * Rule-based memory detection - NO API CALLS, completely free
 * Uses pattern matching to detect memory-worthy segments in conversations
 */
class RuleBasedMemoryDetectionService {
  // Memory-worthy keyword patterns
  private readonly memoryKeywords = [
    // Past events
    /\b(yesterday|last week|last month|last year|ago|before|previously|earlier|used to|remember|recall)\b/gi,
    
    // Story progress indicators
    /\b(happened|occurred|took place|went|did|met|saw|visited|attended|participated|completed|finished|started|began)\b/gi,
    
    // Emotional weight indicators
    /\b(important|significant|meaningful|memorable|unforgettable|special|amazing|terrible|difficult|challenging|proud|grateful|thankful|blessed|worried|anxious|excited|happy|sad|angry|frustrated)\b/gi,
    
    // Relationship details
    /\b(friend|family|colleague|met|introduced|relationship|dating|married|divorced|breakup|reunion|together|with)\b/gi,
    
    // Location/place mentions
    /\b(went to|visited|traveled to|at|in|from|to|location|place|city|country|home|office|school|university)\b/gi,
    
    // Achievement/milestone indicators
    /\b(achieved|accomplished|milestone|goal|success|won|earned|graduated|promoted|award|recognition)\b/gi,
    
    // Decision markers
    /\b(decided|chose|opted|determined|resolved|planning|going to|will|intend|considering)\b/gi,
    
    // Explicit memory requests
    /\b(remember|save|log|note|journal|record|memorize|don't forget|keep in mind)\b/gi,
    
    // Time-specific events
    /\b(today|this week|this month|on|during|while|when|then|at|after|before)\b/gi,
    
    // Character mentions (capitalized names)
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  ];

  // High-confidence memory indicators (multiple = very likely memory)
  private readonly highConfidencePatterns = [
    /\b(remember|save|log|note|journal|record)\b/gi,
    /\b(important|significant|meaningful|memorable)\b/gi,
    /\b(yesterday|last week|last month|ago)\b/gi,
    /\b(met|visited|attended|completed|achieved)\b/gi,
  ];

  /**
   * Detect if conversation segment is memory-worthy
   * Returns confidence score 0-1 and detected patterns
   */
  async detectMemoryWorthy(
    content: string,
    conversationContext?: string[]
  ): Promise<{
    isMemoryWorthy: boolean;
    confidence: number;
    detectedPatterns: string[];
    reasons: string[];
  }> {
    const lowerContent = content.toLowerCase();
    const detectedPatterns: string[] = [];
    const reasons: string[] = [];
    let confidence = 0;

    // Check for explicit memory requests (highest confidence)
    if (/\b(remember|save|log|note|journal|record|memorize)\b/gi.test(content)) {
      confidence += 0.4;
      detectedPatterns.push('explicit_request');
      reasons.push('Contains explicit memory request keywords');
    }

    // Check for past events
    if (/\b(yesterday|last week|last month|ago|before|previously|earlier)\b/gi.test(content)) {
      confidence += 0.3;
      detectedPatterns.push('past_event');
      reasons.push('References past events');
    }

    // Check for emotional weight
    if (/\b(important|significant|meaningful|memorable|special|amazing|terrible|difficult|proud|grateful)\b/gi.test(content)) {
      confidence += 0.2;
      detectedPatterns.push('emotional_weight');
      reasons.push('Contains emotional or significant indicators');
    }

    // Check for relationship details
    if (/\b(friend|family|colleague|met|introduced|relationship|together|with)\b/gi.test(content)) {
      confidence += 0.15;
      detectedPatterns.push('relationship');
      reasons.push('Mentions relationships or people');
    }

    // Check for location mentions
    if (/\b(went to|visited|traveled|at|in|from|to|location|place)\b/gi.test(content)) {
      confidence += 0.1;
      detectedPatterns.push('location');
      reasons.push('References locations or places');
    }

    // Check for achievements/milestones
    if (/\b(achieved|accomplished|milestone|goal|success|won|graduated|promoted)\b/gi.test(content)) {
      confidence += 0.2;
      detectedPatterns.push('achievement');
      reasons.push('Mentions achievements or milestones');
    }

    // Check for decisions
    if (/\b(decided|chose|opted|determined|planning|going to|will|intend)\b/gi.test(content)) {
      confidence += 0.1;
      detectedPatterns.push('decision');
      reasons.push('Contains decision markers');
    }

    // Check for character names (capitalized words)
    const capitalizedWords = content.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
    if (capitalizedWords && capitalizedWords.length > 0) {
      confidence += 0.1;
      detectedPatterns.push('character_mention');
      reasons.push(`Mentions ${capitalizedWords.length} potential character(s)`);
    }

    // Boost confidence if multiple high-confidence patterns match
    let highConfidenceCount = 0;
    for (const pattern of this.highConfidencePatterns) {
      if (pattern.test(content)) {
        highConfidenceCount++;
      }
    }
    if (highConfidenceCount >= 2) {
      confidence += 0.15;
      reasons.push(`Multiple high-confidence patterns detected (${highConfidenceCount})`);
    }

    // Boost confidence if conversation context suggests memory
    if (conversationContext && conversationContext.length > 0) {
      const contextText = conversationContext.join(' ').toLowerCase();
      if (/\b(remember|save|log|note|important|significant)\b/gi.test(contextText)) {
        confidence += 0.1;
        reasons.push('Conversation context suggests memory-worthy content');
      }
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    // Consider memory-worthy if confidence >= 0.3
    const isMemoryWorthy = confidence >= 0.3;

    return {
      isMemoryWorthy,
      confidence,
      detectedPatterns: [...new Set(detectedPatterns)],
      reasons,
    };
  }

  /**
   * Extract memory-worthy segments from conversation
   * Returns array of segments with their confidence scores
   */
  async extractMemorySegments(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<Array<{
    startIndex: number;
    endIndex: number;
    content: string;
    confidence: number;
    detectedPatterns: string[];
  }>> {
    const segments: Array<{
      startIndex: number;
      endIndex: number;
      content: string;
      confidence: number;
      detectedPatterns: string[];
    }> = [];

    // Check each user message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role === 'user') {
        const detection = await this.detectMemoryWorthy(
          message.content,
          messages.slice(Math.max(0, i - 3), i).map(m => m.content)
        );

        if (detection.isMemoryWorthy) {
          // Include context from previous messages if available
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(messages.length, i + 1);
          const segmentContent = messages
            .slice(contextStart, contextEnd)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');

          segments.push({
            startIndex: contextStart,
            endIndex: contextEnd - 1,
            content: segmentContent,
            confidence: detection.confidence,
            detectedPatterns: detection.detectedPatterns,
          });
        }
      }
    }

    // Sort by confidence (highest first)
    segments.sort((a, b) => b.confidence - a.confidence);

    return segments;
  }
}

export const ruleBasedMemoryDetectionService = new RuleBasedMemoryDetectionService();


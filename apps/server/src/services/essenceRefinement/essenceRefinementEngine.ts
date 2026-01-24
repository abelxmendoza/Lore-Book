/**
 * EssenceRefinementEngine
 * Interprets natural language chat messages as refinement actions against the Soul Profile.
 * 
 * Core Principle: Chat negotiates meaning. Engines never assert truth.
 */

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { essenceProfileService, type EssenceProfile, type EssenceInsight, type SkillInsight } from '../essenceProfileService';
import { supabaseAdmin } from '../supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type RefinementIntent =
  | 'affirm'
  | 'downgrade_confidence'
  | 'reject'
  | 'time_bound'
  | 'scope_refine'
  | 'split_insight'
  | 'unclear';

export type RefinementContext = {
  lastReferencedInsightId?: string;
  lastSurfacedInsights?: Array<{
    id: string;
    category: string;
    text: string;
    confidence: number;
  }>;
  activePanel?: 'SoulProfile' | 'IdentityPulse' | 'other';
};

export type RefinementResult = {
  refinementAction?: {
    intent: RefinementIntent;
    insightId: string;
    category: string;
    metadata: {
      reason: string;
      originalText: string;
      refinementText?: string;
      temporalScope?: { validFrom?: string; validTo?: string; era?: string };
      domainScope?: string;
      confidenceChange?: number;
    };
  };
  clarificationRequest?: string;
  silentProfileUpdate?: boolean;
};

export class EssenceRefinementEngine {
  private readonly INTENT_CONFIDENCE_THRESHOLD = 0.6;
  private readonly INSIGHT_SIMILARITY_THRESHOLD = 0.7;

  /**
   * Main entry point: handle chat message for refinement
   */
  async handleChatMessage(
    userId: string,
    chatMessage: string,
    context: RefinementContext = {},
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<RefinementResult> {
    try {
      // 1. Detect refinement intent (with conversation history context)
      const intentResult = await this.detectRefinementIntent(chatMessage, conversationHistory);
      
      if (intentResult.intent === 'unclear' || intentResult.confidence < this.INTENT_CONFIDENCE_THRESHOLD) {
        // Not a refinement message, exit silently
        return { silentProfileUpdate: false };
      }

      // 2. Resolve target insight (with conversation history context)
      const insightResult = await this.resolveTargetInsight(userId, chatMessage, context, intentResult.intent, conversationHistory);
      
      if (insightResult.clarificationRequest) {
        return { clarificationRequest: insightResult.clarificationRequest };
      }

      if (!insightResult.insight) {
        // Could not resolve insight, exit silently (don't guess)
        return { silentProfileUpdate: false };
      }

      // 3. Apply refinement
      const applied = await this.applyRefinement(
        userId,
        intentResult.intent,
        insightResult.insight,
        chatMessage,
        intentResult.metadata || {}
      );

      return {
        refinementAction: {
          intent: intentResult.intent,
          insightId: insightResult.insight.id,
          category: insightResult.insight.category,
          metadata: applied.metadata
        },
        silentProfileUpdate: true
      };
    } catch (error) {
      logger.error({ error, userId }, 'Error in EssenceRefinementEngine');
      // Fail silently - never interrupt chat flow
      return { silentProfileUpdate: false };
    }
  }

  /**
   * 1. INTENT DETECTION
   * Uses LLM to classify refinement intent (with conversation history for context)
   */
  private async detectRefinementIntent(
    chatMessage: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ intent: RefinementIntent; confidence: number; metadata?: any }> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are analyzing a user's message to detect if they are refining/correcting an AI insight about themselves.

Possible intents:
- "affirm" - User confirms an insight is accurate
- "downgrade_confidence" - User says something is less true, outdated, or not as strong
- "reject" - User explicitly disagrees or says "that's not me"
- "time_bound" - User says something was only true during a specific time period (e.g., "that was true in 2023 but not now", "only when I was younger")
- "scope_refine" - User says something is true but only in a specific context (e.g., "only at work", "just with my family")
- "split_insight" - User says something is "half true", "partially accurate", or "both true and false"
- "unclear" - Message doesn't clearly express refinement intent

Temporal reasoning:
- Look for time references: "used to", "back then", "in 2023", "when I was", "now", "currently"
- Extract temporal scope: validFrom, validTo, era
- If user says "that was true but not anymore", use time_bound intent

Return JSON:
{
  "intent": "affirm" | "downgrade_confidence" | "reject" | "time_bound" | "scope_refine" | "split_insight" | "unclear",
  "confidence": 0.0-1.0,
  "metadata": {
    "temporalScope"?: {"validFrom": "YYYY-MM-DD or relative time", "validTo": "YYYY-MM-DD or relative time", "era": "description"},
    "domainScope"?: "professional" | "personal" | "work" | "relationships" | "social" | "creative" | etc.,
    "refinementText"?: "refined version of the insight",
    "reason": "brief explanation of why this intent was detected"
  }
}

Be conservative. Only return high confidence (>0.6) if intent is clear. Use conversation history for context.`
          },
          ...(conversationHistory && conversationHistory.length > 0
            ? conversationHistory.slice(-3).map(msg => ({
                role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
                content: msg.content
              }))
            : []),
          {
            role: 'user',
            content: `Current user message: "${chatMessage}"`
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      return {
        intent: parsed.intent || 'unclear',
        confidence: parsed.confidence || 0.0,
        metadata: parsed.metadata || {}
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect refinement intent');
      return { intent: 'unclear', confidence: 0.0 };
    }
  }

  /**
   * 2. INSIGHT RESOLUTION
   * Resolves which insight the user is referring to (with conversation history for context)
   */
  private async resolveTargetInsight(
    userId: string,
    chatMessage: string,
    context: RefinementContext,
    intent: RefinementIntent,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ insight?: { id: string; category: string; text: string; confidence: number }; clarificationRequest?: string }> {
    try {
      const profile = await essenceProfileService.getProfile(userId);

      // Priority 1: lastReferencedInsightId
      if (context.lastReferencedInsightId) {
        const insight = this.findInsightById(profile, context.lastReferencedInsightId);
        if (insight) {
          return { insight };
        }
      }

      // Priority 2: lastSurfacedInsights (recently shown to user)
      if (context.lastSurfacedInsights && context.lastSurfacedInsights.length > 0) {
        // Try exact match first
        const exactMatch = context.lastSurfacedInsights.find(i => 
          chatMessage.toLowerCase().includes(i.text.toLowerCase().substring(0, 20))
        );
        if (exactMatch) {
          const insight = this.findInsightById(profile, exactMatch.id);
          if (insight) {
            return { insight };
          }
        }

        // Try semantic similarity on last surfaced insights (with conversation context)
        const conversationContext = conversationHistory 
          ? conversationHistory.slice(-2).map(m => m.content).join(' ')
          : '';
        const semanticMatch = await this.findSemanticMatch(
          `${conversationContext} ${chatMessage}`,
          context.lastSurfacedInsights.map(i => ({ id: i.id, text: i.text, category: i.category }))
        );
        if (semanticMatch && semanticMatch.score > this.INSIGHT_SIMILARITY_THRESHOLD) {
          const insight = this.findInsightById(profile, semanticMatch.id);
          if (insight) {
            return { insight };
          }
        }
      }

      // Priority 3: All visible insights (high confidence, recent)
      const allInsights = this.getAllInsights(profile);
      const visibleInsights = allInsights.filter(i => i.confidence > 0.5);

      if (visibleInsights.length === 0) {
        return { clarificationRequest: 'Which part of your Soul Profile are you referring to?' };
      }

      // Try semantic similarity on all visible insights (with conversation context)
      const conversationContext = conversationHistory 
        ? conversationHistory.slice(-2).map(m => m.content).join(' ')
        : '';
      const semanticMatch = await this.findSemanticMatch(
        `${conversationContext} ${chatMessage}`,
        visibleInsights.map(i => ({ id: i.id, text: i.text, category: i.category }))
      );

      if (semanticMatch && semanticMatch.score > this.INSIGHT_SIMILARITY_THRESHOLD) {
        const insight = this.findInsightById(profile, semanticMatch.id);
        if (insight) {
          return { insight };
        }
      }

      // Multiple candidates with similar scores - ask for clarification
      if (visibleInsights.length > 1) {
        const topCandidates = visibleInsights.slice(0, 2);
        return {
          clarificationRequest: `Are you referring to "${topCandidates[0].text.substring(0, 50)}..." or "${topCandidates[1].text.substring(0, 50)}..."?`
        };
      }

      // No clear match
      return { clarificationRequest: 'Which part of your Soul Profile are you referring to?' };
    } catch (error) {
      logger.error({ error }, 'Failed to resolve target insight');
      return {};
    }
  }

  /**
   * 3. APPLY REFINEMENT
   * Maps intent to backend action
   */
  private async applyRefinement(
    userId: string,
    intent: RefinementIntent,
    insight: { id: string; category: string; text: string; confidence: number },
    chatMessage: string,
    intentMetadata: any
  ): Promise<{ metadata: any }> {
    const profile = await essenceProfileService.getProfile(userId);
    const now = new Date().toISOString();

    const metadata: any = {
      reason: 'chat_refinement',
      originalText: insight.text,
      confidenceChange: 0
    };

    switch (intent) {
      case 'affirm':
        // Increase confidence slightly (cap at 1.0)
        const newConfidence = Math.min(insight.confidence + 0.1, 1.0);
        metadata.confidenceChange = newConfidence - insight.confidence;
        await this.updateInsightConfidence(userId, profile, insight.id, insight.category, newConfidence);
        metadata.refinementText = insight.text; // No text change, just confidence
        break;

      case 'downgrade_confidence':
        // Reduce confidence
        const reducedConfidence = Math.max(insight.confidence - 0.3, 0.1);
        metadata.confidenceChange = reducedConfidence - insight.confidence;
        await this.updateInsightConfidence(userId, profile, insight.id, insight.category, reducedConfidence);
        metadata.refinementText = insight.text; // Preserve text, just lower confidence
        break;

      case 'reject':
        // Mark as rejected (don't delete, preserve history)
        await this.markInsightRejected(userId, profile, insight.id, insight.category);
        metadata.refinementText = insight.text;
        metadata.confidenceChange = -insight.confidence; // Effectively hides it
        break;

      case 'time_bound':
        // Extract temporal scope and lower present confidence
        // Enhanced temporal reasoning: parse relative dates, extract eras
        const temporalScope = this.parseTemporalScope(intentMetadata.temporalScope, chatMessage);
        metadata.temporalScope = temporalScope;
        const timeBoundConfidence = Math.max(insight.confidence - 0.2, 0.3);
        metadata.confidenceChange = timeBoundConfidence - insight.confidence;
        await this.updateInsightWithTemporalScope(
          userId,
          profile,
          insight.id,
          insight.category,
          timeBoundConfidence,
          temporalScope
        );
        metadata.refinementText = insight.text;
        break;

      case 'scope_refine':
        // Narrow domain scope
        metadata.domainScope = intentMetadata.domainScope || 'contextual';
        const refinedText = intentMetadata.refinementText || insight.text;
        metadata.refinementText = refinedText;
        await this.updateInsightWithScope(
          userId,
          profile,
          insight.id,
          insight.category,
          refinedText,
          intentMetadata.domainScope
        );
        break;

      case 'split_insight':
        // Create refined child insights
        const splitTexts = intentMetadata.refinementText 
          ? [intentMetadata.refinementText, insight.text]
          : [insight.text];
        
        await this.splitInsight(
          userId,
          profile,
          insight.id,
          insight.category,
          splitTexts
        );
        metadata.refinementText = splitTexts.join(' | ');
        break;
    }

    // Record evolution entry
    await this.recordEvolution(userId, intent, insight, metadata);

    return { metadata };
  }

  /**
   * Helper: Find insight by ID across all categories
   */
  private findInsightById(
    profile: EssenceProfile,
    insightId: string
  ): { id: string; category: string; text: string; confidence: number } | null {
    const categories: Array<keyof EssenceProfile> = [
      'hopes', 'dreams', 'fears', 'strengths', 'weaknesses',
      'coreValues', 'personalityTraits', 'relationshipPatterns'
    ];

    for (const category of categories) {
      const insights = profile[category] as EssenceInsight[];
      const insight = insights.find((_, idx) => `${category}-${idx}` === insightId);
      if (insight) {
        return {
          id: insightId,
          category,
          text: insight.text,
          confidence: insight.confidence
        };
      }
    }

    // Check skills separately
    const skill = profile.topSkills.find((_, idx) => `topSkills-${idx}` === insightId);
    if (skill) {
      return {
        id: insightId,
        category: 'topSkills',
        text: skill.skill,
        confidence: skill.confidence
      };
    }

    return null;
  }

  /**
   * Helper: Get all insights from profile
   */
  private getAllInsights(profile: EssenceProfile): Array<{ id: string; category: string; text: string; confidence: number }> {
    const insights: Array<{ id: string; category: string; text: string; confidence: number }> = [];

    const categories: Array<keyof EssenceProfile> = [
      'hopes', 'dreams', 'fears', 'strengths', 'weaknesses',
      'coreValues', 'personalityTraits', 'relationshipPatterns'
    ];

    for (const category of categories) {
      const items = profile[category] as EssenceInsight[];
      items.forEach((item, idx) => {
        insights.push({
          id: `${category}-${idx}`,
          category,
          text: item.text,
          confidence: item.confidence
        });
      });
    }

    profile.topSkills.forEach((skill, idx) => {
      insights.push({
        id: `topSkills-${idx}`,
        category: 'topSkills',
        text: skill.skill,
        confidence: skill.confidence
      });
    });

    return insights;
  }

  /**
   * Helper: Semantic similarity search using embeddings
   */
  private async findSemanticMatch(
    chatMessage: string,
    insights: Array<{ id: string; text: string; category: string }>
  ): Promise<{ id: string; score: number } | null> {
    try {
      // Use OpenAI embeddings for semantic similarity
      const messageEmbedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chatMessage
      });

      const messageVector = messageEmbedding.data[0].embedding;

      // Get embeddings for all insights (could cache these)
      const insightEmbeddings = await Promise.all(
        insights.map(async (insight) => {
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: insight.text
          });
          return {
            id: insight.id,
            vector: embedding.data[0].embedding
          };
        })
      );

      // Calculate cosine similarity
      let bestMatch: { id: string; score: number } | null = null;
      for (const insightEmbedding of insightEmbeddings) {
        const similarity = this.cosineSimilarity(messageVector, insightEmbedding.vector);
        if (!bestMatch || similarity > bestMatch.score) {
          bestMatch = { id: insightEmbedding.id, score: similarity };
        }
      }

      return bestMatch;
    } catch (error) {
      logger.error({ error }, 'Failed to find semantic match');
      return null;
    }
  }

  /**
   * Helper: Cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Helper: Update insight confidence
   */
  private async updateInsightConfidence(
    userId: string,
    profile: EssenceProfile,
    insightId: string,
    category: string,
    newConfidence: number
  ): Promise<void> {
    if (category === 'topSkills') {
      const idx = parseInt(insightId.split('-')[1]);
      if (profile.topSkills[idx]) {
        profile.topSkills[idx].confidence = newConfidence;
        if (!(profile.topSkills[idx] as any).sources) {
          (profile.topSkills[idx] as any).sources = [];
        }
        if (!(profile.topSkills[idx] as any).sources.includes('chat_refinement')) {
          (profile.topSkills[idx] as any).sources.push('chat_refinement');
        }
      }
    } else {
      const idx = parseInt(insightId.split('-')[1]);
      const insights = profile[category as keyof EssenceProfile] as EssenceInsight[];
      if (insights[idx]) {
        insights[idx].confidence = newConfidence;
        if (!insights[idx].sources) {
          insights[idx].sources = [];
        }
        if (!insights[idx].sources.includes('chat_refinement')) {
          insights[idx].sources.push('chat_refinement');
        }
      }
    }

    await this.saveFullProfile(userId, profile);
  }

  /**
   * Helper: Mark insight as rejected
   */
  private async markInsightRejected(
    userId: string,
    profile: EssenceProfile,
    insightId: string,
    category: string
  ): Promise<void> {
    // Add rejected status to metadata
    if (category === 'topSkills') {
      const idx = parseInt(insightId.split('-')[1]);
      if (profile.topSkills[idx]) {
        (profile.topSkills[idx] as any).status = 'rejected';
        (profile.topSkills[idx] as any).rejectedAt = new Date().toISOString();
      }
    } else {
      const idx = parseInt(insightId.split('-')[1]);
      const insights = profile[category as keyof EssenceProfile] as EssenceInsight[];
      if (insights[idx]) {
        (insights[idx] as any).status = 'rejected';
        (insights[idx] as any).rejectedAt = new Date().toISOString();
      }
    }

    await this.saveFullProfile(userId, profile);
  }

  /**
   * Helper: Update insight with temporal scope
   */
  private async updateInsightWithTemporalScope(
    userId: string,
    profile: EssenceProfile,
    insightId: string,
    category: string,
    newConfidence: number,
    temporalScope: any
  ): Promise<void> {
    await this.updateInsightConfidence(userId, profile, insightId, category, newConfidence);
    
    // Add temporal metadata
    if (category === 'topSkills') {
      const idx = parseInt(insightId.split('-')[1]);
      if (profile.topSkills[idx]) {
        (profile.topSkills[idx] as any).temporalScope = temporalScope;
      }
    } else {
      const idx = parseInt(insightId.split('-')[1]);
      const insights = profile[category as keyof EssenceProfile] as EssenceInsight[];
      if (insights[idx]) {
        (insights[idx] as any).temporalScope = temporalScope;
      }
    }

    await this.saveFullProfile(userId, profile);
  }

  /**
   * Helper: Update insight with domain scope
   */
  private async updateInsightWithScope(
    userId: string,
    profile: EssenceProfile,
    insightId: string,
    category: string,
    refinedText: string,
    domainScope: string
  ): Promise<void> {
    if (category === 'topSkills') {
      const idx = parseInt(insightId.split('-')[1]);
      if (profile.topSkills[idx]) {
        profile.topSkills[idx].skill = refinedText;
        (profile.topSkills[idx] as any).domainScope = domainScope;
      }
    } else {
      const idx = parseInt(insightId.split('-')[1]);
      const insights = profile[category as keyof EssenceProfile] as EssenceInsight[];
      if (insights[idx]) {
        insights[idx].text = refinedText;
        (insights[idx] as any).domainScope = domainScope;
      }
    }

    await this.saveFullProfile(userId, profile);
  }

  /**
   * Helper: Split insight into refined children
   */
  private async splitInsight(
    userId: string,
    profile: EssenceProfile,
    insightId: string,
    category: string,
    splitTexts: string[]
  ): Promise<void> {
    // Reduce parent confidence
    await this.updateInsightConfidence(userId, profile, insightId, category, 0.3);

    // Add child insights (simplified - could be more sophisticated)
    if (category === 'topSkills') {
      // For skills, just update the text
      const idx = parseInt(insightId.split('-')[1]);
      if (profile.topSkills[idx]) {
        profile.topSkills[idx].skill = splitTexts[0];
      }
    } else {
      const idx = parseInt(insightId.split('-')[1]);
      const insights = profile[category as keyof EssenceProfile] as EssenceInsight[];
      if (insights[idx]) {
        insights[idx].text = splitTexts[0];
        // Could add child insights here if needed
      }
    }

    await this.saveFullProfile(userId, profile);
  }

  /**
   * Helper: Record evolution entry
   */
  private async recordEvolution(
    userId: string,
    intent: RefinementIntent,
    insight: { id: string; category: string; text: string },
    metadata: any
  ): Promise<void> {
    const profile = await essenceProfileService.getProfile(userId);
    
    const changeDescription = this.getChangeDescription(intent, insight, metadata);
    
    profile.evolution.push({
      date: new Date().toISOString(),
      changes: changeDescription,
      trigger: 'chat'
    });

    await essenceProfileService.updateProfile(userId, profile);
  }

  /**
   * Helper: Generate change description for evolution
   */
  private getChangeDescription(
    intent: RefinementIntent,
    insight: { category: string; text: string },
    metadata: any
  ): string {
    switch (intent) {
      case 'affirm':
        return `Insight confirmed via conversation: "${insight.text.substring(0, 50)}..."`;
      case 'downgrade_confidence':
        return `Insight confidence reduced via conversation: "${insight.text.substring(0, 50)}..."`;
      case 'reject':
        return `Insight rejected via conversation: "${insight.text.substring(0, 50)}..."`;
      case 'time_bound':
        return `Insight time-bounded via conversation: "${insight.text.substring(0, 50)}..."`;
      case 'scope_refine':
        return `Insight scope refined via conversation: "${insight.text.substring(0, 50)}..."`;
      case 'split_insight':
        return `Insight split via conversation: "${insight.text.substring(0, 50)}..."`;
      default:
        return `Insight refined via conversation`;
    }
  }

  /**
   * Helper: Save full profile to database
   */
  private async saveFullProfile(userId: string, profile: EssenceProfile): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('essence_profiles')
        .upsert({
          user_id: userId,
          profile_data: profile,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        logger.error({ error }, 'Failed to save full profile');
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save full profile');
      throw error;
    }
  }

  /**
   * Parse temporal scope from metadata and chat message
   * Handles relative dates, eras, and time periods
   */
  private parseTemporalScope(metadataScope: any, chatMessage: string): any {
    const scope: any = { ...metadataScope };

    // Extract relative time references from message
    const now = new Date();
    const relativePatterns = [
      { pattern: /(in|during|back in) (\d{4})/i, extract: (match: RegExpMatchArray) => ({ year: parseInt(match[2]) }) },
      { pattern: /(when i was|when i lived|during my)/i, extract: () => ({ relative: 'past_life_period' }) },
      { pattern: /(used to|formerly|previously)/i, extract: () => ({ relative: 'past' }) },
      { pattern: /(now|currently|these days|presently)/i, extract: () => ({ relative: 'present' }) },
      { pattern: /(last year|(\d+) years? ago)/i, extract: (match: RegExpMatchArray) => {
        const yearsAgo = match[2] ? parseInt(match[2]) : 1;
        const date = new Date(now);
        date.setFullYear(date.getFullYear() - yearsAgo);
        return { validTo: date.toISOString().split('T')[0] };
      }},
    ];

    for (const { pattern, extract } of relativePatterns) {
      const match = chatMessage.match(pattern);
      if (match) {
        const extracted = extract(match);
        Object.assign(scope, extracted);
        break;
      }
    }

    return scope;
  }
}

export const essenceRefinementEngine = new EssenceRefinementEngine();

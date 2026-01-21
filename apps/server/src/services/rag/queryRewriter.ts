import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type QueryIntent = 'factual' | 'temporal' | 'relational' | 'analytical' | 'exploratory';

export interface RewrittenQuery {
  original: string;
  expanded: string[];
  intent: QueryIntent;
  entities: string[];
  alternativePhrasings: string[];
  temporalContext?: {
    hasTimeReference: boolean;
    timeRange?: { start?: string; end?: string };
  };
}

/**
 * Query Rewriter Service
 * Expands queries, extracts entities, classifies intent, and generates alternative phrasings
 */
export class QueryRewriter {
  /**
   * Rewrite and expand a query for better retrieval
   */
  async rewriteQuery(
    originalQuery: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<RewrittenQuery> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a query rewriting expert. Your job is to:
1. Expand the query with synonyms, related terms, and alternative phrasings
2. Extract entities (people, places, events, concepts)
3. Classify query intent based on what the user is asking:
   - "factual": Asking "what", "who", "where", "which" - seeking specific facts
     Examples: "What did I do last weekend?", "Who is Sarah?", "Where did I go?"
   - "temporal": Asking "when" or about time - seeking time-based information
     Examples: "What happened last month?", "Recent events", "What did I do in 2023?"
   - "relational": Asking about relationships between people/entities
     Examples: "How do I know Sarah?", "Who introduced me to John?", "What's my relationship with my boss?"
   - "analytical": Asking "why", "how", or for analysis/patterns/insights
     Examples: "Why am I stressed?", "What patterns do you see?", "How has my mood changed?"
   - "exploratory": Browsing or open-ended exploration
     Examples: "Tell me about my life", "What's been going on?", "Show me interesting memories"
4. Detect temporal context (dates, time ranges, relative time)
5. Generate alternative phrasings that might retrieve the same information

Return JSON:
{
  "expanded": ["expanded query 1", "expanded query 2", ...],
  "intent": "factual|temporal|relational|analytical|exploratory",
  "entities": ["entity1", "entity2", ...],
  "alternativePhrasings": ["phrasing1", "phrasing2", ...],
  "temporalContext": {
    "hasTimeReference": true|false,
    "timeRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} // optional
  }
}`
          },
          {
            role: 'user',
            content: `Query: "${originalQuery}"

${conversationHistory.length > 0 ? `Conversation context:\n${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Rewrite and expand this query:`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      return {
        original: originalQuery,
        expanded: response.expanded || [originalQuery],
        intent: this.validateIntent(response.intent) || 'exploratory',
        entities: response.entities || [],
        alternativePhrasings: response.alternativePhrasings || [],
        temporalContext: response.temporalContext || { hasTimeReference: false }
      };
    } catch (error) {
      logger.warn({ error, query: originalQuery }, 'Query rewriting failed, using original');
      return {
        original: originalQuery,
        expanded: [originalQuery],
        intent: 'exploratory',
        entities: [],
        alternativePhrasings: [],
        temporalContext: { hasTimeReference: false }
      };
    }
  }

  /**
   * Validate and normalize intent
   */
  private validateIntent(intent: string): QueryIntent | null {
    const validIntents: QueryIntent[] = ['factual', 'temporal', 'relational', 'analytical', 'exploratory'];
    return validIntents.includes(intent as QueryIntent) ? (intent as QueryIntent) : null;
  }

  /**
   * Quick rewrite without LLM (for simple cases)
   * Uses pattern matching for fast intent detection
   */
  quickRewrite(query: string): RewrittenQuery {
    const lower = query.toLowerCase();
    
    // Simple intent detection with better patterns
    let intent: QueryIntent = 'exploratory';
    
    // Temporal: time-related keywords
    if (lower.match(/\b(when|what time|date|year|month|day|ago|recent|recently|lately|last|next|yesterday|today|tomorrow|this week|this month|in 202\d|during)\b/)) {
      intent = 'temporal';
    } 
    // Factual: seeking specific information
    else if (lower.match(/\b(who|what|where|which|how many|how much|tell me about|what is|what was)\b/)) {
      intent = 'factual';
    } 
    // Relational: about relationships
    else if (lower.match(/\b(relationship|friend|family|with|between|know|met|introduced|connected|close to)\b/)) {
      intent = 'relational';
    } 
    // Analytical: asking for analysis/insights
    else if (lower.match(/\b(why|how|analyze|analysis|insight|pattern|trend|compare|explain|cause|reason)\b/)) {
      intent = 'analytical';
    }

    // Simple entity extraction (capitalized words, likely names)
    const entities: string[] = [];
    const capitalizedWords = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (capitalizedWords) {
      // Filter out common non-entity words
      const nonEntities = new Set(['I', 'The', 'This', 'That', 'What', 'When', 'Where', 'Who', 'Why', 'How']);
      entities.push(...capitalizedWords.filter(w => !nonEntities.has(w)));
    }

    // Detect temporal context
    const hasTimeReference = lower.match(/\b(last|next|ago|recent|yesterday|today|tomorrow|in \d{4}|during)\b/) !== null;

    return {
      original: query,
      expanded: [query],
      intent,
      entities,
      alternativePhrasings: [],
      temporalContext: { 
        hasTimeReference,
        timeRange: undefined
      }
    };
  }
}

export const queryRewriter = new QueryRewriter();

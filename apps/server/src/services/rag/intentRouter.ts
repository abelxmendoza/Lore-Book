import { logger } from '../../logger';
import { queryRewriter, type QueryIntent } from './queryRewriter';

export interface RetrievalStrategy {
  method: 'hybrid' | 'semantic' | 'keyword' | 'entity' | 'temporal';
  weights?: {
    semantic: number;
    keyword: number;
    entity: number;
    temporal: number;
  };
  limit: number;
  recencyWeight?: number;
  entityBoost?: number;
  useReranking: boolean;
  useCompression: boolean;
}

/**
 * Query Intent Router Service
 * Routes queries to optimized retrieval strategies based on intent
 */
export class IntentRouter {
  /**
   * Route query to optimal retrieval strategy
   */
  async routeQuery(
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<RetrievalStrategy> {
    try {
      // Get query intent
      const rewritten = await queryRewriter.rewriteQuery(query, conversationHistory);
      const intent = rewritten.intent;

      // Route based on intent
      switch (intent) {
        case 'factual':
          return this.factualStrategy(rewritten);
        
        case 'temporal':
          return this.temporalStrategy(rewritten);
        
        case 'relational':
          return this.relationalStrategy(rewritten);
        
        case 'analytical':
          return this.analyticalStrategy(rewritten);
        
        case 'exploratory':
        default:
          return this.exploratoryStrategy(rewritten);
      }
    } catch (error) {
      logger.warn({ error, query }, 'Intent routing failed, using default strategy');
      return this.defaultStrategy();
    }
  }

  /**
   * Strategy for factual queries (seeking specific information)
   */
  private factualStrategy(rewritten: any): RetrievalStrategy {
    return {
      method: 'hybrid',
      weights: {
        semantic: 0.5,
        keyword: 0.4,
        entity: 0.1,
        temporal: 0.0
      },
      limit: 20,
      useReranking: true,
      useCompression: true
    };
  }

  /**
   * Strategy for temporal queries (time-based)
   */
  private temporalStrategy(rewritten: any): RetrievalStrategy {
    const hasTimeRange = rewritten.temporalContext?.hasTimeReference;
    
    return {
      method: 'temporal',
      weights: {
        semantic: 0.4,
        keyword: 0.2,
        entity: 0.1,
        temporal: 0.3
      },
      limit: 30,
      recencyWeight: hasTimeRange ? 0.8 : 0.6,
      useReranking: true,
      useCompression: true
    };
  }

  /**
   * Strategy for relational queries (about relationships)
   */
  private relationalStrategy(rewritten: any): RetrievalStrategy {
    return {
      method: 'entity',
      weights: {
        semantic: 0.3,
        keyword: 0.2,
        entity: 0.5,
        temporal: 0.0
      },
      limit: 25,
      entityBoost: 1.5,
      useReranking: true,
      useCompression: false // Keep full context for relationships
    };
  }

  /**
   * Strategy for analytical queries (analysis/insights)
   */
  private analyticalStrategy(rewritten: any): RetrievalStrategy {
    return {
      method: 'hybrid',
      weights: {
        semantic: 0.6,
        keyword: 0.2,
        entity: 0.1,
        temporal: 0.1
      },
      limit: 50, // More context for analysis
      useReranking: true,
      useCompression: true
    };
  }

  /**
   * Strategy for exploratory queries (browsing)
   */
  private exploratoryStrategy(rewritten: any): RetrievalStrategy {
    return {
      method: 'semantic',
      weights: {
        semantic: 0.7,
        keyword: 0.2,
        entity: 0.1,
        temporal: 0.0
      },
      limit: 30,
      useReranking: false, // Faster for browsing
      useCompression: false
    };
  }

  /**
   * Default strategy (fallback)
   */
  private defaultStrategy(): RetrievalStrategy {
    return {
      method: 'hybrid',
      weights: {
        semantic: 0.6,
        keyword: 0.3,
        entity: 0.1,
        temporal: 0.0
      },
      limit: 20,
      useReranking: true,
      useCompression: true
    };
  }
}

export const intentRouter = new IntentRouter();

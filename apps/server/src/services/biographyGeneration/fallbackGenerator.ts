/**
 * Fallback Generator
 * 
 * Provides graceful degradation when LLM API fails.
 * Implements multi-tier fallback strategy with retry logic.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  ChapterCluster,
  BiographyChapter,
  BiographySpec,
  Biography
} from './types';

// Circuit breaker state
let circuitBreakerState: {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
} = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Open after 5 failures
const CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class FallbackGenerator {
  /**
   * Check if error should trigger retry
   */
  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= 3) return false; // Max 3 retries

    // Retry on transient errors
    const errorMessage = error.message?.toLowerCase() || '';
    const isTransient = 
      errorMessage.includes('rate limit') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('503') ||
      errorMessage.includes('429') ||
      errorMessage.includes('502');

    return isTransient;
  }

  /**
   * Get retry delay with exponential backoff
   */
  getRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    return delay;
  }

  /**
   * Check circuit breaker state
   */
  private checkCircuitBreaker(): boolean {
    const now = Date.now();
    
    // Reset if timeout has passed
    if (circuitBreakerState.isOpen && 
        now - circuitBreakerState.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
      circuitBreakerState = {
        failures: 0,
        lastFailureTime: 0,
        isOpen: false
      };
      logger.info('Circuit breaker reset');
    }

    return circuitBreakerState.isOpen;
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(): void {
    circuitBreakerState.failures++;
    circuitBreakerState.lastFailureTime = Date.now();

    if (circuitBreakerState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerState.isOpen = true;
      logger.warn('Circuit breaker opened - using fallback generation');
    }
  }

  /**
   * Record success for circuit breaker
   */
  private recordSuccess(): void {
    if (circuitBreakerState.failures > 0) {
      circuitBreakerState.failures = Math.max(0, circuitBreakerState.failures - 1);
    }
  }

  /**
   * Generate chapter using template-based approach
   */
  generateTemplateBased(
    chapter: ChapterCluster & { title: string },
    spec: BiographySpec
  ): BiographyChapter {
    const startDate = new Date(chapter.timeSpan.start);
    const endDate = new Date(chapter.timeSpan.end);
    
    const startStr = startDate.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric',
      day: 'numeric'
    });
    const endStr = endDate.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric',
      day: 'numeric'
    });

    // Build narrative from atom summaries
    const atomNarratives = chapter.atoms
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(atom => {
        const date = new Date(atom.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { 
          month: 'short', 
          year: 'numeric',
          day: 'numeric'
        });
        return `${dateStr}: ${atom.content}`;
      })
      .join('\n\n');

    // Generate template-based narrative
    const themes = chapter.dominantThemes.join(', ') || 'various experiences';
    const tone = spec.tone === 'dramatic' ? 'dramatically' : 
                 spec.tone === 'reflective' ? 'reflectively' : 
                 spec.tone === 'mythic' ? 'mythically' : 'neutrally';

    const text = `During the period from ${startStr} to ${endStr}, ${themes} were central themes. 

${atomNarratives}

This period represented a significant chapter in the journey, marked by ${chapter.dominantThemes.length > 0 ? chapter.dominantThemes[0] : 'growth and change'}.`;

    return {
      id: chapter.id,
      title: chapter.title,
      text,
      timeSpan: chapter.timeSpan,
      timelineChapterIds: chapter.timelineChapterId ? [chapter.timelineChapterId] : [],
      timelineChapters: chapter.timelineChapter ? [chapter.timelineChapter] : undefined,
      atoms: chapter.atoms,
      themes: chapter.dominantThemes,
      isVoidChapter: false
    };
  }

  /**
   * Generate from cached biography
   */
  async generateFromCache(
    userId: string,
    spec: BiographySpec
  ): Promise<Biography | null> {
    try {
      // Find most recent biography of same type
      const { data, error } = await supabaseAdmin
        .from('biographies')
        .select('biography_data')
        .eq('user_id', userId)
        .eq('version', spec.version || 'main')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      const cachedBiography = data.biography_data as Biography;
      
      // Add note that this is from cache
      cachedBiography.metadata.generatedAt = new Date().toISOString();
      (cachedBiography.metadata as any).fromCache = true;
      (cachedBiography.metadata as any).cacheNote = 'Generated from cached version due to API unavailability';

      logger.info({ userId, biographyId: cachedBiography.id }, 'Using cached biography as fallback');
      return cachedBiography;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load cached biography');
      return null;
    }
  }

  /**
   * Generate with fallback strategy
   */
  async generateWithFallback(
    chapters: Array<ChapterCluster & { title: string }>,
    spec: BiographySpec,
    attempt: number = 0
  ): Promise<BiographyChapter[]> {
    // Check circuit breaker
    if (this.checkCircuitBreaker()) {
      logger.info('Circuit breaker open - using template-based generation');
      return chapters.map(ch => this.generateTemplateBased(ch, spec));
    }

    // This method is called from the main generation engine
    // The actual LLM call and retry logic is handled there
    // This is just the fallback generator
    return chapters.map(ch => this.generateTemplateBased(ch, spec));
  }

  /**
   * Wrap LLM call with retry and fallback
   */
  async callWithFallback<T>(
    llmCall: () => Promise<T>,
    fallback: () => T,
    context: string = 'LLM call'
  ): Promise<T> {
    const maxRetries = 3;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await llmCall();
        this.recordSuccess();
        return result;
      } catch (error) {
        const err = error as Error;
        
        if (attempt < maxRetries && this.shouldRetry(err, attempt)) {
          const delay = this.getRetryDelay(attempt);
          logger.warn(
            { error: err.message, attempt, delay, context },
            'LLM call failed, retrying with exponential backoff'
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          this.recordFailure();
          logger.error(
            { error: err.message, attempt, context },
            'LLM call failed, using fallback'
          );
          return fallback();
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return fallback();
  }
}

export const fallbackGenerator = new FallbackGenerator();

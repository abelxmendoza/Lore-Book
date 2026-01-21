import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type { MemoryEntry } from '../../types';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface CompressedContext {
  compressed: string;
  originalCount: number;
  compressedTokens: number;
  originalTokens: number;
  compressionRatio: number;
  keyEntities: string[];
  keyDates: string[];
}

/**
 * Context Compressor Service
 * Compresses retrieved context to reduce token usage while maintaining relevance
 */
export class ContextCompressor {
  /**
   * Compress context chunks for a query
   */
  async compressContext(
    retrievedChunks: MemoryEntry[],
    query: string,
    maxTokens: number = 2000
  ): Promise<CompressedContext> {
    try {
      if (retrievedChunks.length === 0) {
        return {
          compressed: '',
          originalCount: 0,
          compressedTokens: 0,
          originalTokens: 0,
          compressionRatio: 1,
          keyEntities: [],
          keyDates: []
        };
      }

      // Estimate original tokens (rough: 1 token ≈ 4 characters)
      const originalText = retrievedChunks
        .map(c => c.content || c.summary || '')
        .join('\n\n');
      const originalTokens = Math.ceil(originalText.length / 4);

      // If already under limit, return as-is
      if (originalTokens <= maxTokens) {
        return {
          compressed: originalText,
          originalCount: retrievedChunks.length,
          compressedTokens: originalTokens,
          originalTokens,
          compressionRatio: 1,
          keyEntities: this.extractEntities(retrievedChunks),
          keyDates: this.extractDates(retrievedChunks)
        };
      }

      // Compress using LLM
      const compressed = await this.llmCompress(retrievedChunks, query, maxTokens);

      const compressedTokens = Math.ceil(compressed.length / 4);

      return {
        compressed,
        originalCount: retrievedChunks.length,
        compressedTokens,
        originalTokens,
        compressionRatio: compressedTokens / originalTokens,
        keyEntities: this.extractEntities(retrievedChunks),
        keyDates: this.extractDates(retrievedChunks)
      };
    } catch (error) {
      logger.error({ error }, 'Context compression failed, returning original');
      const originalText = retrievedChunks
        .map(c => c.content || c.summary || '')
        .join('\n\n');
      return {
        compressed: originalText,
        originalCount: retrievedChunks.length,
        compressedTokens: Math.ceil(originalText.length / 4),
        originalTokens: Math.ceil(originalText.length / 4),
        compressionRatio: 1,
        keyEntities: [],
        keyDates: []
      };
    }
  }

  /**
   * Compress using LLM
   */
  private async llmCompress(
    chunks: MemoryEntry[],
    query: string,
    maxTokens: number
  ): Promise<string> {
    const chunksText = chunks
      .map((c, i) => `[Entry ${i + 1}]\n${c.content || c.summary || ''}\nDate: ${c.date || 'Unknown'}\n`)
      .join('\n---\n\n');

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `You are a context compression expert. Compress the following memory entries to answer the query, keeping only relevant information.

Guidelines:
- Preserve all information directly relevant to the query
- Preserve entity names, dates, and key facts
- Remove redundant information
- Summarize similar entries
- Maintain chronological order when relevant
- Keep important relationships and connections
- Target approximately ${Math.floor(maxTokens * 0.9)} tokens (roughly ${Math.floor(maxTokens * 0.9 * 4)} characters)

Return only the compressed context, no explanations.`
        },
        {
          role: 'user',
          content: `Query: "${query}"

Memory Entries:
${chunksText}

Compress these entries to answer the query:`
        }
      ],
      max_tokens: Math.floor(maxTokens * 1.2) // Allow some buffer
    });

    return completion.choices[0]?.message?.content || '';
  }

  /**
   * Extract entities from chunks
   */
  private extractEntities(chunks: MemoryEntry[]): string[] {
    const entities = new Set<string>();
    
    chunks.forEach(chunk => {
      // Extract capitalized words (simple entity detection)
      const matches = (chunk.content || '').match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (matches) {
        matches.forEach(m => entities.add(m));
      }
    });

    return Array.from(entities).slice(0, 20); // Limit to top 20
  }

  /**
   * Extract dates from chunks
   */
  private extractDates(chunks: MemoryEntry[]): string[] {
    const dates = new Set<string>();
    
    chunks.forEach(chunk => {
      if (chunk.date) {
        dates.add(chunk.date);
      }
    });

    return Array.from(dates).sort();
  }

  /**
   * Quick compression using summarization (faster, less accurate)
   */
  async quickCompress(
    chunks: MemoryEntry[],
    query: string,
    maxChunks: number = 10
  ): Promise<MemoryEntry[]> {
    // Simple strategy: prioritize chunks with query terms
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    const scored = chunks.map(chunk => {
      const text = (chunk.content || chunk.summary || '').toLowerCase();
      const matches = queryTerms.filter(term => text.includes(term)).length;
      return {
        chunk,
        score: matches
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);
  }
}

export const contextCompressor = new ContextCompressor();

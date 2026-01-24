import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type { MemoryEntry } from '../../types';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface RerankedResult extends MemoryEntry {
  rerankScore: number;
  relevanceReason?: string;
}

/**
 * Reranker Service
 * Uses cross-encoder approach (query-document interaction) for better ranking
 */
export class Reranker {
  /**
   * Rerank candidates using cross-encoder approach
   */
  async rerank(
    query: string,
    candidates: MemoryEntry[],
    topK: number = 10
  ): Promise<RerankedResult[]> {
    try {
      if (candidates.length === 0) {
        return [];
      }

      // If small set, use LLM for reranking
      if (candidates.length <= 20) {
        return await this.llmRerank(query, candidates, topK);
      }

      // For larger sets, use hybrid approach
      return await this.hybridRerank(query, candidates, topK);
    } catch (error) {
      logger.error({ error }, 'Reranking failed, returning original order');
      return candidates.slice(0, topK).map(c => ({
        ...c,
        rerankScore: 0.5,
        relevanceReason: 'Reranking failed'
      }));
    }
  }

  /**
   * LLM-based reranking (accurate but slower)
   */
  private async llmRerank(
    query: string,
    candidates: MemoryEntry[],
    topK: number
  ): Promise<RerankedResult[]> {
    const candidatesText = candidates
      .map((c, i) => `[${i}] ${c.content || c.summary || ''}\nDate: ${c.date || 'Unknown'}`)
      .join('\n\n---\n\n');

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a ranking expert. Rank the following memory entries by relevance to the query.

Return JSON:
{
  "ranked": [
    {"index": 0, "score": 0.95, "reason": "directly answers the query"},
    {"index": 1, "score": 0.80, "reason": "relevant context"}
  ]
}

Score range: 0.0 (irrelevant) to 1.0 (highly relevant)
Rank by relevance, not recency.`
        },
        {
          role: 'user',
          content: `Query: "${query}"

Memory Entries:
${candidatesText}

Rank these entries by relevance:`
        }
      ]
    });

    const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const ranked = response.ranked || [];

    // Map back to candidates
    const reranked: RerankedResult[] = ranked
      .map((item: { index: number; score: number; reason?: string }) => ({
        ...candidates[item.index],
        rerankScore: item.score,
        relevanceReason: item.reason
      }))
      .filter((item: RerankedResult) => item.id) // Filter out invalid
      .slice(0, topK);

    return reranked;
  }

  /**
   * Hybrid reranking (faster, uses heuristics + LLM for top candidates)
   */
  private async hybridRerank(
    query: string,
    candidates: MemoryEntry[],
    topK: number
  ): Promise<RerankedResult[]> {
    // Step 1: Quick heuristic scoring
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    const scored = candidates.map(candidate => {
      const text = (candidate.content || candidate.summary || '').toLowerCase();
      
      // Term frequency score
      let termScore = 0;
      queryTerms.forEach(term => {
        // SECURITY: Escape regex special characters to prevent injection
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = (text.match(new RegExp(escapedTerm, 'g')) || []).length;
        termScore += matches;
      });
      termScore = termScore / queryTerms.length;

      // Title/summary boost
      const summaryMatch = candidate.summary?.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;

      // Date relevance (if query mentions time)
      const dateScore = this.calculateDateRelevance(query, candidate.date);

      const heuristicScore = (termScore * 0.6 + summaryMatch + dateScore * 0.1);

      return {
        candidate,
        heuristicScore
      };
    });

    // Step 2: Sort by heuristic score and take top candidates for LLM reranking
    const topCandidates = scored
      .sort((a, b) => b.heuristicScore - a.heuristicScore)
      .slice(0, Math.min(topK * 2, 30))
      .map(item => item.candidate);

    // Step 3: LLM rerank top candidates
    const llmReranked = await this.llmRerank(query, topCandidates, topK);

    return llmReranked;
  }

  /**
   * Calculate date relevance score
   */
  private calculateDateRelevance(query: string, date?: string): number {
    if (!date) return 0;

    const queryLower = query.toLowerCase();
    const now = new Date();
    const entryDate = new Date(date);
    const daysAgo = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);

    // Boost for recent entries if query mentions "recent" or "lately"
    if (queryLower.match(/\b(recent|recently|lately|latest|current|now)\b/)) {
      if (daysAgo <= 30) return 0.5;
      if (daysAgo <= 90) return 0.3;
      return 0;
    }

    // Boost for historical entries if query mentions "past" or "ago"
    if (queryLower.match(/\b(past|ago|before|earlier|history|historical)\b/)) {
      if (daysAgo > 365) return 0.5;
      if (daysAgo > 90) return 0.3;
      return 0;
    }

    return 0.1; // Neutral boost
  }

  /**
   * Reciprocal Rank Fusion (RRF) for combining multiple ranking lists
   */
  reciprocalRankFusion(
    rankingLists: Array<Array<{ id: string; score: number }>>,
    k: number = 60
  ): Array<{ id: string; score: number }> {
    const scoreMap = new Map<string, number>();

    rankingLists.forEach((rankings, listIndex) => {
      rankings.forEach((item, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        scoreMap.set(item.id, (scoreMap.get(item.id) || 0) + rrfScore);
      });
    });

    return Array.from(scoreMap.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);
  }
}

export const reranker = new Reranker();

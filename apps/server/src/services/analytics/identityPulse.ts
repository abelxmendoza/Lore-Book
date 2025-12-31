/**
 * Identity Pulse Analytics Module
 * Tracks identity evolution, sentiment trajectory, mood volatility, and emotional triggers
 * Uses AI to extract unique identity signals from user's journal entries
 */

import { logger } from '../../logger';
import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';
import OpenAI from 'openai';
import { config } from '../../config';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class IdentityPulseModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'identity_pulse' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    // Check cache first
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length === 0) {
      return this.emptyPayload();
    }

    // Sort by date
    memories.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Compute analytics
    const trajectory = this.computeSentimentTrajectory(memories);
    const identities = this.extractIdentityStatements(memories);
    const driftScore = await this.computeIdentityDrift(memories, userId);
    const emotionalTriggers = this.detectEmotionalTriggers(memories);
    const moodVolatility = this.computeMoodVolatility(memories);

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        driftScore: driftScore,
        moodVolatility: moodVolatility,
        identityStatements: identities.length,
        emotionalTriggers: emotionalTriggers.length,
        averageSentiment: trajectory.length > 0 
          ? trajectory.reduce((sum, p) => sum + (p.value || 0), 0) / trajectory.length 
          : 0,
      },
      charts: [
        {
          type: 'line',
          title: 'Sentiment Trajectory',
          data: trajectory,
          xAxis: 'date',
          yAxis: 'value',
        },
        {
          type: 'bar',
          title: 'Mood Distribution',
          data: this.computeMoodDistribution(memories),
          xAxis: 'mood',
          yAxis: 'count',
        },
      ],
      insights: [
        ...this.generateDriftInsights(driftScore),
        ...this.generateVolatilityInsights(moodVolatility),
        ...this.generateTriggerInsights(emotionalTriggers),
      ],
      summary: this.generateSummary(trajectory, driftScore, moodVolatility, identities),
    };

    // Cache result
    await this.cacheResult(userId, payload);

    return payload;
  }

  /**
   * Compute sentiment trajectory using EMA smoothing
   */
  private computeSentimentTrajectory(memories: MemoryData[]): Array<{ date: string; value: number }> {
    // Extract sentiment values (default to 0 if null)
    const sentiments = memories.map(m => m.sentiment ?? 0);
    
    // Apply EMA smoothing (alpha = 0.3)
    const smoothed = this.ema(sentiments, 0.3);

    return memories.map((memory, i) => ({
      date: memory.created_at,
      value: smoothed[i],
    }));
  }

  /**
   * Extract identity statements using AI (more intelligent than regex)
   */
  private async extractIdentityStatements(memories: MemoryData[]): Promise<Array<{ text: string; date: string; confidence: number }>> {
    const statements: Array<{ text: string; date: string; confidence: number }> = [];

    // Process in batches to avoid token limits
    const batchSize = 10;
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      const batchText = batch.map(m => m.text).join('\n\n');

      try {
        const prompt = `Analyze these journal entries and extract identity statements - how the person sees themselves, describes themselves, or identifies.

Look for:
- Explicit statements ("I am...", "I'm...", "I see myself as...")
- Implicit identity signals (recurring themes, values, roles they take on)
- Self-descriptions and self-perceptions

Return a JSON object with an "statements" array. Each statement should have:
- text: The identity statement (concise, 3-10 words)
- confidence: 0.0-1.0 (how confident you are this is an identity statement)
- source_text: Brief quote from the entry that shows this

Only extract statements that are:
1. About the person's identity/self-perception
2. Not just temporary feelings or moods
3. Meaningful and specific

Return ONLY valid JSON object with "statements" array, no other text.

Journal entries:
${batchText.substring(0, 3000)}`;

        const response = await openai.chat.completions.create({
          model: config.defaultModel || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an identity extraction system. Extract identity statements from journal entries. Return only valid JSON objects with a "statements" array.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        const extracted = Array.isArray(result.statements) ? result.statements : [];

        // Map to our format with dates
        for (const extractedStmt of extracted) {
          if (extractedStmt.text && extractedStmt.confidence >= 0.5) {
            // Find the memory that likely contains this statement
            const matchingMemory = batch.find(m => 
              m.text.toLowerCase().includes(extractedStmt.text.toLowerCase().substring(0, 20))
            ) || batch[0];

            statements.push({
              text: extractedStmt.text.trim(),
              date: matchingMemory.created_at,
              confidence: Math.min(1, extractedStmt.confidence || 0.7),
            });
          }
        }
      } catch (error) {
        logger.warn({ error, batchIndex: i }, 'Failed to extract identity statements from batch, continuing');
        // Fallback to regex for this batch
        for (const memory of batch) {
          const regexPatterns = [
            /I am\s+([^.!?]+)/gi,
            /I'm\s+([^.!?]+)/gi,
            /I see myself as\s+([^.!?]+)/gi,
            /I consider myself\s+([^.!?]+)/gi,
          ];
          for (const pattern of regexPatterns) {
            const matches = memory.text.matchAll(pattern);
            for (const match of matches) {
              const statement = match[1]?.trim();
              if (statement && statement.length > 5 && statement.length < 200) {
                statements.push({
                  text: statement,
                  date: memory.created_at,
                  confidence: 0.6,
                });
              }
            }
          }
        }
      }
    }

    // Deduplicate similar statements
    const uniqueStatements = this.deduplicateStatements(statements);

    return uniqueStatements;
  }

  /**
   * Deduplicate similar identity statements
   */
  private deduplicateStatements(
    statements: Array<{ text: string; date: string; confidence: number }>
  ): Array<{ text: string; date: string; confidence: number }> {
    const unique: Array<{ text: string; date: string; confidence: number }> = [];
    const seen = new Set<string>();

    for (const stmt of statements) {
      const normalized = stmt.text.toLowerCase().trim();
      // Check if similar statement already exists
      let isDuplicate = false;
      for (const seenText of seen) {
        // Simple similarity check (can be enhanced with embeddings)
        const similarity = this.textSimilarity(normalized, seenText);
        if (similarity > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.add(normalized);
        unique.push(stmt);
      }
    }

    return unique;
  }

  /**
   * Simple text similarity (Jaccard similarity)
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Compute identity drift via centroid shift
   */
  private async computeIdentityDrift(memories: MemoryData[], userId: string): Promise<number> {
    if (memories.length < 10) {
      return 0; // Not enough data
    }

    // Split into recent (last 30 days) and historical (before that)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recent = memories.filter(m => new Date(m.created_at) >= thirtyDaysAgo);
    const historical = memories.filter(m => new Date(m.created_at) < thirtyDaysAgo);

    if (recent.length === 0 || historical.length === 0) {
      return 0;
    }

    // Get identity statements for each period
    const recentIdentities = this.extractIdentityStatements(recent);
    const historicalIdentities = this.extractIdentityStatements(historical);

    if (recentIdentities.length === 0 || historicalIdentities.length === 0) {
      return 0;
    }

    // For identity statements with embeddings, compute centroids
    // For now, use a simplified approach: compare statement similarity
    const recentTexts = recentIdentities.map(i => i.text.toLowerCase());
    const historicalTexts = historicalIdentities.map(i => i.text.toLowerCase());

    // Simple overlap-based drift score
    const overlap = recentTexts.filter(t => historicalTexts.includes(t)).length;
    const totalUnique = new Set([...recentTexts, ...historicalTexts]).size;
    
    // Drift score: 0 = no drift, 1 = complete drift
    const driftScore = totalUnique > 0 ? 1 - (overlap / totalUnique) : 0;

    return Math.min(1, Math.max(0, driftScore));
  }

  /**
   * Detect emotional triggers (events that cause strong sentiment shifts)
   */
  private detectEmotionalTriggers(memories: MemoryData[]): Array<{ text: string; date: string; impact: number }> {
    if (memories.length < 3) {
      return [];
    }

    const triggers: Array<{ text: string; date: string; impact: number }> = [];
    const sentiments = memories.map(m => m.sentiment ?? 0);

    // Detect significant sentiment shifts
    for (let i = 1; i < memories.length; i++) {
      const prevSentiment = sentiments[i - 1];
      const currSentiment = sentiments[i];
      const shift = Math.abs(currSentiment - prevSentiment);

      // Significant shift threshold
      if (shift > 0.5) {
        triggers.push({
          text: memories[i].text.substring(0, 200), // First 200 chars
          date: memories[i].created_at,
          impact: shift,
        });
      }
    }

    // Sort by impact
    triggers.sort((a, b) => b.impact - a.impact);

    return triggers.slice(0, 10); // Top 10 triggers
  }

  /**
   * Compute mood volatility using rolling standard deviation
   */
  private computeMoodVolatility(memories: MemoryData[]): number {
    const moods = memories
      .filter(m => m.mood)
      .map(m => {
        // Convert mood text to numeric (simplified)
        const moodMap: Record<string, number> = {
          'very_positive': 1.0,
          'positive': 0.5,
          'neutral': 0.0,
          'negative': -0.5,
          'very_negative': -1.0,
        };
        return moodMap[m.mood!.toLowerCase()] ?? 0;
      });

    if (moods.length < 2) {
      return 0;
    }

    // Use rolling window standard deviation
    const windowSize = Math.min(14, Math.floor(moods.length / 2));
    const rollingStdDev = this.rollingWindow(moods, windowSize, (window) => 
      this.standardDeviation(window)
    );

    // Average volatility
    return rollingStdDev.length > 0
      ? rollingStdDev.reduce((sum, val) => sum + val, 0) / rollingStdDev.length
      : 0;
  }

  /**
   * Compute mood distribution
   */
  private computeMoodDistribution(memories: MemoryData[]): Array<{ mood: string; count: number }> {
    const moodCounts = new Map<string, number>();
    
    for (const memory of memories) {
      if (memory.mood) {
        moodCounts.set(memory.mood, (moodCounts.get(memory.mood) || 0) + 1);
      }
    }

    return Array.from(moodCounts.entries())
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate drift insights
   */
  private generateDriftInsights(driftScore: number): Array<{ text: string; category: string; score: number }> {
    const insights = [];
    
    if (driftScore > 0.7) {
      insights.push({
        text: `Significant identity shift detected (${(driftScore * 100).toFixed(0)}% drift). Your self-perception has changed substantially.`,
        category: 'identity_drift',
        score: driftScore,
      });
    } else if (driftScore > 0.4) {
      insights.push({
        text: `Moderate identity evolution (${(driftScore * 100).toFixed(0)}% drift). You're exploring new aspects of yourself.`,
        category: 'identity_drift',
        score: driftScore,
      });
    } else {
      insights.push({
        text: `Stable identity (${(driftScore * 100).toFixed(0)}% drift). Your core self-perception remains consistent.`,
        category: 'identity_drift',
        score: driftScore,
      });
    }

    return insights;
  }

  /**
   * Generate volatility insights
   */
  private generateVolatilityInsights(volatility: number): Array<{ text: string; category: string; score: number }> {
    const insights = [];
    
    if (volatility > 0.7) {
      insights.push({
        text: `High mood volatility detected. Your emotional state fluctuates significantly, which may indicate stress or transition.`,
        category: 'mood_volatility',
        score: volatility,
      });
    } else if (volatility > 0.4) {
      insights.push({
        text: `Moderate mood variability. Your emotions show natural variation over time.`,
        category: 'mood_volatility',
        score: volatility,
      });
    } else {
      insights.push({
        text: `Stable mood patterns. Your emotional state remains relatively consistent.`,
        category: 'mood_volatility',
        score: volatility,
      });
    }

    return insights;
  }

  /**
   * Generate trigger insights
   */
  private generateTriggerInsights(triggers: Array<{ text: string; date: string; impact: number }>): Array<{ text: string; category: string; score: number }> {
    if (triggers.length === 0) {
      return [];
    }

    return [
      {
        text: `Detected ${triggers.length} significant emotional triggers. These events caused major shifts in your sentiment.`,
        category: 'emotional_triggers',
        score: triggers.reduce((sum, t) => sum + t.impact, 0) / triggers.length,
      },
    ];
  }

  /**
   * Generate summary
   */
  private generateSummary(
    trajectory: Array<{ date: string; value: number }>,
    driftScore: number,
    volatility: number,
    identities: Array<{ text: string; date: string; confidence: number }>
  ): string {
    const avgSentiment = trajectory.length > 0
      ? trajectory.reduce((sum, p) => sum + p.value, 0) / trajectory.length
      : 0;

    const sentimentTrend = trajectory.length >= 2
      ? trajectory[trajectory.length - 1].value - trajectory[0].value
      : 0;

    let summary = `Your identity pulse shows `;
    
    if (driftScore > 0.6) {
      summary += `significant evolution with ${identities.length} identity statements captured. `;
    } else {
      summary += `stable self-perception with ${identities.length} identity statements. `;
    }

    if (avgSentiment > 0.3) {
      summary += `Overall sentiment is positive (${avgSentiment.toFixed(2)}). `;
    } else if (avgSentiment < -0.3) {
      summary += `Overall sentiment is negative (${avgSentiment.toFixed(2)}). `;
    } else {
      summary += `Overall sentiment is neutral (${avgSentiment.toFixed(2)}). `;
    }

    if (sentimentTrend > 0.2) {
      summary += `Sentiment is trending upward, indicating positive momentum.`;
    } else if (sentimentTrend < -0.2) {
      summary += `Sentiment is trending downward, which may require attention.`;
    } else {
      summary += `Sentiment remains relatively stable over time.`;
    }

    if (volatility > 0.6) {
      summary += ` High mood volatility suggests you're in a period of transition or stress.`;
    }

    return summary;
  }

  /**
   * Enhanced identity pulse with new UI structure
   */
  async runEnhanced(userId: string, timeRange: string = '30'): Promise<AnalyticsPayload> {
    const days = timeRange === 'all' ? 3650 : parseInt(timeRange, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const memories = await this.fetchMemories(userId, 5000);
    const filteredMemories = timeRange === 'all' 
      ? memories 
      : memories.filter(m => new Date(m.created_at) >= cutoffDate);
    
    if (filteredMemories.length === 0) {
      return this.emptyEnhancedPayload();
    }

    // Sort by date
    filteredMemories.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Compute all components
    const trajectory = this.computeSentimentTrajectory(filteredMemories);
    const identities = await this.extractIdentityStatements(filteredMemories);
    const driftScore = await this.computeIdentityDrift(filteredMemories, userId);
    const moodVolatility = this.computeMoodVolatility(filteredMemories);
    
    // New computations (AI-enhanced)
    const snapshot = await this.computeIdentitySnapshotAI(filteredMemories, identities);
    const timeline = this.computeTimelineData(filteredMemories, identities);
    const motifEvolution = await this.computeMotifEvolutionAI(filteredMemories);
    const status = this.computeStatus(driftScore, moodVolatility);
    const reflectiveInsights = await this.generateReflectiveInsightsAI(
      driftScore, 
      moodVolatility, 
      identities,
      filteredMemories
    );

    // Return enhanced structure that matches frontend types
    const response: any = {
      status,
      stability: 1 - driftScore,
      driftScore,
      moodVolatility,
      timeRange: days,
      totalMemories: filteredMemories.length,
      snapshot,
      timeline,
      motifEvolution,
      identityStatements: identities.map(i => ({
        text: i.text,
        confidence: i.confidence,
        date: i.date,
        timeSpan: this.getTimeSpan(i.date, filteredMemories),
      })),
      insights: reflectiveInsights,
      summary: this.generateEnhancedSummary(status, driftScore, moodVolatility, identities.length),
    };

    return response as AnalyticsPayload;
  }

  /**
   * Compute identity snapshot using AI (extracts unique identity signals)
   */
  private async computeIdentitySnapshotAI(
    memories: MemoryData[],
    identities: Array<{ text: string; date: string; confidence: number }>
  ): Promise<Array<{ label: string; confidence: number; trend: 'up' | 'down' | 'stable' }>> {
    // Get recent memories (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentMemories = memories
      .filter(m => new Date(m.created_at) >= thirtyDaysAgo)
      .slice(-20);

    if (recentMemories.length === 0) {
      return [];
    }

    const recentText = recentMemories.map(m => m.text).join('\n\n').substring(0, 4000);

    try {
      const prompt = `Analyze these recent journal entries and identify 3-5 core identity signals - how this person currently sees themselves.

Look for:
- Recurring themes, roles, or self-descriptions
- Values and priorities that define them
- How they identify themselves (e.g., "Builder", "Learner", "Explorer", "Creator")
- Core aspects of their identity that appear consistently

Return a JSON object with a "signals" array. Each signal should have:
- label: A concise identity label (1-3 words, e.g., "Builder", "Discipline-focused", "Career-oriented")
- confidence: 0.0-1.0 (how strongly this identity signal appears)
- trend: "up", "down", or "stable" (whether this identity is strengthening, weakening, or stable)

Focus on signals that are:
1. Unique to this person (not generic)
2. Supported by multiple entries
3. Meaningful identity markers

Return ONLY valid JSON object with "signals" array, no other text.

Recent journal entries:
${recentText}`;

      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an identity analysis system. Extract unique identity signals from journal entries. Return only valid JSON objects with a "signals" array.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const signals = Array.isArray(result.signals) ? result.signals : [];

      return signals
        .filter((s: any) => s.label && s.confidence >= 0.5)
        .map((s: any) => ({
          label: s.label,
          confidence: Math.min(1, s.confidence || 0.7),
          trend: (s.trend === 'up' || s.trend === 'down' || s.trend === 'stable') ? s.trend : 'stable',
        }))
        .slice(0, 5);
    } catch (error) {
      logger.warn({ error }, 'Failed to extract identity snapshot with AI, using fallback');
      // Fallback to simple extraction
      return this.computeIdentitySnapshot(memories, identities);
    }
  }

  /**
   * Fallback: Compute identity snapshot (simple word-based)
   */
  private computeIdentitySnapshot(
    memories: MemoryData[],
    identities: Array<{ text: string; date: string; confidence: number }>
  ): Array<{ label: string; confidence: number; trend: 'up' | 'down' | 'stable' }> {
    // Get recent identities (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentIdentities = identities
      .filter(i => new Date(i.date) >= thirtyDaysAgo)
      .slice(-10);

    // Extract common themes
    const themes = new Map<string, { count: number; confidence: number }>();
    
    for (const identity of recentIdentities) {
      const words = identity.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 4 && !['that', 'this', 'with', 'from', 'about'].includes(word)) {
          const existing = themes.get(word) || { count: 0, confidence: 0 };
          themes.set(word, {
            count: existing.count + 1,
            confidence: existing.confidence + identity.confidence,
          });
        }
      }
    }

    // Convert to snapshot items
    const snapshot: Array<{ label: string; confidence: number; trend: 'up' | 'down' | 'stable' }> = [];
    
    // Add top themes
    Array.from(themes.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .forEach(([word, data]) => {
        snapshot.push({
          label: word.charAt(0).toUpperCase() + word.slice(1),
          confidence: Math.min(1, data.confidence / data.count),
          trend: 'stable',
        });
      });

    return snapshot;
  }

  /**
   * Compute timeline data (motifs/themes over time)
   */
  private computeTimelineData(
    memories: MemoryData[],
    identities: Array<{ text: string; date: string; confidence: number }>
  ): Array<{ date: string; themes: Array<{ name: string; strength: number }> }> {
    // Group by week
    const timeline: Array<{ date: string; themes: Array<{ name: string; strength: number }> }> = [];
    const weekGroups = new Map<string, MemoryData[]>();

    for (const memory of memories) {
      const date = new Date(memory.created_at);
      const weekKey = `${date.getFullYear()}-W${this.getWeekNumber(date)}`;
      const weekMemories = weekGroups.get(weekKey) || [];
      weekMemories.push(memory);
      weekGroups.set(weekKey, weekMemories);
    }

    for (const [weekKey, weekMemories] of weekGroups.entries()) {
      const themes = this.extractThemesFromMemories(weekMemories);
      timeline.push({
        date: weekKey,
        themes: themes.slice(0, 5), // Top 5 themes per week
      });
    }

    return timeline.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Compute motif evolution using AI (extracts unique motifs from user's content)
   */
  private async computeMotifEvolutionAI(memories: MemoryData[]): Promise<Array<{
    name: string;
    sparkline: number[];
    peakMarkers: Array<{ date: string; intensity: number }>;
  }>> {
    if (memories.length < 5) {
      return [];
    }

    // Sample entries for motif discovery
    const sampleText = memories
      .slice(-30) // Last 30 entries
      .map(m => m.text)
      .join('\n\n')
      .substring(0, 5000);

    try {
      const prompt = `Analyze these journal entries and identify 4-6 recurring motifs or themes that define this person's experience.

Look for:
- Recurring emotional patterns
- Themes that appear across multiple entries
- Motifs that evolve over time (e.g., "Discipline", "Self-doubt", "Mastery", "Exploration", "Connection")
- Unique patterns specific to this person

Return a JSON object with a "motifs" array. Each motif should have:
- name: A concise motif name (1-2 words, e.g., "Discipline", "Self-doubt", "Creative Flow")
- description: Brief description of what this motif represents

Focus on motifs that are:
1. Recurring across multiple entries
2. Meaningful to understanding this person's experience
3. Unique to their writing (not generic)

Return ONLY valid JSON object with "motifs" array, no other text.

Journal entries:
${sampleText}`;

      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a motif detection system. Extract recurring themes and motifs from journal entries. Return only valid JSON objects with a "motifs" array.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const extractedMotifs = Array.isArray(result.motifs) ? result.motifs : [];

      // Group memories by week
      const weekGroups = new Map<string, MemoryData[]>();
      for (const memory of memories) {
        const date = new Date(memory.created_at);
        const weekKey = `${date.getFullYear()}-W${this.getWeekNumber(date)}`;
        const weekMemories = weekGroups.get(weekKey) || [];
        weekMemories.push(memory);
        weekGroups.set(weekKey, weekMemories);
      }

      const sortedWeeks = Array.from(weekGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      // Compute evolution for each extracted motif
      const evolution: Array<{
        name: string;
        sparkline: number[];
        peakMarkers: Array<{ date: string; intensity: number }>;
      }> = [];

      for (const motif of extractedMotifs.slice(0, 6)) {
        const motifName = motif.name || motif.label;
        if (!motifName) continue;

        const sparkline: number[] = [];
        const peaks: Array<{ date: string; intensity: number }> = [];

        for (const [weekKey, weekMemories] of sortedWeeks) {
          const intensity = this.computeMotifIntensityAI(motifName, weekMemories);
          sparkline.push(intensity);
          
          if (intensity > 0.6) {
            peaks.push({ date: weekKey, intensity });
          }
        }

        evolution.push({
          name: motifName,
          sparkline,
          peakMarkers: peaks.slice(0, 3), // Top 3 peaks
        });
      }

      return evolution;
    } catch (error) {
      logger.warn({ error }, 'Failed to extract motifs with AI, using fallback');
      return this.computeMotifEvolution(memories);
    }
  }

  /**
   * Fallback: Compute motif evolution (hardcoded motifs)
   */
  private computeMotifEvolution(memories: MemoryData[]): Array<{
    name: string;
    sparkline: number[];
    peakMarkers: Array<{ date: string; intensity: number }>;
  }> {
    const motifs = ['Discipline', 'Self-doubt', 'Mastery', 'Creativity', 'Exploration'];
    const evolution: Array<{
      name: string;
      sparkline: number[];
      peakMarkers: Array<{ date: string; intensity: number }>;
    }> = [];

    // Group by week
    const weekGroups = new Map<string, MemoryData[]>();
    for (const memory of memories) {
      const date = new Date(memory.created_at);
      const weekKey = `${date.getFullYear()}-W${this.getWeekNumber(date)}`;
      const weekMemories = weekGroups.get(weekKey) || [];
      weekMemories.push(memory);
      weekGroups.set(weekKey, weekMemories);
    }

    const sortedWeeks = Array.from(weekGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const motif of motifs) {
      const sparkline: number[] = [];
      const peaks: Array<{ date: string; intensity: number }> = [];
      
      for (const [weekKey, weekMemories] of sortedWeeks) {
        const intensity = this.computeMotifIntensity(motif, weekMemories);
        sparkline.push(intensity);
        
        if (intensity > 0.7) {
          peaks.push({ date: weekKey, intensity });
        }
      }

      evolution.push({
        name: motif,
        sparkline,
        peakMarkers: peaks.slice(0, 3),
      });
    }

    return evolution;
  }

  /**
   * Compute status (stable/shifting/exploring/turbulent)
   */
  private computeStatus(driftScore: number, volatility: number): 'stable' | 'shifting' | 'exploring' | 'turbulent' {
    if (volatility > 0.7 && driftScore > 0.6) {
      return 'turbulent';
    }
    if (driftScore > 0.5) {
      return 'shifting';
    }
    if (driftScore > 0.3) {
      return 'exploring';
    }
    return 'stable';
  }

  /**
   * Generate reflective insights using AI (therapist tone with questions)
   */
  private async generateReflectiveInsightsAI(
    driftScore: number,
    volatility: number,
    identities: Array<{ text: string; date: string; confidence: number }>,
    memories: MemoryData[]
  ): Promise<Array<{ text: string; category: string; score: number; question?: string }>> {
    if (memories.length < 5) {
      return [];
    }

    // Get recent memories for context
    const recentMemories = memories.slice(-20);
    const recentText = recentMemories.map(m => m.text).join('\n\n').substring(0, 4000);
    const identitySummary = identities.slice(-5).map(i => i.text).join(', ');

    try {
      const prompt = `Analyze these journal entries and identity statements to generate 2-4 reflective insights about this person's identity evolution.

Context:
- Identity drift score: ${(driftScore * 100).toFixed(0)}% (0 = stable, 100 = major shift)
- Mood volatility: ${(volatility * 100).toFixed(0)}%
- Recent identity statements: ${identitySummary}

Generate insights that:
1. Are observational, not diagnostic (therapist tone)
2. End with a reflective question
3. Are specific to this person's patterns
4. Feel supportive and curious, not judgmental

Return a JSON object with an "insights" array. Each insight should have:
- text: The insight (1-2 sentences, observational)
- category: Category (e.g., "professional_identity", "confidence", "identity_exploration")
- score: 0.0-1.0 (confidence in the insight)
- question: A reflective question (e.g., "Does this feel accurate?", "What do you notice about this?")

Language rules:
- Never use "warning" or "problem"
- Use "pattern detected" or "trend observed"
- Always end with a question
- Be specific to their content

Return ONLY valid JSON object with "insights" array, no other text.

Recent journal entries:
${recentText}`;

      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a reflective identity analyst. Generate supportive, observational insights with questions. Return only valid JSON objects with an "insights" array.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const insights = Array.isArray(result.insights) ? result.insights : [];

      return insights
        .filter((i: any) => i.text && i.question)
        .map((i: any) => ({
          text: i.text,
          category: i.category || 'general',
          score: Math.min(1, i.score || 0.7),
          question: i.question,
        }))
        .slice(0, 4);
    } catch (error) {
      logger.warn({ error }, 'Failed to generate reflective insights with AI, using fallback');
      return this.generateReflectiveInsights(driftScore, volatility, identities, memories);
    }
  }

  /**
   * Fallback: Generate reflective insights (rule-based)
   */
  private generateReflectiveInsights(
    driftScore: number,
    volatility: number,
    identities: Array<{ text: string; date: string; confidence: number }>,
    memories: MemoryData[]
  ): Array<{ text: string; category: string; score: number; question?: string }> {
    const insights: Array<{ text: string; category: string; score: number; question?: string }> = [];

    // Professional identity insight
    const professionalIdentities = identities.filter(i => 
      i.text.toLowerCase().includes('career') || 
      i.text.toLowerCase().includes('work') ||
      i.text.toLowerCase().includes('professional')
    );
    
    if (professionalIdentities.length > 0) {
      insights.push({
        text: 'Your professional identity has strengthened steadily.',
        category: 'professional_identity',
        score: 0.8,
        question: 'Does this feel accurate?',
      });
    }

    // Self-doubt insight
    const selfDoubtMemories = memories.filter(m => 
      m.text.toLowerCase().includes('doubt') || 
      m.text.toLowerCase().includes('uncertain')
    );
    
    if (selfDoubtMemories.length < memories.length * 0.1) {
      insights.push({
        text: "You've shown less self-doubt during recent learning phases.",
        category: 'confidence',
        score: 0.7,
        question: 'What do you notice about this?',
      });
    }

    // Multiple identities insight
    if (driftScore > 0.4 && driftScore < 0.7) {
      insights.push({
        text: 'Multiple identities are coexisting right now — exploration phase.',
        category: 'identity_exploration',
        score: driftScore,
        question: 'How does this exploration feel?',
      });
    }

    return insights.slice(0, 4);
  }

  /**
   * Helper methods
   */
  private extractThemesFromMemories(memories: MemoryData[]): Array<{ name: string; strength: number }> {
    const themeCounts = new Map<string, number>();
    
    for (const memory of memories) {
      const words = memory.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 4) {
          themeCounts.set(word, (themeCounts.get(word) || 0) + 1);
        }
      }
    }

    return Array.from(themeCounts.entries())
      .map(([name, count]) => ({ name, strength: Math.min(1, count / memories.length) }))
      .sort((a, b) => b.strength - a.strength);
  }

  /**
   * Compute motif intensity using semantic analysis
   */
  private computeMotifIntensityAI(motif: string, memories: MemoryData[]): number {
    if (memories.length === 0) return 0;

    const motifLower = motif.toLowerCase();
    let matches = 0;
    let totalRelevance = 0;
    
    // Related keywords for each motif (can be expanded)
    const motifKeywords: Record<string, string[]> = {
      'discipline': ['discipline', 'consistent', 'routine', 'habit', 'practice', 'dedicated'],
      'self-doubt': ['doubt', 'uncertain', 'worried', 'anxious', 'unsure', 'hesitant'],
      'mastery': ['master', 'expert', 'skilled', 'proficient', 'excellence', 'advanced'],
      'creativity': ['creative', 'artistic', 'imaginative', 'innovative', 'original', 'inventive'],
      'exploration': ['explore', 'discover', 'try', 'experiment', 'curious', 'adventure'],
    };

    const keywords = motifKeywords[motifLower] || [motifLower];

    for (const memory of memories) {
      const textLower = memory.text.toLowerCase();
      let relevance = 0;
      
      // Check for exact match
      if (textLower.includes(motifLower)) {
        relevance = 1.0;
      } else {
        // Check for keyword matches
        for (const keyword of keywords) {
          if (textLower.includes(keyword)) {
            relevance = Math.max(relevance, 0.7);
          }
        }
      }

      if (relevance > 0) {
        matches++;
        totalRelevance += relevance;
      }
    }

    // Average intensity weighted by relevance
    return memories.length > 0 ? Math.min(1, totalRelevance / memories.length) : 0;
  }

  private computeMotifIntensity(motif: string, memories: MemoryData[]): number {
    const motifLower = motif.toLowerCase();
    let matches = 0;
    
    for (const memory of memories) {
      if (memory.text.toLowerCase().includes(motifLower)) {
        matches++;
      }
    }

    return Math.min(1, matches / memories.length);
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private getTimeSpan(date: string, memories: MemoryData[]): string {
    const entryDate = new Date(date);
    const firstMemory = memories[0];
    const lastMemory = memories[memories.length - 1];
    
    if (!firstMemory || !lastMemory) return 'Unknown';
    
    const firstDate = new Date(firstMemory.created_at);
    const lastDate = new Date(lastMemory.created_at);
    
    if (entryDate < firstDate) return 'Early period';
    if (entryDate > lastDate) return 'Recent';
    
    const totalSpan = lastDate.getTime() - firstDate.getTime();
    const position = entryDate.getTime() - firstDate.getTime();
    const percentage = (position / totalSpan) * 100;
    
    if (percentage < 25) return 'Early period';
    if (percentage < 50) return 'Mid period';
    if (percentage < 75) return 'Recent period';
    return 'Very recent';
  }

  private generateEnhancedSummary(
    status: string,
    driftScore: number,
    volatility: number,
    identityCount: number
  ): string {
    const statusMessages: Record<string, string> = {
      stable: 'Your identity feels grounded and consistent.',
      shifting: 'You\'re experiencing meaningful identity evolution.',
      exploring: 'You\'re actively exploring different aspects of yourself.',
      turbulent: 'You\'re in a period of significant identity transition.',
    };

    return `${statusMessages[status]} ${identityCount} identity statements captured.`;
  }

  private emptyEnhancedPayload(): AnalyticsPayload {
    return {
      status: 'stable',
      stability: 1,
      driftScore: 0,
      moodVolatility: 0,
      timeRange: 30,
      totalMemories: 0,
      snapshot: [],
      timeline: [],
      motifEvolution: [],
      identityStatements: [],
      insights: [],
      summary: 'Not enough data to generate identity pulse. Keep journaling to see your identity evolve.',
    } as any;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate identity pulse analytics.',
    };
  }
}

export const identityPulseModule = new IdentityPulseModule();


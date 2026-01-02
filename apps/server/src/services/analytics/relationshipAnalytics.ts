/**
 * Relationship Analytics Module
 * Analyzes character relationships, closeness, lifecycle phases, and emotional impact
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData, CharacterData } from './types';

interface RelationshipNode {
  id: string;
  name: string;
  degree: number;
  centrality: number;
}

interface RelationshipEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface LifecyclePhase {
  characterId: string;
  characterName: string;
  phase: 'rise' | 'peak' | 'drift' | 'decline';
  startDate: string;
  endDate: string | null;
  intensity: number;
}

export class RelationshipAnalyticsModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'relationship_analytics' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    const characters = await this.fetchCharacters(userId);

    if (memories.length === 0 || characters.length === 0) {
      return this.mockPayload();
    }

    // Build relationship graph
    const { nodes, edges } = await this.buildRelationshipGraph(memories, characters, userId);
    
    // Compute centrality scores
    const centralityScores = this.computeCentrality(nodes, edges);
    
    // Compute closeness graph
    const closenessGraph = await this.buildClosenessGraph(characters, userId);
    
    // Detect lifecycle phases
    const lifecycle = this.detectLifecyclePhases(memories, characters);
    
    // Compute emotional impact ranking
    const emotionalImpact = this.computeEmotionalImpact(memories, characters);

    // NEW: Compute sentiment timeline
    const sentimentTimeline = this.computeSentimentTimeline(memories, characters);
    
    // NEW: Classify archetypes
    const archetypes = await this.classifyArchetypes(characters, centralityScores, emotionalImpact, userId);
    
    // NEW: Compute attachment gravity
    const attachmentGravity = await this.computeAttachmentGravity(memories, characters, centralityScores, userId);
    
    // NEW: Compute forecast
    const forecast = this.computeRelationshipForecast(sentimentTimeline);
    
    // NEW: Compute arc appearances
    const arcAppearances = await this.computeArcAppearances(characters, userId);
    
    // NEW: Compute heatmap
    const heatmap = this.computeHeatmapMatrix(memories, characters);

    // Build enhanced graph with additional metadata
    const characterMap = new Map(characters.map(c => [c.id, c]));
    const centralityMap = new Map(centralityScores.map(c => [c.name, c.centrality]));
    const arcFrequencyMap = new Map(
      arcAppearances.map(a => [a.character, a.arcs.reduce((sum, arc) => sum + arc.count, 0)])
    );

    const payload: AnalyticsPayload = {
      metrics: {
        totalCharacters: characters.length,
        totalRelationships: edges.length,
        averageCloseness: closenessGraph.length > 0
          ? closenessGraph.reduce((sum, r) => sum + (r.closeness || 0), 0) / closenessGraph.length
          : 0,
        mostCentralCharacter: centralityScores.length > 0 ? centralityScores[0].name : null,
        activeRelationships: lifecycle.filter(l => l.phase === 'peak' || l.phase === 'rise').length,
      },
      charts: [
        {
          type: 'bar',
          title: 'Character Centrality',
          data: centralityScores.slice(0, 10).map(c => ({ name: c.name, centrality: c.centrality })),
          xAxis: 'name',
          yAxis: 'centrality',
        },
        {
          type: 'line',
          title: 'Relationship Lifecycle',
          data: this.formatLifecycleForChart(lifecycle),
          xAxis: 'date',
          yAxis: 'intensity',
        },
      ],
      graph: {
        nodes: nodes.map(n => {
          const char = characterMap.get(n.id);
          const avgSentiment = this.getAverageSentimentForCharacter(char?.name || '', memories);
          return {
            id: n.id,
            label: n.name,
            type: 'character',
            metadata: {
              degree: n.degree,
              centrality: n.centrality,
              sentimentScore: avgSentiment,
              arcFrequency: arcFrequencyMap.get(n.name) || 0,
            },
          };
        }),
        edges: edges.map(e => {
          const sourceChar = characterMap.get(e.source);
          const targetChar = characterMap.get(e.target);
          const edgeSentiment = this.getEdgeSentiment(sourceChar?.name || '', targetChar?.name || '', memories);
          return {
            source: e.source,
            target: e.target,
            weight: e.weight,
            type: e.type,
            metadata: {
              sentiment: edgeSentiment,
              recentScore: e.weight,
            },
          };
        }),
      },
      insights: [
        ...this.generateCentralityInsights(centralityScores),
        ...this.generateLifecycleInsights(lifecycle),
        ...this.generateEmotionalImpactInsights(emotionalImpact),
      ],
      summary: this.generateSummary(characters, edges, lifecycle, emotionalImpact),
      metadata: {
        sentimentTimeline,
        archetypes,
        attachmentGravity,
        forecast,
        arcAppearances,
        heatmap,
      },
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Fetch characters for user
   */
  private async fetchCharacters(userId: string): Promise<CharacterData[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('characters')
        .select('id, name, first_appearance, updated_at, interaction_score, sentiment_toward, embedding')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Error fetching characters');
        return [];
      }

      return (data || []).map((char: any) => ({
        id: char.id,
        name: char.name,
        first_seen: char.first_appearance,
        last_seen: char.updated_at,
        interaction_score: char.interaction_score,
        sentiment_toward: char.sentiment_toward,
        embedding: char.embedding as number[] | null,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Error fetching characters');
      return [];
    }
  }

  /**
   * Build relationship graph using adjacency lists
   */
  private async buildRelationshipGraph(
    memories: MemoryData[],
    characters: CharacterData[],
    userId: string
  ): Promise<{ nodes: RelationshipNode[]; edges: RelationshipEdge[] }> {
    // Get character relationships from database
    const { data: relationships, error } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type, closeness_score')
      .eq('user_id', userId);

    if (error) {
      logger.error({ error }, 'Error fetching character relationships');
    }

    const characterMap = new Map(characters.map(c => [c.id, c]));
    const edges: RelationshipEdge[] = [];
    const nodeMap = new Map<string, RelationshipNode>();

    // Build nodes
    for (const character of characters) {
      nodeMap.set(character.id, {
        id: character.id,
        name: character.name,
        degree: 0,
        centrality: 0,
      });
    }

    // Build edges from database relationships
    if (relationships) {
      for (const rel of relationships) {
        const source = characterMap.get(rel.source_character_id);
        const target = characterMap.get(rel.target_character_id);
        
        if (source && target) {
          const weight = (rel.closeness_score || 0) / 10; // Normalize to 0-1
          edges.push({
            source: rel.source_character_id,
            target: rel.target_character_id,
            weight: Math.abs(weight),
            type: rel.relationship_type || 'unknown',
          });

          // Update degrees
          const sourceNode = nodeMap.get(rel.source_character_id);
          const targetNode = nodeMap.get(rel.target_character_id);
          if (sourceNode) sourceNode.degree++;
          if (targetNode) targetNode.degree++;
        }
      }
    }

    // Also detect co-occurrences in memories
    const coOccurrences = this.detectCoOccurrences(memories, characters);
    for (const co of coOccurrences) {
      if (!edges.find(e => 
        (e.source === co.source && e.target === co.target) ||
        (e.source === co.target && e.target === co.source)
      )) {
        edges.push(co);
        
        const sourceNode = nodeMap.get(co.source);
        const targetNode = nodeMap.get(co.target);
        if (sourceNode) sourceNode.degree++;
        if (targetNode) targetNode.degree++;
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    };
  }

  /**
   * Detect character co-occurrences in memories
   */
  private detectCoOccurrences(
    memories: MemoryData[],
    characters: CharacterData[]
  ): RelationshipEdge[] {
    const characterNameMap = new Map(
      characters.map(c => [c.name.toLowerCase(), c.id])
    );
    const edges: RelationshipEdge[] = [];
    const coOccurrenceCounts = new Map<string, number>();

    for (const memory of memories) {
      const mentionedChars: string[] = [];
      
      // Check people array
      for (const person of memory.people || []) {
        const charId = characterNameMap.get(person.toLowerCase());
        if (charId) {
          mentionedChars.push(charId);
        }
      }

      // Also check text content for character names
      const textLower = memory.text.toLowerCase();
      for (const [name, charId] of characterNameMap.entries()) {
        if (textLower.includes(name) && !mentionedChars.includes(charId)) {
          mentionedChars.push(charId);
        }
      }

      // Count co-occurrences
      for (let i = 0; i < mentionedChars.length; i++) {
        for (let j = i + 1; j < mentionedChars.length; j++) {
          const pair = [mentionedChars[i], mentionedChars[j]].sort().join('|');
          coOccurrenceCounts.set(pair, (coOccurrenceCounts.get(pair) || 0) + 1);
        }
      }
    }

    // Create edges for significant co-occurrences (threshold: 2)
    for (const [pair, count] of coOccurrenceCounts.entries()) {
      if (count >= 2) {
        const [source, target] = pair.split('|');
        edges.push({
          source,
          target,
          weight: Math.min(1, count / 10), // Normalize
          type: 'co_occurrence',
        });
      }
    }

    return edges;
  }

  /**
   * Compute centrality scores (degree and eigenvector approximation)
   */
  private computeCentrality(
    nodes: RelationshipNode[],
    edges: RelationshipEdge[]
  ): Array<{ name: string; centrality: number }> {
    // Simple degree centrality (can be enhanced with eigenvector)
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Compute degree centrality
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (source) source.centrality += edge.weight;
      if (target) target.centrality += edge.weight;
    }

    // Normalize by max degree
    const maxCentrality = Math.max(...nodes.map(n => n.centrality), 1);
    for (const node of nodes) {
      node.centrality = node.centrality / maxCentrality;
    }

    return nodes
      .map(n => ({ name: n.name, centrality: n.centrality }))
      .sort((a, b) => b.centrality - a.centrality);
  }

  /**
   * Build closeness graph from character relationships
   */
  private async buildClosenessGraph(
    characters: CharacterData[],
    userId: string
  ): Promise<Array<{ characterId: string; characterName: string; closeness: number }>> {
    const { data: relationships, error } = await supabaseAdmin
      .from('character_relationships')
      .select('target_character_id, closeness_score')
      .eq('user_id', userId)
      .eq('source_character_id', userId) // Self-relationships
      .or('target_character_id.eq.' + userId); // Or where user is target

    if (error) {
      logger.error({ error }, 'Error fetching closeness relationships');
      return [];
    }

    const characterMap = new Map(characters.map(c => [c.id, c]));
    const closenessData: Array<{ characterId: string; characterName: string; closeness: number }> = [];

    if (relationships) {
      for (const rel of relationships) {
        const charId = rel.target_character_id || rel.source_character_id;
        const character = characterMap.get(charId);
        if (character) {
          closenessData.push({
            characterId: charId,
            characterName: character.name,
            closeness: (rel.closeness_score || 0) / 10, // Normalize to 0-1
          });
        }
      }
    }

    return closenessData.sort((a, b) => b.closeness - a.closeness);
  }

  /**
   * Detect lifecycle phases (Rise, Peak, Drift, Decline)
   */
  private detectLifecyclePhases(
    memories: MemoryData[],
    characters: CharacterData[]
  ): LifecyclePhase[] {
    const phases: LifecyclePhase[] = [];
    const characterNameMap = new Map(
      characters.map(c => [c.name.toLowerCase(), c])
    );

    for (const character of characters) {
      // Get all memories mentioning this character
      const characterMemories = memories.filter(m => {
        const people = (m.people || []).map(p => p.toLowerCase());
        const textLower = m.text.toLowerCase();
        return people.includes(character.name.toLowerCase()) ||
               textLower.includes(character.name.toLowerCase());
      });

      if (characterMemories.length < 3) {
        continue; // Not enough data
      }

      // Sort by date
      characterMemories.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Compute mention frequency over time (rolling window)
      const windowSize = Math.max(3, Math.floor(characterMemories.length / 3));
      const frequencies = this.rollingWindow(
        characterMemories,
        windowSize,
        (window) => window.length
      );

      // Detect phases based on frequency trends
      const currentPhase = this.determinePhase(frequencies);
      const startDate = characterMemories[0].created_at;
      const endDate = characterMemories[characterMemories.length - 1].created_at;
      const intensity = frequencies.length > 0
        ? frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length
        : 0;

      phases.push({
        characterId: character.id,
        characterName: character.name,
        phase: currentPhase,
        startDate,
        endDate,
        intensity: intensity / characterMemories.length, // Normalize
      });
    }

    return phases;
  }

  /**
   * Determine phase from frequency trend
   */
  private determinePhase(frequencies: number[]): 'rise' | 'peak' | 'drift' | 'decline' {
    if (frequencies.length < 2) {
      return 'drift';
    }

    const firstHalf = frequencies.slice(0, Math.floor(frequencies.length / 2));
    const secondHalf = frequencies.slice(Math.floor(frequencies.length / 2));

    const firstAvg = firstHalf.reduce((sum, f) => sum + f, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, f) => sum + f, 0) / secondHalf.length;

    const trend = secondAvg - firstAvg;
    const current = frequencies[frequencies.length - 1];
    const maxFreq = Math.max(...frequencies);

    if (trend > 0.2 && current > maxFreq * 0.8) {
      return 'peak';
    } else if (trend > 0.1) {
      return 'rise';
    } else if (trend < -0.1) {
      return 'decline';
    } else {
      return 'drift';
    }
  }

  /**
   * Compute emotional impact ranking
   */
  private computeEmotionalImpact(
    memories: MemoryData[],
    characters: CharacterData[]
  ): Array<{ characterName: string; impact: number; sentiment: number }> {
    const impactMap = new Map<string, { count: number; totalSentiment: number }>();

    for (const memory of memories) {
      const sentiment = memory.sentiment ?? 0;
      const people = memory.people || [];
      const textLower = memory.text.toLowerCase();

      for (const character of characters) {
        const mentioned = people.includes(character.name) ||
                         textLower.includes(character.name.toLowerCase());

        if (mentioned) {
          const existing = impactMap.get(character.id) || { count: 0, totalSentiment: 0 };
          impactMap.set(character.id, {
            count: existing.count + 1,
            totalSentiment: existing.totalSentiment + Math.abs(sentiment),
          });
        }
      }
    }

    return Array.from(impactMap.entries())
      .map(([charId, data]) => {
        const character = characters.find(c => c.id === charId);
        return {
          characterName: character?.name || 'Unknown',
          impact: data.count * (data.totalSentiment / data.count), // Weighted impact
          sentiment: data.totalSentiment / data.count,
        };
      })
      .sort((a, b) => b.impact - a.impact);
  }

  /**
   * Format lifecycle for chart
   */
  private formatLifecycleForChart(lifecycle: LifecyclePhase[]): Array<{ date: string; intensity: number; phase: string }> {
    return lifecycle.map(l => ({
      date: l.startDate,
      intensity: l.intensity,
      phase: l.phase,
    }));
  }

  /**
   * Generate insights
   */
  private generateCentralityInsights(
    centrality: Array<{ name: string; centrality: number }>
  ): Array<{ text: string; category: string; score: number }> {
    if (centrality.length === 0) {
      return [];
    }

    const top = centrality[0];
    return [
      {
        text: `${top.name} is the most central character in your relationship network (centrality: ${top.centrality.toFixed(2)}).`,
        category: 'relationship_centrality',
        score: top.centrality,
      },
    ];
  }

  private generateLifecycleInsights(lifecycle: LifecyclePhase[]): Array<{ text: string; category: string; score: number }> {
    const rising = lifecycle.filter(l => l.phase === 'rise').length;
    const declining = lifecycle.filter(l => l.phase === 'decline').length;

    const insights = [];
    if (rising > 0) {
      insights.push({
        text: `${rising} relationship${rising > 1 ? 's are' : ' is'} in a rising phase, showing increasing engagement.`,
        category: 'relationship_lifecycle',
        score: rising / lifecycle.length,
      });
    }
    if (declining > 0) {
      insights.push({
        text: `${declining} relationship${declining > 1 ? 's are' : ' is'} in decline, with decreasing interaction.`,
        category: 'relationship_lifecycle',
        score: declining / lifecycle.length,
      });
    }

    return insights;
  }

  private generateEmotionalImpactInsights(
    impact: Array<{ characterName: string; impact: number; sentiment: number }>
  ): Array<{ text: string; category: string; score: number }> {
    if (impact.length === 0) {
      return [];
    }

    const top = impact[0];
    return [
      {
        text: `${top.characterName} has the highest emotional impact (${top.impact.toFixed(2)}), with ${top.sentiment > 0 ? 'positive' : 'negative'} sentiment.`,
        category: 'emotional_impact',
        score: Math.abs(top.impact),
      },
    ];
  }

  private generateSummary(
    characters: CharacterData[],
    edges: RelationshipEdge[],
    lifecycle: LifecyclePhase[],
    emotionalImpact: Array<{ characterName: string; impact: number; sentiment: number }>
  ): string {
    const active = lifecycle.filter(l => l.phase === 'peak' || l.phase === 'rise').length;
    const topImpact = emotionalImpact[0];

    let summary = `Your relationship network includes ${characters.length} characters with ${edges.length} connections. `;
    summary += `${active} relationship${active !== 1 ? 's are' : ' is'} currently active or rising. `;
    
    if (topImpact) {
      summary += `${topImpact.characterName} has the strongest emotional impact in your life.`;
    }

    return summary;
  }

  /**
   * Compute sentiment timeline per character
   */
  private computeSentimentTimeline(
    memories: MemoryData[],
    characters: CharacterData[]
  ): Array<{ character: string; timeline: Array<{ date: string; sentiment: number; emotion: string }> }> {
    const characterNameMap = new Map(characters.map(c => [c.name.toLowerCase(), c.name]));
    const timelineMap = new Map<string, Array<{ date: string; sentiment: number; emotion: string }>>();

    for (const memory of memories) {
      const people = (memory.people || []).map(p => p.toLowerCase());
      const textLower = memory.text.toLowerCase();
      const sentiment = memory.sentiment ?? 0;
      const emotion = this.sentimentToEmotion(sentiment);

      for (const [nameLower, name] of characterNameMap.entries()) {
        if (people.includes(nameLower) || textLower.includes(nameLower)) {
          if (!timelineMap.has(name)) {
            timelineMap.set(name, []);
          }
          timelineMap.get(name)!.push({
            date: memory.created_at,
            sentiment,
            emotion,
          });
        }
      }
    }

    // Sort timelines by date and aggregate by week
    const result: Array<{ character: string; timeline: Array<{ date: string; sentiment: number; emotion: string }> }> = [];
    for (const [character, timeline] of timelineMap.entries()) {
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      // Aggregate weekly averages
      const weeklyMap = new Map<string, { sum: number; count: number; emotion: string }>();
      for (const point of timeline) {
        const week = this.getWeekKey(point.date);
        const existing = weeklyMap.get(week) || { sum: 0, count: 0, emotion: point.emotion };
        existing.sum += point.sentiment;
        existing.count += 1;
        weeklyMap.set(week, existing);
      }
      const aggregated = Array.from(weeklyMap.entries()).map(([date, data]) => ({
        date,
        sentiment: data.sum / data.count,
        emotion: data.emotion,
      }));
      result.push({ character, timeline: aggregated });
    }

    return result;
  }

  /**
   * Convert sentiment to emotion label
   */
  private sentimentToEmotion(sentiment: number): string {
    if (sentiment > 0.5) return 'positive';
    if (sentiment > 0.1) return 'neutral-positive';
    if (sentiment > -0.1) return 'neutral';
    if (sentiment > -0.5) return 'neutral-negative';
    return 'negative';
  }

  /**
   * Get week key from date string
   */
  private getWeekKey(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week}`;
  }

  /**
   * Classify relationship archetypes
   */
  private async classifyArchetypes(
    characters: CharacterData[],
    centralityScores: Array<{ name: string; centrality: number }>,
    emotionalImpact: Array<{ characterName: string; impact: number; sentiment: number }>,
    userId: string
  ): Promise<Array<{ character: string; archetype: string; reasoning: string }>> {
    const centralityMap = new Map(centralityScores.map(c => [c.name, c.centrality]));
    const impactMap = new Map(emotionalImpact.map(e => [e.characterName, e]));

    // Fetch relationship conflicts
    const { data: relationships } = await supabaseAdmin
      .from('character_relationships')
      .select('target_character_id, closeness_score')
      .eq('user_id', userId);

    const conflictMap = new Map<string, number>();
    if (relationships) {
      for (const rel of relationships) {
        const char = characters.find(c => c.id === rel.target_character_id);
        if (char && (rel.closeness_score || 0) < 0) {
          conflictMap.set(char.name, (conflictMap.get(char.name) || 0) + Math.abs(rel.closeness_score || 0));
        }
      }
    }

    const result: Array<{ character: string; archetype: string; reasoning: string }> = [];

    for (const character of characters) {
      const centrality = centralityMap.get(character.name) || 0;
      const impact = impactMap.get(character.name);
      const conflict = conflictMap.get(character.name) || 0;
      const sentiment = impact?.sentiment || 0;
      const impactScore = impact?.impact || 0;

      let archetype: string;
      let reasoning: string;

      if (centrality > 0.7 && sentiment > 0.3) {
        archetype = 'Protector';
        reasoning = 'High centrality + positive sentiment';
      } else if (conflict > 5 || (sentiment < -0.3 && impactScore > 10)) {
        archetype = 'Antagonist';
        reasoning = 'High conflict or negative impact';
      } else if (centrality > 0.5 && Math.abs(sentiment) > 0.4) {
        archetype = 'Chaotic';
        reasoning = 'High centrality with volatile sentiment';
      } else if (impactScore > 15 && sentiment > 0.2) {
        archetype = 'Important';
        reasoning = 'High frequency + high emotional intensity';
      } else if (impactScore < 5 && Math.abs(sentiment) < 0.2) {
        archetype = 'Peripheral';
        reasoning = 'Low frequency + neutral sentiment';
      } else {
        archetype = 'Supporting';
        reasoning = 'Moderate presence in your life';
      }

      result.push({ character: character.name, archetype, reasoning });
    }

    return result;
  }

  /**
   * Compute attachment gravity score (0-100)
   */
  private async computeAttachmentGravity(
    memories: MemoryData[],
    characters: CharacterData[],
    centralityScores: Array<{ name: string; centrality: number }>,
    userId: string
  ): Promise<Array<{ character: string; score: number }>> {
    const centralityMap = new Map(centralityScores.map(c => [c.name, c.centrality]));
    const characterNameMap = new Map(characters.map(c => [c.name.toLowerCase(), c.name]));

    // Compute sentiment intensity and volatility per character
    const sentimentData = new Map<string, number[]>();
    const mentionCounts = new Map<string, number>();
    const recencyScores = new Map<string, number>();

    const now = Date.now();
    for (const memory of memories) {
      const people = (memory.people || []).map(p => p.toLowerCase());
      const textLower = memory.text.toLowerCase();
      const sentiment = memory.sentiment ?? 0;
      const memoryDate = new Date(memory.created_at).getTime();
      const daysAgo = (now - memoryDate) / (1000 * 60 * 60 * 24);

      for (const [nameLower, name] of characterNameMap.entries()) {
        if (people.includes(nameLower) || textLower.includes(nameLower)) {
          if (!sentimentData.has(name)) {
            sentimentData.set(name, []);
            mentionCounts.set(name, 0);
          }
          sentimentData.get(name)!.push(Math.abs(sentiment));
          mentionCounts.set(name, mentionCounts.get(name)! + 1);
          // Recency score: more recent = higher score
          const recency = Math.max(0, 1 - daysAgo / 365); // Decay over 1 year
          recencyScores.set(name, (recencyScores.get(name) || 0) + recency);
        }
      }
    }

    // Fetch arc frequency
    const arcFrequencyMap = new Map<string, number>();
    try {
      const { data: arcs } = await supabaseAdmin
        .from('arcs')
        .select('id, label')
        .eq('user_id', userId);

      if (arcs) {
        for (const character of characters) {
          const characterMemories = memories.filter(m => {
            const people = (m.people || []).map(p => p.toLowerCase());
            const textLower = m.text.toLowerCase();
            return people.includes(character.name.toLowerCase()) ||
                   textLower.includes(character.name.toLowerCase());
          });
          arcFrequencyMap.set(character.name, characterMemories.length);
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Error fetching arcs for attachment gravity');
    }

    const result: Array<{ character: string; score: number }> = [];

    for (const character of characters) {
      const sentiments = sentimentData.get(character.name) || [];
      const sentimentIntensity = sentiments.length > 0
        ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
        : 0;
      const volatility = sentiments.length > 1
        ? this.standardDeviation(sentiments)
        : 0;
      const arcFrequency = (arcFrequencyMap.get(character.name) || 0) / 10; // Normalize
      const recency = (recencyScores.get(character.name) || 0) / Math.max(1, mentionCounts.get(character.name) || 1);
      const centrality = centralityMap.get(character.name) || 0;

      // Normalize components (0-1 scale)
      const normalizedIntensity = Math.min(1, sentimentIntensity);
      const normalizedVolatility = Math.min(1, volatility);
      const normalizedArcFreq = Math.min(1, arcFrequency);
      const normalizedRecency = Math.min(1, recency);
      const normalizedCentrality = centrality;

      // Weighted combination
      const gravity = (
        normalizedIntensity * 0.25 +
        normalizedVolatility * 0.15 +
        normalizedArcFreq * 0.25 +
        normalizedRecency * 0.15 +
        normalizedCentrality * 0.20
      ) * 100;

      result.push({ character: character.name, score: Math.round(gravity) });
    }

    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * Compute relationship forecast
   */
  private computeRelationshipForecast(
    sentimentTimeline: Array<{ character: string; timeline: Array<{ date: string; sentiment: number; emotion: string }> }>
  ): Array<{ character: string; trend: 'warming' | 'cooling' | 'stable' | 'volatile'; confidence: number }> {
    const result: Array<{ character: string; trend: 'warming' | 'cooling' | 'stable' | 'volatile'; confidence: number }> = [];

    for (const { character, timeline } of sentimentTimeline) {
      if (timeline.length < 3) {
        result.push({ character, trend: 'stable', confidence: 50 });
        continue;
      }

      const sentiments = timeline.map(t => t.sentiment);
      const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
      const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));

      const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;
      const slope = secondAvg - firstAvg;
      const volatility = this.standardDeviation(sentiments);

      let trend: 'warming' | 'cooling' | 'stable' | 'volatile';
      let confidence: number;

      if (volatility > 0.4) {
        trend = 'volatile';
        confidence = Math.min(95, Math.round(volatility * 100));
      } else if (slope > 0.15) {
        trend = 'warming';
        confidence = Math.min(95, Math.round(Math.abs(slope) * 200));
      } else if (slope < -0.15) {
        trend = 'cooling';
        confidence = Math.min(95, Math.round(Math.abs(slope) * 200));
      } else {
        trend = 'stable';
        confidence = Math.max(50, Math.round(100 - Math.abs(slope) * 200));
      }

      result.push({ character, trend, confidence });
    }

    return result;
  }

  /**
   * Compute arc appearances
   */
  private async computeArcAppearances(
    characters: CharacterData[],
    userId: string
  ): Promise<Array<{ character: string; arcs: Array<{ arcName: string; count: number }> }>> {
    const result: Array<{ character: string; arcs: Array<{ arcName: string; count: number }> }> = [];

    try {
      // Fetch arcs
      const { data: arcs } = await supabaseAdmin
        .from('arcs')
        .select('id, label')
        .eq('user_id', userId);

      // Fetch entries with arc associations
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, people, content, metadata')
        .eq('user_id', userId);

      if (!arcs || !entries) {
        return characters.map(c => ({ character: c.name, arcs: [] }));
      }

      // Build character-arc associations
      const characterArcMap = new Map<string, Map<string, number>>();

      for (const entry of entries) {
        const people = (entry.people || []).map((p: string) => p.toLowerCase());
        const textLower = (entry.content || '').toLowerCase();
        const arcId = entry.metadata?.arc_id || entry.metadata?.arcId;

        if (!arcId) continue;

        const arc = arcs.find((a: any) => a.id === arcId);
        if (!arc) continue;

        for (const character of characters) {
          const nameLower = character.name.toLowerCase();
          if (people.includes(nameLower) || textLower.includes(nameLower)) {
            if (!characterArcMap.has(character.name)) {
              characterArcMap.set(character.name, new Map());
            }
            const arcMap = characterArcMap.get(character.name)!;
            arcMap.set(arc.label, (arcMap.get(arc.label) || 0) + 1);
          }
        }
      }

      for (const character of characters) {
        const arcMap = characterArcMap.get(character.name) || new Map();
        const arcs = Array.from(arcMap.entries()).map(([arcName, count]) => ({ arcName, count }));
        result.push({ character: character.name, arcs });
      }
    } catch (error) {
      logger.error({ error }, 'Error computing arc appearances');
      return characters.map(c => ({ character: c.name, arcs: [] }));
    }

    return result;
  }

  /**
   * Compute heatmap matrix (weekly mention frequency)
   */
  private computeHeatmapMatrix(
    memories: MemoryData[],
    characters: CharacterData[]
  ): Array<{ character: string; values: number[] }> {
    const characterNameMap = new Map(characters.map(c => [c.name.toLowerCase(), c.name]));
    const result: Array<{ character: string; values: number[] }> = [];

    // Get date range
    if (memories.length === 0) {
      return characters.map(c => ({ character: c.name, values: [] }));
    }

    const dates = memories.map(m => new Date(m.created_at)).sort((a, b) => a.getTime() - b.getTime());
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const weeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

    for (const character of characters) {
      const nameLower = character.name.toLowerCase();
      const weeklyCounts = new Array(weeks).fill(0);

      for (const memory of memories) {
        const people = (memory.people || []).map(p => p.toLowerCase());
        const textLower = memory.text.toLowerCase();
        if (people.includes(nameLower) || textLower.includes(nameLower)) {
          const memoryDate = new Date(memory.created_at);
          const weekIndex = Math.floor((memoryDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (weekIndex >= 0 && weekIndex < weeks) {
            weeklyCounts[weekIndex]++;
          }
        }
      }

      result.push({ character: character.name, values: weeklyCounts });
    }

    return result;
  }

  /**
   * Get average sentiment for a character
   */
  private getAverageSentimentForCharacter(characterName: string, memories: MemoryData[]): number {
    const nameLower = characterName.toLowerCase();
    const sentiments: number[] = [];

    for (const memory of memories) {
      const people = (memory.people || []).map(p => p.toLowerCase());
      const textLower = memory.text.toLowerCase();
      if (people.includes(nameLower) || textLower.includes(nameLower)) {
        if (memory.sentiment !== null) {
          sentiments.push(memory.sentiment);
        }
      }
    }

    return sentiments.length > 0
      ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
      : 0;
  }

  /**
   * Get edge sentiment between two characters
   */
  private getEdgeSentiment(sourceName: string, targetName: string, memories: MemoryData[]): number {
    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();
    const sentiments: number[] = [];

    for (const memory of memories) {
      const people = (memory.people || []).map(p => p.toLowerCase());
      const textLower = memory.text.toLowerCase();
      const hasSource = people.includes(sourceLower) || textLower.includes(sourceLower);
      const hasTarget = people.includes(targetLower) || textLower.includes(targetLower);

      if (hasSource && hasTarget && memory.sentiment !== null) {
        sentiments.push(memory.sentiment);
      }
    }

    return sentiments.length > 0
      ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
      : 0;
  }

  private mockPayload(): AnalyticsPayload {
    const mockCharacters = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley'];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Generate sentiment timeline data
    const sentimentTimeline = mockCharacters.slice(0, 5).map(character => {
      const timeline = [];
      for (let i = 30; i >= 0; i--) {
        const date = new Date(now - i * oneDay);
        const baseSentiment = Math.sin(i / 5) * 0.3 + (Math.random() - 0.5) * 0.2;
        const emotions = ['positive', 'neutral', 'negative', 'intense', 'calm'];
        timeline.push({
          date: date.toISOString().split('T')[0],
          sentiment: Math.max(-1, Math.min(1, baseSentiment)),
          emotion: emotions[Math.floor(Math.random() * emotions.length)],
        });
      }
      return { character, timeline };
    });

    // Generate archetypes
    const archetypes = mockCharacters.slice(0, 6).map((char, idx) => {
      const types = ['Protector', 'Chaotic', 'Important', 'Peripheral', 'Antagonist', 'Supporting'];
      const reasonings = [
        'High centrality with consistently positive sentiment patterns',
        'Frequent conflicts and emotional volatility detected',
        'Strong emotional impact and high mention frequency',
        'Low interaction frequency with neutral sentiment',
        'Negative sentiment patterns with significant impact',
        'Moderate presence with balanced emotional influence',
      ];
      return {
        character: char,
        archetype: types[idx % types.length],
        reasoning: reasonings[idx % reasonings.length],
      };
    });

    // Generate attachment gravity scores
    const attachmentGravity = mockCharacters.slice(0, 6).map((char, idx) => ({
      character: char,
      score: Math.floor(20 + Math.random() * 70), // 20-90 range
    }));

    // Generate forecast data
    const forecast = mockCharacters.slice(0, 5).map((char, idx) => {
      const trends: Array<'warming' | 'cooling' | 'stable' | 'volatile'> = ['warming', 'cooling', 'stable', 'volatile'];
      const trend = trends[idx % trends.length];
      const sparklineData = [];
      for (let i = 0; i < 10; i++) {
        sparklineData.push({
          date: new Date(now + i * oneDay).toISOString().split('T')[0],
          value: 50 + Math.sin(i / 2) * 20 + (Math.random() - 0.5) * 10,
        });
      }
      return {
        character: char,
        trend,
        confidence: Math.floor(60 + Math.random() * 35), // 60-95%
        sparklineData,
      };
    });

    // Generate arc appearances
    const arcAppearances = mockCharacters.slice(0, 5).map((char) => ({
      character: char,
      arcs: [
        { arcName: 'Rebirth Arc', count: Math.floor(5 + Math.random() * 15) },
        { arcName: 'Growth Arc', count: Math.floor(3 + Math.random() * 12) },
        { arcName: 'Conflict Arc', count: Math.floor(2 + Math.random() * 10) },
        { arcName: 'Resolution Arc', count: Math.floor(1 + Math.random() * 8) },
      ],
    }));

    // Generate heatmap data (weekly for last 12 weeks)
    const heatmap = mockCharacters.slice(0, 5).map(() => ({
      character: mockCharacters[Math.floor(Math.random() * mockCharacters.length)],
      values: Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)),
    }));

    // Generate graph nodes and edges
    const nodes = mockCharacters.slice(0, 6).map((char, idx) => ({
      id: `char-${idx}`,
      label: char,
      type: 'character' as const,
      metadata: {
        degree: Math.floor(2 + Math.random() * 4),
        centrality: 0.3 + Math.random() * 0.5,
        sentimentScore: (Math.random() - 0.5) * 0.6,
        arcFrequency: Math.floor(5 + Math.random() * 20),
      },
    }));

    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < Math.min(i + 3, nodes.length); j++) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          weight: 0.3 + Math.random() * 0.7,
          type: 'relationship' as const,
          metadata: {
            sentiment: (Math.random() - 0.5) * 1.2,
            recentScore: 0.3 + Math.random() * 0.7,
          },
        });
      }
    }

    // Generate centrality scores for charts
    const centralityScores = nodes.map((n, idx) => ({
      name: n.label,
      centrality: n.metadata.centrality,
    })).sort((a, b) => b.centrality - a.centrality);

    // Generate lifecycle data for charts
    const lifecycleData = [];
    for (let i = 0; i < 20; i++) {
      const date = new Date(now - (20 - i) * oneDay);
      lifecycleData.push({
        date: date.toISOString().split('T')[0],
        intensity: 0.3 + Math.sin(i / 3) * 0.3 + Math.random() * 0.2,
      });
    }

    return {
      metrics: {
        totalCharacters: mockCharacters.length,
        totalRelationships: edges.length,
        averageCloseness: 0.65,
        mostCentralCharacter: centralityScores[0]?.name || 'Alex',
        activeRelationships: Math.floor(edges.length * 0.7),
      },
      charts: [
        {
          type: 'bar',
          title: 'Character Centrality',
          data: centralityScores.slice(0, 10),
          xAxis: 'name',
          yAxis: 'centrality',
        },
        {
          type: 'line',
          title: 'Relationship Lifecycle',
          data: lifecycleData,
          xAxis: 'date',
          yAxis: 'intensity',
        },
      ],
      graph: {
        nodes,
        edges,
      },
      insights: [
        {
          text: `${centralityScores[0]?.name || 'Alex'} is the most central character in your relationship network`,
          category: 'centrality',
          score: 0.85,
        },
        {
          text: 'Relationship sentiment shows positive trends over the last month',
          category: 'trend',
          score: 0.72,
        },
        {
          text: 'Multiple relationships are in active growth phases',
          category: 'lifecycle',
          score: 0.68,
        },
        {
          text: 'Attachment gravity scores indicate strong emotional connections',
          category: 'attachment',
          score: 0.75,
        },
      ],
      summary: `Your relationship network consists of ${mockCharacters.length} key characters with ${edges.length} active relationships. ${centralityScores[0]?.name || 'Alex'} emerges as the most central figure, with strong emotional connections and high interaction frequency. Recent sentiment analysis shows positive trends, with most relationships in growth or stable phases. The network demonstrates healthy emotional dynamics with balanced attachment patterns.`,
      metadata: {
        sentimentTimeline,
        archetypes,
        attachmentGravity,
        forecast,
        arcAppearances,
        heatmap,
      },
    };
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      graph: { nodes: [], edges: [] },
      insights: [],
      summary: 'Not enough data to generate relationship analytics.',
      metadata: {
        sentimentTimeline: [],
        archetypes: [],
        attachmentGravity: [],
        forecast: [],
        arcAppearances: [],
        heatmap: [],
      },
    };
  }
}

export const relationshipAnalyticsModule = new RelationshipAnalyticsModule();


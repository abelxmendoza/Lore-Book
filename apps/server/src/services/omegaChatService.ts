import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import { memoryService } from './memoryService';
import { chapterService } from './chapterService';
import { memoirService } from './memoirService';
import { autopilotService } from './autopilotService';
import { taskEngineService } from './taskEngineService';
import { peoplePlacesService } from './peoplePlacesService';
import { orchestratorService } from './orchestratorService';
import { hqiService } from './hqiService';
import { memoryGraphService } from './memoryGraphService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';
import { correctionService } from './correctionService';
import { timeEngine } from './timeEngine';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type ChatSource = {
  type: 'entry' | 'chapter' | 'character' | 'task' | 'hqi' | 'fabric';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

export type OmegaChatResponse = {
  answer: string;
  entryId?: string;
  characterIds?: string[];
  connections?: string[];
  continuityWarnings?: string[];
  timelineUpdates?: string[];
  strategicGuidance?: string;
  extractedDates?: Array<{ date: string; context: string }>;
  sources?: ChatSource[];
  citations?: Array<{ text: string; sourceId: string; sourceType: string }>;
};

export type StreamingChatResponse = {
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata: {
    entryId?: string;
    characterIds?: string[];
    sources?: ChatSource[];
    connections?: string[];
    continuityWarnings?: string[];
    timelineUpdates?: string[];
  };
};

class OmegaChatService {
  /**
   * Build comprehensive RAG packet using orchestrator
   */
  private async buildRAGPacket(userId: string, message: string) {
    // Get full orchestrator summary
    const orchestratorSummary = await orchestratorService.getSummary(userId);

    // Get HQI semantic search results
    const hqiResults = hqiService.search(message, {}).slice(0, 5);

    // Get related entries for Memory Fabric
    const relatedEntries = await memoryService.searchEntriesWithCorrections(userId, {
      search: message,
      limit: 20
    });

    // Build Memory Fabric neighbors from top entries
    const fabricNeighbors: ChatSource[] = [];
    try {
      if (relatedEntries.length > 0) {
        const graph = await memoryGraphService.buildGraph(userId);
        const topEntryIds = relatedEntries.slice(0, 5).map(e => e.id);
        const addedNeighbors = new Set<string>();
        
        topEntryIds.forEach(entryId => {
          const entryNode = graph.nodes.find(n => n.id === entryId);
          if (entryNode) {
            // Find neighbors through edges
            const neighborEdges = graph.edges.filter(e => 
              (e.source === entryId || e.target === entryId) && !addedNeighbors.has(e.source === entryId ? e.target : e.source)
            );
            neighborEdges.slice(0, 3).forEach(edge => {
              const neighborId = edge.source === entryId ? edge.target : edge.source;
              const neighborNode = graph.nodes.find(n => n.id === neighborId);
              if (neighborNode && neighborNode.type === 'event' && !addedNeighbors.has(neighborId)) {
                addedNeighbors.add(neighborId);
                fabricNeighbors.push({
                  type: 'fabric',
                  id: neighborId,
                  title: neighborNode.label,
                  snippet: (neighborNode.metadata as any)?.content?.substring(0, 100) || neighborNode.label
                });
              }
            });
          }
        });
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to build Memory Fabric neighbors');
    }

    // Extract dates
    const extractedDates = await this.extractDatesAndTimes(message);

    // Build sources array
    const sources: ChatSource[] = [
      ...orchestratorSummary.timeline.events.slice(0, 10).map(e => ({
        type: 'entry' as const,
        id: e.id,
        title: e.summary || e.content?.substring(0, 50) || 'Untitled',
        snippet: e.summary || e.content?.substring(0, 150),
        date: e.date
      })),
      ...orchestratorSummary.characters.slice(0, 5).map(c => ({
        type: 'character' as const,
        id: (c.character as any).id,
        title: (c.character as any).name || 'Unknown',
        snippet: (c.character as any).summary
      })),
      ...orchestratorSummary.timeline.arcs.slice(0, 3).map((arc: any) => ({
        type: 'chapter' as const,
        id: arc.id || 'unknown',
        title: arc.title || 'Untitled Chapter',
        date: arc.start_date
      })),
      ...hqiResults.map(r => ({
        type: 'hqi' as const,
        id: r.node_id,
        title: r.title,
        snippet: r.snippet,
        date: r.timestamp
      })),
      ...fabricNeighbors
    ];

    return {
      orchestratorSummary,
      hqiResults,
      relatedEntries,
      fabricNeighbors,
      extractedDates,
      sources
    };
  }

  /**
   * Extract dates and times from message using TimeEngine
   */
  private async extractDatesAndTimes(message: string): Promise<Array<{ date: string; context: string; precision: string; confidence: number }>> {
    try {
      // First, use OpenAI to identify temporal references
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract all dates, times, and temporal references from the text. Return JSON with array of {text: original text, context: brief description}. Include relative dates like "yesterday", "last week", "next month", and absolute dates.'
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const temporalRefs = parsed.dates || parsed.temporal_references || [];

      // Parse each reference using TimeEngine
      const extracted = temporalRefs.map((ref: any) => {
        const text = ref.text || ref.date || '';
        const temporalRef = timeEngine.parseTimestamp(text);
        
        return {
          date: temporalRef.timestamp.toISOString(),
          context: ref.context || text,
          precision: temporalRef.precision,
          confidence: temporalRef.confidence,
          originalText: temporalRef.originalText || text
        };
      });

      return extracted;
    } catch (error) {
      logger.error({ error }, 'Failed to extract dates');
      return [];
    }
  }

  /**
   * Check continuity issues
   */
  private async checkContinuity(
    userId: string,
    message: string,
    extractedDates: Array<{ date: string; context: string }>,
    orchestratorSummary: any
  ): Promise<string[]> {
    const warnings: string[] = [];
    
    try {
      const continuity = orchestratorSummary.continuity;
      if (continuity?.conflicts && continuity.conflicts.length > 0) {
        continuity.conflicts.forEach((conflict: any) => {
          warnings.push(`Continuity issue: ${conflict.description || conflict.detail || 'Potential conflict detected'}`);
        });
      }

      // Check for date conflicts
      const recentEntries = orchestratorSummary.timeline.events.slice(0, 50);
      for (const dateInfo of extractedDates) {
        const date = new Date(dateInfo.date);
        const conflictingEntries = recentEntries.filter((entry: any) => {
          const entryDate = new Date(entry.date);
          const daysDiff = Math.abs((date.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          return daysDiff < 1 && entry.content?.toLowerCase().includes(dateInfo.context.toLowerCase());
        });

        if (conflictingEntries.length > 0) {
          warnings.push(`Potential conflict: ${dateInfo.context} on ${dateInfo.date} may overlap with existing entries`);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check continuity');
    }

    return warnings;
  }

  /**
   * Find connections
   */
  private async findConnections(
    userId: string,
    message: string,
    orchestratorSummary: any,
    hqiResults: any[],
    sources: ChatSource[]
  ): Promise<string[]> {
    const connections: string[] = [];

    // HQI connections
    if (hqiResults.length > 0) {
      connections.push(`Found ${hqiResults.length} semantically related memories via HQI`);
    }

    // Character connections
    const mentionedCharacters = orchestratorSummary.characters.filter((char: any) =>
      message.toLowerCase().includes((char.character.name || '').toLowerCase())
    );
    if (mentionedCharacters.length > 0) {
      connections.push(`Mentioned ${mentionedCharacters.length} character${mentionedCharacters.length > 1 ? 's' : ''}: ${mentionedCharacters.map((c: any) => c.character.name).join(', ')}`);
    }

    // Fabric neighbors
    const fabricSources = sources.filter(s => s.type === 'fabric');
    if (fabricSources.length > 0) {
      connections.push(`Found ${fabricSources.length} related memories through Memory Fabric`);
    }

    // Chapter connections
    const chapters = orchestratorSummary.timeline.arcs || [];
    if (chapters.length > 0) {
      const relevantChapters = chapters.filter((ch: any) =>
        message.toLowerCase().includes((ch.title || '').toLowerCase())
      );
      if (relevantChapters.length > 0) {
        connections.push(`Related to ${relevantChapters.length} chapter${relevantChapters.length > 1 ? 's' : ''}: ${relevantChapters.map((c: any) => c.title).join(', ')}`);
      }
    }

    return connections;
  }

  /**
   * Generate inline citations from sources
   */
  private generateCitations(sources: ChatSource[], answer: string): Array<{ text: string; sourceId: string; sourceType: string }> {
    const citations: Array<{ text: string; sourceId: string; sourceType: string }> = [];
    
    // Simple citation extraction - find mentions of dates/titles in answer
    sources.slice(0, 10).forEach(source => {
      if (source.title && answer.toLowerCase().includes(source.title.toLowerCase().substring(0, 20))) {
        citations.push({
          text: source.title,
          sourceId: source.id,
          sourceType: source.type
        });
      } else if (source.date) {
        const dateStr = new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (answer.includes(dateStr)) {
          citations.push({
            text: dateStr,
            sourceId: source.id,
            sourceType: source.type
          });
        }
      }
    });

    return citations;
  }

  /**
   * Build comprehensive system prompt with all context
   */
  private buildSystemPrompt(
    orchestratorSummary: any,
    connections: string[],
    continuityWarnings: string[],
    strategicGuidance: string | null,
    sources: ChatSource[]
  ): string {
    const timelineSummary = orchestratorSummary.timeline.events
      .slice(0, 15)
      .map((e: any) => `Date: ${e.date}\n${e.summary || e.content?.substring(0, 100)}`)
      .join('\n---\n');

    const charactersList = orchestratorSummary.characters
      .slice(0, 10)
      .map((c: any) => `${c.character.name}${c.character.role ? ` (${c.character.role})` : ''}`)
      .join(', ');

    const chaptersList = orchestratorSummary.timeline.arcs
      .slice(0, 5)
      .map((arc: any) => `${arc.title} (${arc.start_date}${arc.end_date ? ` - ${arc.end_date}` : ''})`)
      .join('\n');

    return `You are an AI Life Guidance assistant integrated into Lore Keeper. Your role is to:

1. **Listen and Reflect**: Provide empathetic, thoughtful responses that show you understand what the user is sharing
2. **Make Connections**: Point out patterns, themes, and connections to their past entries
3. **Track the Story**: Help summarize their journey, noting key moments and evolution
4. **Update Knowledge**: Automatically extract and track dates, times, people, places, and events
5. **Check Continuity**: Watch for inconsistencies, conflicts, or contradictions in their story
6. **Provide Strategy**: Offer actionable guidance based on their patterns and current situation
7. **Maintain Timeline**: Help organize their memories chronologically and thematically

**Your Style**:
- Conversational and warm, like ChatGPT but focused on life guidance
- Reference specific dates and past entries when relevant (use format: "From your timeline, [Month Year]")
- Make connections between different periods of their life
- Offer strategic insights based on patterns you notice
- Be proactive about updating their timeline and memoir
- Show uncertainty when unsure rather than guessing

**Current Context**:
${chaptersList ? `Active Chapters:\n${chaptersList}\n\n` : ''}
${charactersList ? `Characters: ${charactersList}\n\n` : ''}
${connections.length > 0 ? `Connections Found:\n${connections.join('\n')}\n\n` : ''}
${continuityWarnings.length > 0 ? `⚠️ Continuity Warnings:\n${continuityWarnings.join('\n')}\n\n` : ''}
${strategicGuidance ? `${strategicGuidance}\n\n` : ''}

**Relevant Timeline Entries**:
${timelineSummary || 'No previous entries yet.'}

**Available Sources** (reference these in your response):
${sources.slice(0, 10).map((s, i) => `${i + 1}. [${s.type}] ${s.title}${s.date ? ` (${new Date(s.date).toLocaleDateString()})` : ''}`).join('\n')}`;
  }

  /**
   * Chat with streaming support
   */
  async chatStream(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<StreamingChatResponse> {
    // Build RAG packet
    const ragPacket = await this.buildRAGPacket(userId, message);
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Check continuity
    const continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);

    // Find connections
    const connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);

    // Get strategic guidance
    const strategicGuidance = await this.getStrategicGuidance(userId, message);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources
    );

    // Prepare messages
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: 'user' as const, content: message }
    ];

    // Create streaming response
    const stream = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7,
      stream: true,
      messages
    });

    // Save entry if needed
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    if (shouldPersistMessage(message)) {
      const savedEntry = await memoryService.saveEntry({
        userId,
        content: message,
        tags: extractTags(message),
        source: 'chat',
        metadata: { 
          autoCaptured: true,
          extractedDates,
          connections: connections.length,
          hasContinuityWarnings: continuityWarnings.length > 0,
          sourcesUsed: sources.length
        }
      });
      entryId = savedEntry.id;
      timelineUpdates.push('Entry saved to timeline');

      // Auto-update memoir (fire and forget)
      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });
    }

    // Extract characters
    const characters = await peoplePlacesService.listEntities(userId);
    const mentionedCharacters = characters.filter(char =>
      message.toLowerCase().includes(char.name.toLowerCase())
    );
    const characterIds = mentionedCharacters.map(c => c.id);

    return {
      stream,
      metadata: {
        entryId,
        characterIds,
        sources: sources.slice(0, 10),
        connections,
        continuityWarnings,
        timelineUpdates
      }
    };
  }

  /**
   * Non-streaming chat (fallback)
   */
  async chat(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<OmegaChatResponse> {
    // Build RAG packet
    const ragPacket = await this.buildRAGPacket(userId, message);
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Check continuity
    const continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);

    // Find connections
    const connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);

    // Get strategic guidance
    const strategicGuidance = await this.getStrategicGuidance(userId, message);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources
    );

    // Generate response
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: 'user' as const, content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7,
      messages
    });

    const answer = completion.choices[0]?.message?.content ?? 'I understand. Tell me more.';

    // Generate citations
    const citations = this.generateCitations(sources, answer);

    // Save entry if needed
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    if (shouldPersistMessage(message)) {
      const savedEntry = await memoryService.saveEntry({
        userId,
        content: message,
        tags: extractTags(message),
        source: 'chat',
        metadata: { 
          autoCaptured: true,
          extractedDates,
          connections: connections.length,
          hasContinuityWarnings: continuityWarnings.length > 0,
          sourcesUsed: sources.length
        }
      });
      entryId = savedEntry.id;
      timelineUpdates.push('Entry saved to timeline');

      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });
    }

    // Extract characters
    const characters = await peoplePlacesService.listEntities(userId);
    const mentionedCharacters = characters.filter(char =>
      message.toLowerCase().includes(char.name.toLowerCase())
    );
    const characterIds = mentionedCharacters.map(c => c.id);

    return {
      answer,
      entryId,
      characterIds,
      connections,
      continuityWarnings,
      timelineUpdates,
      strategicGuidance: strategicGuidance || undefined,
      extractedDates,
      sources: sources.slice(0, 10),
      citations
    };
  }

  /**
   * Get strategic guidance
   */
  private async getStrategicGuidance(userId: string, message: string): Promise<string | null> {
    try {
      const dailyPlan = await autopilotService.getDailyPlan(userId, 'json') as any;
      if (dailyPlan?.daily_plan?.description) {
        return `💡 **Today's Focus**: ${dailyPlan.daily_plan.description}`;
      }
    } catch (error) {
      logger.debug({ error }, 'Could not fetch autopilot guidance');
    }
    return null;
  }
}

export const omegaChatService = new OmegaChatService();


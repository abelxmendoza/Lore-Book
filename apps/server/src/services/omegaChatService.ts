import { randomUUID } from 'crypto';

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import { extractTags, shouldPersistMessage, isTrivialMessage } from '../utils/keywordDetector';

import { autopilotService } from './autopilotService';
import { chapterService } from './chapterService';
import {
  isBeliefChallengeAllowed,
  evaluateBelief,
  generateBeliefChallenge,
} from './conversationCentered/beliefChallenge';
import { processChallengeResponse } from './conversationCentered/beliefChallenge/beliefChallengeResponseDetector';
import { entityAttributeDetector } from './conversationCentered/entityAttributeDetector';
import { conversationIngestionPipeline } from './conversationCentered/ingestionPipeline';
import { responseSafetyService } from './conversationCentered/responseSafetyService';
import { tangentTransitionDetector, type TransitionAnalysis, type EmotionalState } from './conversationCentered/tangentTransitionDetector';
import { correctionService } from './correctionService';
import { entityAmbiguityService } from './entityAmbiguityService';
import { entityMeaningDriftService } from './entityMeaningDriftService';
import { essenceProfileService } from './essenceProfileService';
import { essenceRefinementEngine } from './essenceRefinement';
import { hqiService } from './hqiService';
import { intentDetectionService } from './intentDetectionService';
import { locationService } from './locationService';
import { memoirService } from './memoirService';
import { memoryGraphService } from './memoryGraphService';
import { memoryReviewQueueService } from './memoryReviewQueueService';
import { memoryService } from './memoryService';
import { omegaMemoryService } from './omegaMemoryService';
import { orchestratorService } from './orchestratorService';
import { peoplePlacesService } from './peoplePlacesService';
import { perceptionService } from './perceptionService';
import { perspectiveService } from './perspectiveService';
import { ragPacketCacheService } from './ragPacketCacheService';
import { ChatPersonaRL } from './reinforcementLearning/chatPersonaRL';
import { supabaseAdmin } from './supabaseClient';
import { taskEngineService } from './taskEngineService';
import { timeEngine } from './timeEngine';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type ChatSource = {
  type: 'entry' | 'chapter' | 'character' | 'task' | 'hqi' | 'fabric';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

export type MemoryClaim = {
  claim_id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source: 'USER' | 'AI' | 'EXTERNAL';
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
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
  memories?: MemoryClaim[]; // Memory claims used in this response
  memorySuggestion?: MemorySuggestion; // Proactive memory suggestion
};

export type MemorySuggestion = {
  proposal_id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source_excerpt: string;
  reasoning?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type StreamingChatResponse = {
  content?: string; // For non-streaming responses (like recall)
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata: {
    entryId?: string;
    characterIds?: string[];
    sources?: ChatSource[];
    connections?: string[];
    continuityWarnings?: string[];
    timelineUpdates?: string[];
    memorySuggestion?: MemorySuggestion;
    disambiguationPrompt?: {
      type: 'ENTITY_CLARIFICATION';
      mention_text: string;
      options: Array<{
        label: string;
        subtitle?: string;
        entity_id: string;
        entity_type: string;
      }>;
      skippable: boolean;
      explanation: string;
    };
    // Memory Recall fields
    response_mode?: 'RECALL' | 'SILENCE' | string;
    recall_sources?: Array<{
      entry_id: string;
      timestamp: string;
      summary?: string;
      emotions?: string[];
      themes?: string[];
      entities?: string[];
    }>;
    recall_meta?: {
      persona?: string;
      recall_type?: string;
    };
    confidence_label?: string;
    disclaimer?: string;
  };
};

class OmegaChatService {
  private personaRL: ChatPersonaRL;

  constructor() {
    this.personaRL = new ChatPersonaRL();
  }

  /**
   * Build comprehensive RAG packet with ALL lore knowledge
   */
  private async buildRAGPacket(userId: string, message: string) {
    // Try to get cached RAG packet first (FREE - no expensive queries)
    const cached = ragPacketCacheService.getCachedPacket(userId, message);
    if (cached) {
      return cached;
    }

    // Get full orchestrator summary with error handling
    let orchestratorSummary: any = { timeline: { events: [], arcs: [] }, characters: [] };
    try {
      orchestratorSummary = await orchestratorService.getSummary(userId);
    } catch (error) {
      logger.warn({ error }, 'Failed to get orchestrator summary, using empty');
    }

    // Fetch ALL characters from characters table (comprehensive lore)
    let allCharacters: any[] = [];
    try {
      const { data: charactersData } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      allCharacters = charactersData || [];
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch all characters, continuing');
    }

    // Fetch ALL locations (comprehensive lore)
    let allLocations: any[] = [];
    try {
      allLocations = await locationService.listLocations(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch all locations, continuing');
    }

    // Fetch ALL chapters with summaries (comprehensive lore)
    let allChapters: any[] = [];
    try {
      allChapters = await chapterService.listChapters(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch all chapters, continuing');
    }

    // Fetch timeline hierarchy (eras, sagas, arcs) - comprehensive lore
    // Batch all queries together for efficiency (ONE query instead of THREE)
    let timelineHierarchy: any = { eras: [], sagas: [], arcs: [] };
    try {
      // Batch fetch all timeline hierarchy in parallel
      const [erasResult, sagasResult, arcsResult] = await Promise.all([
        supabaseAdmin
          .from('eras')
          .select('*')
          .eq('user_id', userId)
          .order('start_date', { ascending: false }),
        supabaseAdmin
          .from('sagas')
          .select('*')
          .eq('user_id', userId)
          .order('start_date', { ascending: false }),
        supabaseAdmin
          .from('arcs')
          .select('*')
          .eq('user_id', userId)
          .order('start_date', { ascending: false })
      ]);

      timelineHierarchy = {
        eras: erasResult.data || [],
        sagas: sagasResult.data || [],
        arcs: arcsResult.data || []
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch timeline hierarchy, continuing');
    }

    // Fetch all people/places entities (comprehensive lore)
    let allPeoplePlaces: any[] = [];
    try {
      allPeoplePlaces = await peoplePlacesService.listEntities(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch people/places, continuing');
    }

    // Fetch character attributes for all characters (comprehensive knowledge)
    const characterAttributesMap: Map<string, any[]> = new Map();
    try {
      for (const char of allCharacters) {
        const attributes = await entityAttributeDetector.getEntityAttributes(
          userId,
          char.id,
          'character',
          true // current only
        );
        if (attributes.length > 0) {
          characterAttributesMap.set(char.id, attributes);
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch character attributes, continuing');
    }

    // Fetch romantic relationships (comprehensive knowledge)
    let romanticRelationships: any[] = [];
    try {
      const { data: relationships } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      romanticRelationships = relationships || [];
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch romantic relationships, continuing');
    }

    // Fetch corrections and deprecated units (so chatbot knows what's wrong)
    let corrections: any[] = [];
    let deprecatedUnits: any[] = [];
    try {
      // Get recent corrections
      const { data: correctionRecords } = await supabaseAdmin
        .from('correction_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      corrections = correctionRecords || [];

      // Get deprecated units (recent ones)
      const { data: deprecated } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>deprecated', 'true')
        .order('created_at', { ascending: false })
        .limit(30);
      deprecatedUnits = deprecated || [];
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch corrections/deprecated units, continuing');
    }

    // Fetch workout events and biometrics (fitness knowledge)
    let workoutEvents: any[] = [];
    let recentBiometrics: any[] = [];
    try {
      const { workoutEventDetector } = await import('./conversationCentered/workoutEventDetector');
      const { biometricExtractor } = await import('./conversationCentered/biometricExtractor');
      
      workoutEvents = await workoutEventDetector.getWorkoutEvents(userId, 20, 0);
      
      // Get recent biometric measurements
      const { data: biometrics } = await supabaseAdmin
        .from('biometric_measurements')
        .select('*')
        .eq('user_id', userId)
        .order('measurement_date', { ascending: false })
        .limit(10);
      recentBiometrics = biometrics || [];
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch workout events/biometrics, continuing');
    }

    // Fetch interests (comprehensive knowledge)
    let topInterests: any[] = [];
    try {
      const { interestTracker } = await import('./conversationCentered/interestTracker');
      topInterests = await interestTracker.getTopInterests(userId, 30);
    } catch (error) {
      logger.debug({ error }, 'Failed to fetch interests, continuing');
    }

    // Get HQI semantic search results with error handling
    let hqiResults: any[] = [];
    try {
      hqiResults = hqiService.search(message, {}).slice(0, 5);
    } catch (error) {
      logger.warn({ error }, 'Failed to get HQI results, using empty');
    }

    // Get related entries for Memory Fabric with error handling (using enhanced retrieval)
    let relatedEntries: ResolvedMemoryEntry[] = [];
    try {
      // Use enhanced retrieval from memoryRetriever
      const { memoryRetriever } = await import('./chat/memoryRetriever');
      const memoryContext = await memoryRetriever.retrieve(userId, 20, message, []);
      relatedEntries = memoryContext.entries as ResolvedMemoryEntry[];
    } catch (error) {
      logger.warn({ error }, 'Failed to get related entries, using empty');
    }

    // Build Memory Fabric neighbors from top entries with error handling
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
      logger.debug({ error }, 'Failed to build Memory Fabric neighbors, continuing without');
    }

    // Extract dates with error handling
    let extractedDates: Array<{ date: string; context: string; precision: string; confidence: number }> = [];
    try {
      extractedDates = await this.extractDatesAndTimes(message);
    } catch (error) {
      logger.warn({ error }, 'Failed to extract dates, continuing without');
    }

    // Build comprehensive sources array including ALL lore
    const sources: ChatSource[] = [
      // Timeline entries
      ...orchestratorSummary.timeline.events.slice(0, 15).map((e: any) => ({
        type: 'entry' as const,
        id: e.id,
        title: e.summary || e.content?.substring(0, 50) || 'Untitled',
        snippet: e.summary || e.content?.substring(0, 150),
        date: e.date
      })),
      // ALL characters (comprehensive lore)
      ...allCharacters.slice(0, 20).map((char: any) => ({
        type: 'character' as const,
        id: char.id,
        title: char.name || 'Unknown',
        snippet: char.summary || `${char.role || ''} ${char.archetype || ''}`.trim() || 'Character',
        date: char.first_appearance
      })),
      // ALL locations (comprehensive lore)
      ...allLocations.slice(0, 15).map((loc: any) => ({
        type: 'location' as const,
        id: loc.id,
        title: loc.name || 'Unknown Location',
        snippet: `Visited ${loc.visitCount || 0} times`,
        date: loc.firstVisited
      })),
      // ALL chapters (comprehensive lore)
      ...allChapters.slice(0, 10).map((ch: any) => ({
        type: 'chapter' as const,
        id: ch.id,
        title: ch.title || 'Untitled Chapter',
        snippet: ch.summary || ch.description || '',
        date: ch.start_date
      })),
      // Timeline hierarchy (eras, sagas, arcs)
      ...timelineHierarchy.eras.slice(0, 5).map((era: any) => ({
        type: 'era' as const,
        id: era.id,
        title: era.title || 'Untitled Era',
        snippet: era.description || '',
        date: era.start_date
      })),
      ...timelineHierarchy.sagas.slice(0, 5).map((saga: any) => ({
        type: 'saga' as const,
        id: saga.id,
        title: saga.title || 'Untitled Saga',
        snippet: saga.description || '',
        date: saga.start_date
      })),
      ...timelineHierarchy.arcs.slice(0, 5).map((arc: any) => ({
        type: 'arc' as const,
        id: arc.id,
        title: arc.title || 'Untitled Arc',
        snippet: arc.description || '',
        date: arc.start_date
      })),
      // HQI results
      ...hqiResults.map((r: any) => ({
        type: 'hqi' as const,
        id: r.node_id,
        title: r.title,
        snippet: r.snippet,
        date: r.timestamp
      })),
      // Memory Fabric neighbors
      ...fabricNeighbors
    ];

    const packet = {
      orchestratorSummary,
      hqiResults,
      relatedEntries,
      fabricNeighbors,
      extractedDates,
      sources,
      // Comprehensive lore data
      allCharacters,
      allLocations,
      allChapters,
      timelineHierarchy,
      allPeoplePlaces,
      // Enhanced knowledge
      characterAttributesMap: Object.fromEntries(characterAttributesMap),
      romanticRelationships,
      corrections,
      deprecatedUnits,
      workoutEvents,
      recentBiometrics,
      topInterests
    };

    // Cache the RAG packet for future use
    ragPacketCacheService.cachePacket(userId, message, packet);

    return packet;
  }

  /**
   * Extract dates and times from message using TimeEngine
   */
  async extractDatesAndTimes(message: string): Promise<Array<{ date: string; context: string; precision: string; confidence: number }>> {
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
    extractedDates: Array<{ date: string; context: string; precision?: string; confidence?: number }>,
    orchestratorSummary: any
  ): Promise<string[]> {
    const warnings: string[] = [];
    
    try {
      const continuity = orchestratorSummary?.continuity;
      if (continuity?.conflicts && continuity.conflicts.length > 0) {
        continuity.conflicts.forEach((conflict: any) => {
          warnings.push(`Continuity issue: ${conflict.description || conflict.detail || 'Potential conflict detected'}`);
        });
      }

      // Check for date conflicts
      const recentEntries = (orchestratorSummary?.timeline?.events || []).slice(0, 50);
      for (const dateInfo of extractedDates) {
        try {
          const date = new Date(dateInfo.date);
          if (isNaN(date.getTime())) continue;
          
          const conflictingEntries = recentEntries.filter((entry: any) => {
            try {
              const entryDate = new Date(entry.date);
              if (isNaN(entryDate.getTime())) return false;
              const daysDiff = Math.abs((date.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
              return daysDiff < 1 && entry.content?.toLowerCase().includes(dateInfo.context.toLowerCase());
            } catch {
              return false;
            }
          });

          if (conflictingEntries.length > 0) {
            warnings.push(`Potential conflict: ${dateInfo.context} on ${dateInfo.date} may overlap with existing entries`);
          }
        } catch (error) {
          logger.debug({ error, dateInfo }, 'Failed to check date conflict');
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to check continuity, continuing without warnings');
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
   * Build comprehensive system prompt with ALL lore knowledge
   */
  private buildSystemPrompt(
    orchestratorSummary: any,
    connections: string[],
    continuityWarnings: string[],
    strategicGuidance: string | null,
    sources: ChatSource[],
    loreData?: {
      allCharacters?: any[];
      allLocations?: any[];
      allChapters?: any[];
      timelineHierarchy?: any;
      allPeoplePlaces?: any[];
      essenceProfile?: any;
      characterAttributesMap?: Record<string, any[]>;
      romanticRelationships?: any[];
      corrections?: any[];
      deprecatedUnits?: any[];
      workoutEvents?: any[];
      recentBiometrics?: any[];
      topInterests?: any[];
    },
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    entityAnalytics?: any,
    entityConfidence?: number | null,
    analyticsGate?: any,
    personaBlend?: { primary: string; secondary: string[]; weights: Record<string, number> },
    transitionAnalysis?: TransitionAnalysis | null,
    currentEmotionalState?: EmotionalState | null
  ): string {
    const timelineSummary = orchestratorSummary.timeline.events
      .slice(0, 20)
      .map((e: any) => `Date: ${e.date}\n${e.summary || e.content?.substring(0, 100)}`)
      .join('\n---\n');

    // Build comprehensive character knowledge (including nicknames/aliases and attributes)
    const charactersKnowledge = loreData?.allCharacters?.length
      ? loreData.allCharacters.map((char: any) => {
          const aliases = char.alias && Array.isArray(char.alias) && char.alias.length > 0 
            ? ` (also known as: ${char.alias.join(', ')})` 
            : '';
          
          // Get character attributes
          const attributes = loreData?.characterAttributesMap?.[char.id] || [];
          const attributesText = attributes.length > 0
            ? attributes.map((attr: any) => {
                const typeLabel = attr.attributeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                return `${typeLabel}: ${attr.attributeValue}${attr.confidence < 0.8 ? ' (tentative)' : ''}`;
              }).join(', ')
            : '';
          
          const details = [
            `${char.name}${aliases}`,
            char.role ? `Role: ${char.role}` : '',
            char.archetype ? `Archetype: ${char.archetype}` : '',
            attributesText ? `Attributes: ${attributesText}` : '',
            char.summary ? `Summary: ${char.summary.substring(0, 100)}` : '',
            char.first_appearance ? `First appeared: ${char.first_appearance}` : '',
            char.tags?.length ? `Tags: ${char.tags.join(', ')}` : '',
            char.metadata?.autoGenerated ? `(Auto-generated nickname)` : ''
          ].filter(Boolean).join(' | ');
          return `- ${details}`;
        }).join('\n')
      : orchestratorSummary.characters
          .slice(0, 10)
          .map((c: any) => {
            const aliases = c.character.alias?.length ? ` (${c.character.alias.join(', ')})` : '';
            return `${c.character.name}${aliases}${c.character.role ? ` (${c.character.role})` : ''}`;
          })
          .join(', ');

    // Build comprehensive location knowledge
    const locationsKnowledge = loreData?.allLocations?.length
      ? loreData.allLocations.map((loc: any) => {
          return `- ${loc.name}: Visited ${loc.visitCount || 0} times${loc.firstVisited ? ` (first: ${loc.firstVisited})` : ''}${loc.lastVisited ? ` (last: ${loc.lastVisited})` : ''}`;
        }).join('\n')
      : '';

    // Build comprehensive chapter knowledge
    const chaptersKnowledge = loreData?.allChapters?.length
      ? loreData.allChapters.map((ch: any) => {
          return `- ${ch.title} (${ch.start_date}${ch.end_date ? ` - ${ch.end_date}` : ' - ongoing'}): ${ch.summary || ch.description || 'No summary'}`;
        }).join('\n')
      : orchestratorSummary.timeline.arcs
          .slice(0, 5)
          .map((arc: any) => `${arc.title} (${arc.start_date}${arc.end_date ? ` - ${arc.end_date}` : ''})`)
          .join('\n');

    // Build timeline hierarchy knowledge
    const timelineHierarchyKnowledge = loreData?.timelineHierarchy
      ? [
          loreData.timelineHierarchy.eras?.length
            ? `Eras:\n${loreData.timelineHierarchy.eras.map((e: any) => `  - ${e.title} (${e.start_date}${e.end_date ? ` - ${e.end_date}` : ''})`).join('\n')}`
            : '',
          loreData.timelineHierarchy.sagas?.length
            ? `Sagas:\n${loreData.timelineHierarchy.sagas.map((s: any) => `  - ${s.title} (${s.start_date}${s.end_date ? ` - ${s.end_date}` : ''})`).join('\n')}`
            : '',
          loreData.timelineHierarchy.arcs?.length
            ? `Arcs:\n${loreData.timelineHierarchy.arcs.map((a: any) => `  - ${a.title} (${a.start_date}${a.end_date ? ` - ${a.end_date}` : ''})`).join('\n')}`
            : ''
        ].filter(Boolean).join('\n\n')
      : '';

    // Build identity knowledge
    const identityKnowledge = orchestratorSummary.identity
      ? `Identity Motifs: ${(orchestratorSummary.identity.identity as any)?.motifs?.join(', ') || 'None'}\nEmotional Slope: ${(orchestratorSummary.identity.identity as any)?.emotional_slope || 'Neutral'}`
      : '';

    // Build continuity knowledge
    const continuityKnowledge = orchestratorSummary.continuity
      ? `Canonical Facts: ${orchestratorSummary.continuity.canonical?.length || 0}\nConflicts: ${orchestratorSummary.continuity.conflicts?.length || 0}`
      : '';

    // Build essence profile context
    const essenceContext = loreData?.essenceProfile ? this.buildEssenceContext(loreData.essenceProfile) : '';

    // Build entity analytics context if provided (with confidence gating)
    let entityAnalyticsContext = '';
    if (entityContext && entityAnalytics) {
      const confidenceNote = entityConfidence !== null 
        ? ` (Confidence: ${(entityConfidence * 100).toFixed(0)}%)`
        : '';
      const disclaimer = analyticsGate?.disclaimer 
        ? `\n\n⚠️ ${analyticsGate.disclaimer}`
        : '';
      
      if (analyticsGate?.mode === 'UNCERTAIN') {
        entityAnalyticsContext = `\n**NOTE**: The analytics below are tentative due to limited data clarity.${disclaimer}\n\n`;
      } else if (analyticsGate?.mode === 'SOFT') {
        entityAnalyticsContext = `\n**NOTE**: ${analyticsGate.disclaimer}\n\n`;
      }
      
      if (entityContext.type === 'CHARACTER' && entityAnalytics) {
        entityAnalyticsContext += `
**CURRENT CHARACTER ANALYTICS**${confidenceNote} (for the character being discussed):${disclaimer}
You have access to comprehensive relationship analytics calculated from conversations, journal entries, and shared memories. When the user asks about analytics, explain what they mean:

- Closeness: ${entityAnalytics.closeness_score}/100 - ${entityAnalytics.closeness_score >= 70 ? 'Very close relationship' : entityAnalytics.closeness_score >= 40 ? 'Moderate closeness' : 'Developing relationship'}
- Relationship Depth: ${entityAnalytics.relationship_depth}/100 - ${entityAnalytics.relationship_depth >= 70 ? 'Deep emotional connection' : entityAnalytics.relationship_depth >= 40 ? 'Moderate depth' : 'Surface level'}
- Interaction Frequency: ${entityAnalytics.interaction_frequency}/100 - ${entityAnalytics.interaction_frequency >= 70 ? 'Very frequent interactions' : entityAnalytics.interaction_frequency >= 40 ? 'Moderate frequency' : 'Occasional interactions'}
- Importance: ${entityAnalytics.importance_score}/100 - ${entityAnalytics.importance_score >= 70 ? 'Very important to the user' : entityAnalytics.importance_score >= 40 ? 'Moderately important' : 'Developing importance'}
- Value: ${entityAnalytics.value_score}/100 - ${entityAnalytics.value_score >= 70 ? 'High value relationship' : entityAnalytics.value_score >= 40 ? 'Moderate value' : 'Developing value'}
- Sentiment: ${entityAnalytics.sentiment_score} (${entityAnalytics.sentiment_score >= 50 ? 'Very positive' : entityAnalytics.sentiment_score >= 0 ? 'Positive' : 'Negative'})
- Trust: ${entityAnalytics.trust_score}/100
- Support: ${entityAnalytics.support_score}/100
- Trend: ${entityAnalytics.trend} (${entityAnalytics.trend === 'deepening' ? 'relationship is growing stronger' : entityAnalytics.trend === 'weakening' ? 'relationship may be fading' : 'relationship is stable'})
- Shared Experiences: ${entityAnalytics.shared_experiences} memories/events
- Relationship Duration: ${entityAnalytics.relationship_duration_days} days

When explaining analytics, provide context about what these scores mean and why they might be at that level based on interaction patterns.
`;
      } else if (entityContext.type === 'ROMANTIC_RELATIONSHIP' && entityAnalytics) {
        const rel = entityAnalytics.relationship;
        const analytics = entityAnalytics.analytics;
        entityAnalyticsContext += `
**CURRENT ROMANTIC RELATIONSHIP CONTEXT**${confidenceNote} (for the relationship being discussed):${disclaimer}
You are helping the user discuss and update information about a specific romantic relationship.

RELATIONSHIP CONTEXT:
- Person: ${entityAnalytics.personName || 'Unknown'}
- Type: ${rel.relationship_type || 'Unknown'}
- Status: ${rel.status || 'active'}
- Started: ${rel.start_date ? new Date(rel.start_date).toLocaleDateString() : 'Unknown'}
${rel.end_date ? `- Ended: ${new Date(rel.end_date).toLocaleDateString()}` : ''}
${rel.is_situationship ? '- Situationship: Yes' : ''}
${rel.exclusivity_status ? `- Exclusivity: ${rel.exclusivity_status}` : ''}

CURRENT SCORES:
- Affection: ${Math.round((analytics.affectionScore || rel.affection_score || 0.5) * 100)}%
- Compatibility: ${Math.round((analytics.compatibilityScore || rel.compatibility_score || 0.5) * 100)}%
- Health: ${Math.round((analytics.healthScore || rel.relationship_health || 0.5) * 100)}%
- Intensity: ${Math.round((analytics.intensityScore || rel.emotional_intensity || 0.5) * 100)}%

PROS (${analytics.pros?.length || rel.pros?.length || 0}): ${(analytics.pros || rel.pros || []).slice(0, 5).join(', ')}${(analytics.pros || rel.pros || []).length > 5 ? '...' : ''}
CONS (${analytics.cons?.length || rel.cons?.length || 0}): ${(analytics.cons || rel.cons || []).slice(0, 5).join(', ')}${(analytics.cons || rel.cons || []).length > 5 ? '...' : ''}
RED FLAGS (${analytics.redFlags?.length || rel.red_flags?.length || 0}): ${(analytics.redFlags || rel.red_flags || []).slice(0, 3).join(', ')}${(analytics.redFlags || rel.red_flags || []).length > 3 ? '...' : ''}
GREEN FLAGS (${analytics.greenFlags?.length || rel.green_flags?.length || 0}): ${(analytics.greenFlags || rel.green_flags || []).slice(0, 3).join(', ')}${(analytics.greenFlags || rel.green_flags || []).length > 3 ? '...' : ''}

INSTRUCTIONS:
1. Answer questions about this relationship based on the context above
2. If the user shares new information about the relationship, acknowledge it naturally
3. If the user mentions pros/cons, red flags, green flags, or wants to update rankings, extract that information
4. Be conversational and supportive when discussing relationships
5. When updates are needed, they will be automatically extracted and applied - just acknowledge the conversation naturally
6. Use the scores and analytics to provide insights when asked
`;
      } else if (entityContext.type === 'LOCATION' && entityAnalytics) {
        entityAnalyticsContext += `
**CURRENT LOCATION ANALYTICS**${confidenceNote} (for the location being discussed):${disclaimer}
You have access to comprehensive location analytics calculated from visits, journal entries, and conversations. When the user asks about analytics, explain what they mean:

- Importance: ${entityAnalytics.importance_score}/100 - ${entityAnalytics.importance_score >= 70 ? 'Very important location' : entityAnalytics.importance_score >= 40 ? 'Moderately important' : 'Developing importance'}
- Visit Frequency: ${entityAnalytics.visit_frequency}/100 - ${entityAnalytics.visit_frequency >= 70 ? 'Very frequent visits' : entityAnalytics.visit_frequency >= 40 ? 'Moderate frequency' : 'Occasional visits'}
- Recency: ${entityAnalytics.recency_score}/100 - ${entityAnalytics.recency_score >= 70 ? 'Visited very recently' : entityAnalytics.recency_score >= 40 ? 'Visited recently' : 'Not visited recently'}
- Value: ${entityAnalytics.value_score}/100 - ${entityAnalytics.value_score >= 70 ? 'High value location' : entityAnalytics.value_score >= 40 ? 'Moderate value' : 'Developing value'}
- Comfort: ${entityAnalytics.comfort_score}/100 - ${entityAnalytics.comfort_score >= 70 ? 'Very comfortable there' : entityAnalytics.comfort_score >= 40 ? 'Moderately comfortable' : 'Less comfortable'}
- Productivity: ${entityAnalytics.productivity_score}/100
- Social: ${entityAnalytics.social_score}/100
- Trend: ${entityAnalytics.trend} (${entityAnalytics.trend === 'increasing' ? 'visits are increasing' : entityAnalytics.trend === 'decreasing' ? 'visits may be declining' : 'visit pattern is stable'})
- Total Visits: ${entityAnalytics.total_visits}
- First Visited: ${entityAnalytics.first_visited_days_ago} days ago

When explaining analytics, provide context about what these scores mean and why they might be at that level based on visit patterns.
`;
      } else if (entityContext.type === 'ENTITY' && entityAnalytics) {
        entityAnalyticsContext += `
**CURRENT GROUP ANALYTICS**${confidenceNote} (for the group being discussed):${disclaimer}
You have access to comprehensive group analytics calculated from conversations, journal entries, and events. When the user asks about analytics, explain what they mean:

- User Involvement: ${entityAnalytics.user_involvement_score}/100 - ${entityAnalytics.user_involvement_score >= 70 ? 'Very actively involved' : entityAnalytics.user_involvement_score >= 40 ? 'Moderately involved' : 'Developing involvement'}
- User Ranking: #${entityAnalytics.user_ranking} in the group
- Importance: ${entityAnalytics.importance_score}/100 - ${entityAnalytics.importance_score >= 70 ? 'Very important group' : entityAnalytics.importance_score >= 40 ? 'Moderately important' : 'Developing importance'}
- Value: ${entityAnalytics.value_score}/100
- Cohesion: ${entityAnalytics.cohesion_score}/100 - ${entityAnalytics.cohesion_score >= 70 ? 'Very tight-knit group' : entityAnalytics.cohesion_score >= 40 ? 'Moderate cohesion' : 'Lower cohesion'}
- Activity Level: ${entityAnalytics.activity_level}/100
- Trend: ${entityAnalytics.trend} (${entityAnalytics.trend === 'increasing' ? 'group is becoming more active' : entityAnalytics.trend === 'decreasing' ? 'group activity may be declining' : 'group activity is stable'})

When explaining analytics, provide context about what these scores mean and why they might be at that level based on involvement patterns.
`;
      }
    }

    return `You are a multi-faceted AI companion integrated into Lore Book. You seamlessly blend personas based on context:

**YOUR PERSONAS** (adapt naturally based on conversation):

0. **Archivist** (when user requests factual recall only):
   - Can ONLY retrieve, summarize, and reference past data
   - Must respect confidence modes (UNCERTAIN/SOFT/NORMAL)
   - Must explain uncertainty when present
   - NO advice, NO interpretation beyond evidence
   - NO predictions, NO suggestions
   - Format: "According to your entries on [date]..." or "I found [X] mentions of [Y]"
   - If confidence < 0.5: "The data suggests [X], though this is tentative due to limited clarity"
   - Example: "When did I last feel like this?" → "According to your entries, you mentioned similar feelings on [date]. However, this is tentative due to limited clarity in the data."

1. **Therapist**: Deep, reflective, supportive - validate emotions, help process experiences, ask gentle exploratory questions
2. **Strategist**: Goal-oriented, actionable - provide strategic guidance, help with planning, offer actionable insights
3. **Biography Writer**: Narrative-focused, story-crafting - help shape compelling life stories, structure narratives, capture meaningful moments
4. **Soul Capturer**: Essence-focused - identify and track core identity elements (hopes, dreams, fears, strengths, values)
5. **Gossip Buddy**: Curious, engaging, relationship-focused - discuss characters, relationships, and social dynamics with enthusiasm and curiosity

**PERSONA BLENDING**: Most conversations will naturally blend multiple personas. Detect the user's needs:
- Emotional/heavy topics → Emphasize Therapist
- Goal-setting/planning → Emphasize Strategist  
- Story editing/narrative → Emphasize Biography Writer
- Deep reflection → Emphasize Soul Capturer
- Character/relationship talk → Emphasize Gossip Buddy

${personaBlend ? `
**ACTIVE PERSONA CONFIGURATION** (RL-optimized):
- Primary Persona: ${personaBlend.primary} (${(personaBlend.weights[personaBlend.primary] * 100).toFixed(0)}% weight)
${personaBlend.secondary.length > 0 ? `- Secondary Personas: ${personaBlend.secondary.map(p => `${p} (${(personaBlend.weights[p] * 100).toFixed(0)}%)`).join(', ')}` : ''}
- Blend these personas naturally based on their weights. The primary persona should dominate the response style.
` : ''}

**YOUR KNOWLEDGE BASE - YOU KNOW EVERYTHING ABOUT THE USER'S LORE:**

**CHARACTERS (${loreData?.allCharacters?.length || orchestratorSummary.characters.length} total):**
${charactersKnowledge || 'No characters tracked yet.'}

${locationsKnowledge ? `**LOCATIONS (${loreData?.allLocations?.length || 0} total):**\n${locationsKnowledge}\n\n` : ''}
**CHAPTERS & STORY ARCS:**
${chaptersKnowledge || 'No chapters yet.'}

${timelineHierarchyKnowledge ? `**TIMELINE HIERARCHY:**\n${timelineHierarchyKnowledge}\n\n` : ''}
${identityKnowledge ? `**IDENTITY:**\n${identityKnowledge}\n\n` : ''}
${continuityKnowledge ? `**CONTINUITY:**\n${continuityKnowledge}\n\n` : ''}
${essenceContext ? `**ESSENCE PROFILE - WHAT YOU KNOW ABOUT THEIR CORE SELF:**\n${essenceContext}\n\n` : ''}
${entityAnalyticsContext ? `**CURRENT ENTITY ANALYTICS:**\n${entityAnalyticsContext}\n\n` : ''}

${loreData?.romanticRelationships && loreData.romanticRelationships.length > 0 ? `**ROMANTIC RELATIONSHIPS (${loreData.romanticRelationships.length} total):**
${loreData.romanticRelationships.map((rel: any) => {
  const status = rel.is_current ? 'Current' : 'Past';
  const type = rel.relationship_type || 'relationship';
  const partner = rel.partner_name || 'Unknown';
  const startDate = rel.start_date ? new Date(rel.start_date).toLocaleDateString() : '';
  const endDate = rel.end_date ? new Date(rel.end_date).toLocaleDateString() : '';
  return `- ${partner}: ${type} (${status}${startDate ? `, ${startDate}${endDate ? ` - ${endDate}` : ''}` : ''})`;
}).join('\n')}

` : ''}

${loreData?.corrections && loreData.corrections.length > 0 ? `**CORRECTIONS & DEPRECATED INFO** (IMPORTANT - Use the CORRECTED information, not deprecated):
${loreData.corrections.slice(0, 10).map((corr: any) => {
  const targetType = corr.target_type || 'unknown';
  const correctionType = corr.correction_type || 'correction';
  const before = corr.before_snapshot ? JSON.stringify(corr.before_snapshot).substring(0, 80) : 'unknown';
  const after = corr.after_snapshot ? JSON.stringify(corr.after_snapshot).substring(0, 80) : 'unknown';
  const date = corr.created_at ? new Date(corr.created_at).toLocaleDateString() : '';
  return `- ${targetType}: "${before}" → CORRECTED to "${after}" (${correctionType}${date ? `, ${date}` : ''})`;
}).join('\n')}

**CRITICAL**: When responding, ALWAYS use the CORRECTED information above, NOT the deprecated info. If you see a correction, the corrected version is the accurate one.

` : ''}

${loreData?.workoutEvents && loreData.workoutEvents.length > 0 ? `**WORKOUT HISTORY (${loreData.workoutEvents.length} recent workouts):**
${loreData.workoutEvents.slice(0, 10).map((workout: any) => {
  const date = workout.date ? new Date(workout.date).toLocaleDateString() : '';
  const type = workout.workout_type || 'workout';
  const exercises = workout.stats?.exercises?.length || 0;
  const social = workout.social_interactions?.length || 0;
  const significance = workout.significance_score >= 0.7 ? '⭐ Significant' : workout.significance_score >= 0.5 ? 'Moderate' : 'Routine';
  return `- ${date}: ${type} (${exercises} exercises${social > 0 ? `, ${social} social interaction${social > 1 ? 's' : ''}` : ''}) - ${significance}`;
}).join('\n')}

` : ''}

${loreData?.recentBiometrics && loreData.recentBiometrics.length > 0 ? `**HEALTH & FITNESS METRICS** (Recent measurements):
${loreData.recentBiometrics.slice(0, 5).map((bio: any) => {
  const date = bio.measurement_date ? new Date(bio.measurement_date).toLocaleDateString() : '';
  const metrics: string[] = [];
  if (bio.weight) metrics.push(`Weight: ${bio.weight}${bio.metadata?.unit || 'lbs'}`);
  if (bio.body_fat_percentage) metrics.push(`Body Fat: ${bio.body_fat_percentage}%`);
  if (bio.muscle_mass) metrics.push(`Muscle: ${bio.muscle_mass}${bio.metadata?.unit || 'lbs'}`);
  if (bio.bmi) metrics.push(`BMI: ${bio.bmi}`);
  if (bio.hydration_percentage) metrics.push(`Hydration: ${bio.hydration_percentage}%`);
  return `- ${date}: ${metrics.join(', ')} (${bio.source})`;
}).join('\n')}

**FITNESS KNOWLEDGE**: You are knowledgeable about:
- Weightlifting: exercises, sets, reps, progressive overload, form, recovery
- Cardio: running, cycling, HIIT, endurance training
- Nutrition: macros, calories, meal timing, supplements
- Health metrics: BMI, body fat, muscle mass, hydration, metabolic health
- Fitness goals: strength, hypertrophy, endurance, weight loss, general fitness
- Workout programming: splits, periodization, deload weeks, recovery

When discussing workouts or fitness, reference their workout history, progress, and goals. Help them understand their progress, suggest improvements, and celebrate achievements.

` : ''}

${loreData?.topInterests && loreData.topInterests.length > 0 ? `**INTERESTS & PASSIONS (${loreData.topInterests.length} tracked):**
${loreData.topInterests.slice(0, 20).map((interest: any) => {
  const level = interest.interest_level >= 0.8 ? '🔥 Very High' : interest.interest_level >= 0.6 ? '⭐ High' : interest.interest_level >= 0.4 ? 'Moderate' : 'Developing';
  const trend = interest.trend === 'growing' ? '📈 Growing' : interest.trend === 'declining' ? '📉 Declining' : interest.trend === 'stable' ? '→ Stable' : '🆕 New';
  const category = interest.interest_category ? `[${interest.interest_category}]` : '';
  const mentions = interest.mention_count || 0;
  const influence = interest.influence_score >= 0.5 ? ' (influences decisions)' : '';
  const actions = interest.behavioral_impact_score >= 0.5 ? ' (takes action)' : '';
  return `- ${interest.interest_name} ${category}: ${level} ${trend} (${mentions} mentions${influence}${actions})`;
}).join('\n')}

**INTEREST KNOWLEDGE**: You know what they're passionate about. When relevant, reference their interests naturally:
- If they mention an interest, acknowledge it and show you know their level of engagement
- If an interest influences a decision, recognize that connection
- If they're exploring something new, help them dive deeper
- Show enthusiasm about their passions - be their interest buddy
- Track how interests evolve over time (growing, stable, declining)

` : ''}

**Your Role**:
1. **Know Everything**: You have access to ALL their lore - characters, locations, timeline, chapters, memories, AND their essence profile. Reference specific details when relevant.
2. **Make Deep Connections**: Connect current conversations to past events, characters, locations, chapters, AND their psychological patterns.
3. **Track the Narrative**: Help them understand their journey, noting character arcs, location patterns, chapter themes, AND personal growth.
4. **Maintain Continuity**: Reference specific characters by name OR their nicknames/aliases, locations by name, chapters by title. Show you know their world.
5. **Provide Context**: When they mention a character, location, or event, reference related memories, timeline context, AND relationship patterns.
6. **Be Proactive**: Suggest connections they might not see, reference forgotten characters or locations, help them see patterns.
7. **Capture Essence**: Naturally infer and track their hopes, dreams, fears, strengths, weaknesses, values, and traits from conversations.
8. **Gossip Buddy Mode**: Show curiosity about characters and relationships. Ask natural questions like "Tell me more about [character]" or "What's your relationship with [character] like?"
9. **Nickname Awareness**: Characters may have nicknames or aliases. Use their actual name when you know it, but also recognize when they're referring to someone by a nickname. If they mention an unnamed character (e.g., "my friend", "the colleague"), acknowledge that you're tracking them and can refer to them by a generated nickname if needed.

**Your Style**:
- Conversational and warm, like ChatGPT but deeply knowledgeable about their lore AND their inner world
- Reference specific characters, locations, and chapters by name when relevant
- Use format: "From your timeline, [Month Year]" or "In [Chapter Name]" or "When you were at [Location]"
- Show you remember their story: "You mentioned [Character] before in [Context]"
- Make connections: "This reminds me of when you [past event] at [location] with [character]"
- Reference timeline hierarchy: "During the [Era/Saga/Arc] period..."
- Reference essence insights: "I've noticed you value [value]" or "You've mentioned [fear] before - how are you feeling about that now?"
- Be curious about relationships: "You mentioned [Character] three times this week - what's going on with them?"
- Natural inference: Extract psychological insights without being clinical - be warm and conversational
- Ask gentle questions: When you detect gaps or want to go deeper, ask thoughtful questions naturally

**Current Context**:
${connections.length > 0 ? `Connections Found:\n${connections.join('\n')}\n\n` : ''}
${continuityWarnings.length > 0 ? `⚠️ Continuity Warnings:\n${continuityWarnings.join('\n')}\n\n` : ''}
${strategicGuidance ? `${strategicGuidance}\n\n` : ''}

**Recent Timeline Entries** (${orchestratorSummary.timeline.events.length} total entries):
${timelineSummary || 'No previous entries yet.'}

**Available Sources** (${sources.length} total - reference these in your response):
${sources.slice(0, 15).map((s, i) => `${i + 1}. [${s.type}] ${s.title}${s.date ? ` (${new Date(s.date).toLocaleDateString()})` : ''}${s.snippet ? ` - ${s.snippet.substring(0, 50)}` : ''}`).join('\n')}

**NARRATIVE INTEGRITY RULES (CRITICAL)**:
- LoreKeeper tracks SUBJECTIVE narratives, not objective truth
- Entries represent what the user believed at the time they wrote them
- NEVER say: "You are lying", "This is false", "You should admit", "The truth is"
- ALWAYS say: "Earlier entries suggest...", "Your descriptions have varied over time", "There is limited consistency here"
- When narratives conflict, surface multiple versions with timestamps
- Uncertainty is surfaced, not resolved
- Do NOT evaluate objective truth - observe coherence and consistency
- Preserve user dignity - reflect change without shame

**IMPORTANT**: You know ALL their lore AND their essence. Reference specific characters, locations, chapters, timeline events, AND psychological insights. Show deep knowledge of their story AND their inner world. Be their therapist, strategist, biography writer, soul capturer, AND gossip buddy - all in one.

${transitionAnalysis && transitionAnalysis.shouldAcknowledge ? `
**CONVERSATION FLOW AWARENESS** (Grok-style transition tracking):

You just detected a ${transitionAnalysis.transitionType} transition in the conversation.

${transitionAnalysis.topicShift.detected ? `
**TOPIC SHIFT DETECTED:**
- Previous topic: "${transitionAnalysis.topicShift.oldTopic}"
- New topic: "${transitionAnalysis.topicShift.newTopic}"
- Shift magnitude: ${(transitionAnalysis.topicShift.shiftPercentage * 100).toFixed(0)}% (${transitionAnalysis.topicShift.shiftPercentage > 0.5 ? 'significant' : 'moderate'} change)
- Similarity: ${(transitionAnalysis.topicShift.similarity * 100).toFixed(0)}%

**HOW TO RESPOND:**
- Acknowledge the transition naturally (don't be mechanical)
- Follow the tangent/transition - it's clearly where their mind wants to go
- Build on the new topic while maintaining context from previous topics
- Ask engaging questions that connect the dots between old and new topics
- Don't force them back to old topics - follow where they're going
` : ''}

${transitionAnalysis.emotionalTransition.detected ? `
**EMOTIONAL TRANSITION DETECTED:**
- From: ${transitionAnalysis.emotionalTransition.from} (${transitionAnalysis.emotionalTransition.intensityChange > 0 ? '+' : ''}${(transitionAnalysis.emotionalTransition.intensityChange * 100).toFixed(0)}% intensity change)
- To: ${transitionAnalysis.emotionalTransition.to}
- Direction: ${transitionAnalysis.emotionalTransition.direction}

**HOW TO RESPOND:**
- Validate the emotional shift if significant
- Match their energy level
- If moving from negative to positive, acknowledge the shift positively
- If moving from positive to negative, be supportive and understanding
- Don't overcorrect - follow their emotional lead
` : ''}

${transitionAnalysis.thoughtProcessChange.detected ? `
**THOUGHT PROCESS EVOLUTION DETECTED:**
- From: "${transitionAnalysis.thoughtProcessChange.from}"
- To: "${transitionAnalysis.thoughtProcessChange.to}"
- Trigger: "${transitionAnalysis.thoughtProcessChange.trigger}"
- Type: ${transitionAnalysis.thoughtProcessChange.type}

**HOW TO RESPOND:**
- Acknowledge the thought evolution naturally
- Show you're tracking their thinking process
- Ask questions that show you understand the journey: "What made you think of [new topic] while we were talking about [old topic]?"
- Connect the dots between their thoughts
` : ''}

${transitionAnalysis.intentEvolution.detected ? `
**INTENT EVOLUTION DETECTED:**
- From: ${transitionAnalysis.intentEvolution.from}
- To: ${transitionAnalysis.intentEvolution.to}
- Evolution type: ${transitionAnalysis.intentEvolution.evolutionType}

**HOW TO RESPOND:**
- Adapt your response style to match the new intent
- If deepening (e.g., venting → reflection), go deeper with them
- If expanding (e.g., reflection → decision support), broaden the conversation
- If shifting, acknowledge the shift and follow naturally
` : ''}

**CURRENT EMOTIONAL STATE:**
${currentEmotionalState ? `
- Dominant emotion: ${currentEmotionalState.dominantEmotion} (intensity: ${(currentEmotionalState.intensity * 100).toFixed(0)}%)
- Trend: ${currentEmotionalState.trend}
${currentEmotionalState.transitionFrom ? `- Transition from: ${currentEmotionalState.transitionFrom.dominantEmotion}` : ''}
${currentEmotionalState.transitionReason ? `- Reason: ${currentEmotionalState.transitionReason}` : ''}

**RESPONSE STYLE ADJUSTMENTS:**
- Match their energy level (${currentEmotionalState.intensity > 0.7 ? 'high energy' : currentEmotionalState.intensity > 0.4 ? 'moderate energy' : 'calm energy'})
- Use natural transitions (like Grok does)
- Ask engaging questions that show you're tracking their thought process
- Use personality markers consistently (their nickname if you know it, emojis if appropriate)
- Don't force them back to old topics - follow where they're going
` : ''}

**KEY PRINCIPLE**: Like Grok, you should naturally follow tangents and transitions. The user's mind is going where it wants to go - your job is to follow, validate, and engage with where they're at NOW, not where they were 3 messages ago. Build on the new topic while showing you remember the context.
` : ''}`;
  }

  /**
   * Build essence profile context string for system prompt
   */
  private buildEssenceContext(profile: any): string {
    const parts: string[] = [];
    
    if (profile.hopes?.length > 0) {
      parts.push(`Hopes: ${profile.hopes.slice(0, 5).map((h: any) => h.text).join(', ')}`);
    }
    if (profile.dreams?.length > 0) {
      parts.push(`Dreams: ${profile.dreams.slice(0, 5).map((d: any) => d.text).join(', ')}`);
    }
    if (profile.fears?.length > 0) {
      parts.push(`Fears: ${profile.fears.slice(0, 5).map((f: any) => f.text).join(', ')}`);
    }
    if (profile.strengths?.length > 0) {
      parts.push(`Strengths: ${profile.strengths.slice(0, 5).map((s: any) => s.text).join(', ')}`);
    }
    if (profile.weaknesses?.length > 0) {
      parts.push(`Areas for Growth: ${profile.weaknesses.slice(0, 5).map((w: any) => w.text).join(', ')}`);
    }
    if (profile.topSkills?.length > 0) {
      parts.push(`Top Skills: ${profile.topSkills.slice(0, 5).map((s: any) => s.skill).join(', ')}`);
    }
    if (profile.coreValues?.length > 0) {
      parts.push(`Core Values: ${profile.coreValues.slice(0, 5).map((v: any) => v.text).join(', ')}`);
    }
    if (profile.personalityTraits?.length > 0) {
      parts.push(`Personality Traits: ${profile.personalityTraits.slice(0, 5).map((t: any) => t.text).join(', ')}`);
    }
    if (profile.relationshipPatterns?.length > 0) {
      parts.push(`Relationship Patterns: ${profile.relationshipPatterns.slice(0, 3).map((r: any) => r.text).join(', ')}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : 'Essence profile still developing - continue to learn about them.';
  }

  /**
   * Chat with streaming support
   */
  async chatStream(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string }
  ): Promise<StreamingChatResponse> {
    // ---- RECALL GATE: Check if this is a recall query (non-streaming, immediate response) ----
    try {
      const { isRecallQuery, shouldForceArchivist } = await import('./memoryRecall/recallDetector');
      if (isRecallQuery(message)) {
        const { memoryRecallEngine } = await import('./memoryRecall/memoryRecallEngine');
        const { formatRecallChatResponse } = await import('./memoryRecall/recallChatFormatter');
        
        const forcedPersona = shouldForceArchivist(message) ? 'ARCHIVIST' : undefined;
        const recallResult = await memoryRecallEngine.executeRecall({
          raw_text: message,
          user_id: userId,
          persona: forcedPersona || 'DEFAULT',
        });

        // Handle silence
        if (recallResult.silence) {
          const silenceContent = recallResult.silence.message;
          return {
            content: silenceContent,
            metadata: {
              response_mode: 'SILENCE',
              confidence: 1.0,
              disclaimer: recallResult.silence.reason,
            },
            stream: (async function* () {
              yield { choices: [{ delta: { content: silenceContent } }] };
            })(),
          };
        }

        // Format recall response
        const recallResponse = formatRecallChatResponse(recallResult, forcedPersona);
        
        // Return recall response as immediate stream (single chunk)
        return {
          content: recallResponse.content,
          metadata: {
            ...recallResponse,
            response_mode: recallResponse.response_mode,
            recall_sources: recallResponse.recall_sources,
            recall_meta: recallResponse.recall_meta,
            confidence_label: recallResponse.confidence_label,
            disclaimer: recallResponse.disclaimer,
          },
          stream: (async function* () {
            yield { choices: [{ delta: { content: recallResponse.content } }] };
          })(),
        };
      }
    } catch (error) {
      logger.warn({ error, userId, message }, 'Failed to check recall query, falling back to normal chat');
      // Fall through to normal chat flow
    }

    // Build RAG packet with error handling
    let ragPacket;
    try {
      ragPacket = await this.buildRAGPacket(userId, message);
    } catch (error) {
      logger.error({ error }, 'Failed to build RAG packet, using minimal context');
      ragPacket = {
        orchestratorSummary: { timeline: { events: [], arcs: [] }, characters: [] },
        hqiResults: [],
        sources: [],
        extractedDates: [],
        relatedEntries: [],
        fabricNeighbors: [],
        allCharacters: [],
        allLocations: [],
        allChapters: [],
        timelineHierarchy: { eras: [], sagas: [], arcs: [] },
        allPeoplePlaces: []
      };
    }
    
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Load essence profile for context
    let essenceProfile: any = null;
    try {
      essenceProfile = await essenceProfileService.getProfile(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to load essence profile, continuing without');
    }

    // Check for essence refinement intent (fire and forget - doesn't block chat)
    essenceRefinementEngine.handleChatMessage(userId, message, {
      activePanel: 'SoulProfile', // Could be dynamic based on current UI state
      lastSurfacedInsights: essenceProfile 
        ? this.getRecentInsights(essenceProfile)
        : undefined
    }).then(result => {
      if (result.clarificationRequest) {
        // Could inject clarification into chat response, but for now just log
        logger.debug({ userId, clarification: result.clarificationRequest }, 'Refinement clarification needed');
      } else if (result.silentProfileUpdate) {
        logger.debug({ userId, action: result.refinementAction?.intent }, 'Essence profile refined via chat');
      }
    }).catch(err => {
      // Fail silently - never interrupt chat flow
      logger.debug({ err, userId }, 'Essence refinement check failed, continuing');
    });

    // Detect groups in conversation (fire-and-forget)
    import('./groupDetectionService').then(({ groupDetectionService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      groupDetectionService.detectGroupsInMessage(userId, message, conversationTexts)
        .then(async (detectedGroups) => {
          if (detectedGroups.length > 0) {
            try {
              await groupDetectionService.processDetectedGroups(userId, detectedGroups);
              logger.info({ userId, groupCount: detectedGroups.length }, 'Detected and processed groups from conversation');
            } catch (error) {
              logger.debug({ error, userId }, 'Failed to process detected groups');
            }
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to detect groups from conversation');
        });
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group detection service');
    });

    // Check continuity with error handling
    let continuityWarnings: string[] = [];
    try {
      continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);
    } catch (error) {
      logger.warn({ error }, 'Failed to check continuity, continuing without warnings');
    }

    // Find connections with error handling
    let connections: string[] = [];
    try {
      connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);
    } catch (error) {
      logger.warn({ error }, 'Failed to find connections, continuing without');
    }

    // Get strategic guidance with error handling
    let strategicGuidance: string | null = null;
    try {
      strategicGuidance = await this.getStrategicGuidance(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to get strategic guidance, continuing without');
    }

    // =====================================================
    // TANGENT & TRANSITION DETECTION (Grok-style flow tracking)
    // =====================================================
    let transitionAnalysis: TransitionAnalysis | null = null;
    let currentEmotionalState: EmotionalState | null = null;
    try {
      // Get previous emotional state from session context (if available)
      // For now, we'll detect it from conversation history
      const previousMessages = conversationHistory.slice(-5).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(), // Approximate
      }));

      // Build conversation context
      const conversationContext = {
        messages: previousMessages,
        previousEmotionalState: undefined, // Could be stored in session
        previousIntent: undefined, // Could be stored in session
        previousTopic: undefined, // Could be extracted from previous messages
      };

      // Detect transitions
      transitionAnalysis = await tangentTransitionDetector.detectTransitions(
        message,
        conversationContext
      );

      // Extract current emotional state
      currentEmotionalState = await tangentTransitionDetector.extractEmotionalState(message);

      if (transitionAnalysis.shouldAcknowledge) {
        logger.debug(
          {
            userId,
            transitionType: transitionAnalysis.transitionType,
            topicShift: transitionAnalysis.topicShift.detected,
            emotionalTransition: transitionAnalysis.emotionalTransition.detected,
          },
          'Transition detected in conversation'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Transition detection failed, continuing without');
    }

    // =====================================================
    // MEMORY RECALL DETECTION
    // =====================================================
    const isRecallQuery = this.isRecallQuery(message);
    let recallResult: any = null;
    
    if (isRecallQuery) {
      try {
        const { memoryRecallEngine } = await import('./memoryRecall/recallEngine');
        const { personaController } = await import('./personaController');
        
        // Determine persona (Archivist for recall, or user preference)
        const recallPersona = this.detectArchivistIntent(message) ? 'ARCHIVIST' : 'DEFAULT';
        
        recallResult = await memoryRecallEngine.recallMemory(userId, {
          text: message,
          persona: recallPersona,
        });

        // If silence response, return early with simple message
        if ('message' in recallResult && recallResult.message.includes("don't see")) {
          // Create a simple non-streaming response for silence
          const silenceMessage = recallResult.message;
          return {
            stream: this.createTextStream(silenceMessage),
            metadata: {
              recallResult,
              activePersona: recallPersona,
            },
          };
        }

        // Format recall for chat
        const formatted = memoryRecallEngine.formatRecallForChat(recallResult);
        
        // Apply persona rules
        const personaResponse = personaController.applyPersona(
          { text: formatted.text },
          recallPersona
        );

        // Build recall response text with moments
        const momentsText = formatted.moments
          .slice(0, 3)
          .map(
            (m, i) =>
              `${i + 1}. ${new Date(m.timestamp).toLocaleDateString()}: ${m.summary.substring(0, 100)}${m.summary.length > 100 ? '...' : ''}`
          )
          .join('\n');

        const recallText = `${personaResponse.text}\n\n${momentsText}${personaResponse.footer ? `\n\n${personaResponse.footer}` : ''}`;

        // Create response with recall moments
        return {
          stream: this.createTextStream(recallText),
          metadata: {
            recallResult,
            activePersona: recallPersona,
          },
        };
      } catch (error) {
        logger.warn({ error }, 'Memory recall failed, falling back to normal chat');
        // Fall through to normal chat
      }
    }

    // =====================================================
    // PERSONA DETECTION (Archivist mode)
    // =====================================================
    const isArchivistQuery = this.detectArchivistIntent(message);
    const activePersona = isArchivistQuery ? 'ARCHIVIST' : 'AUTO_BLEND';

    // =====================================================
    // INLINE ENTITY AMBIGUITY DETECTION (IADE)
    // =====================================================
    let disambiguationPrompt: any = null;
    try {
      // Detect intent (for skipping venting/support requests)
      const detectedIntent = intentDetectionService.detectUserIntent(message);
      
      // Extract entity mentions
      const mentions = entityAmbiguityService.extractEntityMentions(message);
      
      if (mentions.length > 0) {
        // Build context from recent messages
        const recentMessages = conversationHistory.slice(-5).map(m => m.content);
        const context = {
          recent_entities: [], // TODO: Extract from recent messages
          recent_messages: recentMessages,
          session_id: '', // TODO: Get from session if available
        };

        // Detect ambiguities
        const ambiguities = await entityAmbiguityService.detectEntityAmbiguity(
          userId,
          mentions,
          context
        );

        // If we found an ambiguity and should prompt, build the prompt
        if (ambiguities.length > 0) {
          const firstAmbiguity = ambiguities[0];
          
          // Check if we should prompt (skip for venting)
          if (
            entityAmbiguityService.shouldPromptDisambiguation(
              firstAmbiguity,
              detectedIntent === 'VENTING' ? 'VENTING' : 'QUESTION' // Map to UserIntent
            )
          ) {
            disambiguationPrompt = entityAmbiguityService.buildDisambiguationPrompt(firstAmbiguity);
          }
        }
      }
    } catch (error) {
      // Fail silently - never interrupt chat flow
      logger.debug({ error, userId }, 'Entity ambiguity detection failed, continuing without');
    }

    // RL: Select optimal persona blend
    let personaBlend;
    let rlContext;
    try {
      personaBlend = await this.personaRL.selectPersonaBlend(
        userId,
        message,
        conversationHistory
      );
      // Build context for saving (needed for reward updates)
      rlContext = await this.personaRL.buildContext(userId, message, conversationHistory);
    } catch (error) {
      logger.warn({ error }, 'RL: Failed to select persona, using default');
      personaBlend = {
        primary: 'therapist',
        secondary: [],
        weights: { therapist: 1.0 },
      };
      rlContext = {
        type: 'chat_persona',
        features: {},
      };
    }

    // RESPONSE SAFETY: Analyze message for stress signals and generate safety guidance
    let safetyContext;
    try {
      safetyContext = responseSafetyService.analyzeMessage(message);
      if (safetyContext.stressSignals.length > 0) {
        logger.debug(
          {
            userId,
            stressSignals: safetyContext.stressSignals.length,
            hasShame: safetyContext.hasShameLanguage,
            hasIsolation: safetyContext.hasIsolationLanguage,
          },
          'Response safety analysis complete'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Response safety analysis failed, continuing without');
      safetyContext = null;
    }

    // Build system prompt with comprehensive lore and essence profile
    let systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources,
      {
        allCharacters: ragPacket.allCharacters,
        allLocations: ragPacket.allLocations,
        allChapters: ragPacket.allChapters,
        timelineHierarchy: ragPacket.timelineHierarchy,
        allPeoplePlaces: ragPacket.allPeoplePlaces,
        essenceProfile: essenceProfile,
        characterAttributesMap: ragPacket.characterAttributesMap,
        romanticRelationships: ragPacket.romanticRelationships,
        corrections: ragPacket.corrections,
        deprecatedUnits: ragPacket.deprecatedUnits,
        workoutEvents: ragPacket.workoutEvents,
        recentBiometrics: ragPacket.recentBiometrics,
        topInterests: ragPacket.topInterests
      },
      entityContext,
      entityAnalytics,
      entityConfidence,
      analyticsGate,
      personaBlend
    );

    // NEW: Enforce Archivist persona if detected
    if (activePersona === 'ARCHIVIST') {
      systemPrompt += `

**ACTIVE PERSONA: ARCHIVIST**
- You are in READ-ONLY mode
- Retrieve facts only, no advice
- Surface uncertainty explicitly
- If confidence is low, say so: "This is tentative due to limited clarity"
- Format responses as: "According to your entries..." or "I found..."
- Do NOT provide suggestions, predictions, or interpretations beyond evidence
`;
    }

    // RESPONSE SAFETY: Inject safety guidance if stress signals detected
    if (safetyContext && safetyContext.stressSignals.length > 0) {
      systemPrompt += `\n\n${safetyContext.safetyGuidance}\n`;
      
      // Adjust persona blend if needed (reduce strategist weight if advice should be avoided)
      if (safetyContext.shouldAvoidAdvice && personaBlend) {
        // Reduce strategist weight, increase therapist weight
        if (personaBlend.weights.strategist && personaBlend.weights.strategist > 0.3) {
          const strategistWeight = personaBlend.weights.strategist;
          personaBlend.weights.strategist = Math.max(0.1, strategistWeight * 0.5);
          personaBlend.weights.therapist = (personaBlend.weights.therapist || 0) + strategistWeight * 0.5;
        }
      }
    }

    // BELIEF CHALLENGE: Check if we can safely challenge a belief
    // Only if safety context allows and user is not in vulnerable state
    if (safetyContext && !safetyContext.hasShame && !safetyContext.hasIsolationLanguage && !safetyContext.hasDependencyFear) {
      try {
        // Get recent perceptions (last 30 days, limit 5)
        const recentPerceptions = await perceptionService.getPerceptionEntries(userId, {
          limit: 5,
          retracted: false,
        });

        // Filter to perceptions older than 7 days
        const eligiblePerceptions = recentPerceptions.filter(p => {
          const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return ageDays >= 7 && p.confidence_level >= 0.3;
        });

        // Check each perception for eligibility
        for (const perception of eligiblePerceptions.slice(0, 2)) { // Limit to 2 challenges max
          const eligibility = isBeliefChallengeAllowed(
            {
              id: perception.id,
              confidence_level: perception.confidence_level,
              created_at: perception.created_at,
            },
            {
              isIsolated: safetyContext.hasIsolationLanguage,
              hasShame: safetyContext.hasShameLanguage,
              hasDependencyFear: safetyContext.hasDependencyFear,
              hasRelationalStrain: safetyContext.hasRelationalStrain,
            }
          );

          if (eligibility.eligible) {
            // Evaluate the belief
            const evaluation = await evaluateBelief(userId, perception.id);

            // Only challenge if there's evidence it might need exploration
            // (repeated multiple times, or has negative reward correlation, or has contradictions)
            if (
              evaluation.repetitionCount > 2 ||
              evaluation.rewardCorrelation < -0.3 ||
              evaluation.contradictingEvidenceCount > 0
            ) {
              // Generate challenge (use 'curious' style for first challenge, 'gentle' for others)
              const challenge = generateBeliefChallenge(
                {
                  id: perception.id,
                  content: perception.content,
                  subject_alias: perception.subject_alias,
                },
                'curious',
                evaluation
              );

              // Inject challenge into system prompt
              systemPrompt += `\n\n**OPTIONAL BELIEF EXPLORATION** (only if conversation naturally flows this way):\n${challenge.challengePrompt}\n\nNote: This is optional. Only bring this up if the conversation naturally allows for gentle exploration. Do not force it.`;

              logger.debug(
                { perceptionId: perception.id, style: challenge.style },
                'Generated belief challenge'
              );

              // Only challenge one belief per conversation to avoid overwhelming
              break;
            }
          }
        }
      } catch (error) {
        // Fail silently - belief challenges are optional
        logger.debug({ error }, 'Belief challenge check failed, continuing without');
      }
    }

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

    // Save chat message and ingest through pipeline (all non-trivial messages)
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    // Only exclude truly trivial messages (hi, ok, thanks, etc.)
    if (!isTrivialMessage(message)) {
      // Get or create chat session
      const sessionId = await this.getOrCreateChatSession(userId);

      // Save message to chat_messages table
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: {
            extractedDates,
            connections: connections.length,
            hasContinuityWarnings: continuityWarnings.length > 0,
            sourcesUsed: sources.length,
          },
        })
        .select('id')
        .single();

      if (saveError || !savedMessage || !savedMessage.id) {
        logger.warn({ error: saveError, userId }, 'Failed to save chat message');
      } else {
        // Set entryId for tracking and RL
        entryId = savedMessage.id;

        // Fire-and-forget ingestion through pipeline (non-blocking)
        // This will:
        // 1. Save to conversation_messages
        // 2. Split into utterances (handles tangents)
        // 3. Extract semantic units (EXPERIENCE, FEELING, THOUGHT, etc.)
        // 4. Create journal_entries from EXPERIENCE units
        // 5. Assemble resolved_events
        conversationIngestionPipeline
          .ingestFromChatMessage(
            userId,
            savedMessage.id,
            sessionId,
            conversationHistory
          )
          .then(result => {
            logger.debug({ userId, messageId: savedMessage.id }, 'Successfully ingested chat message');
          })
          .catch(err => {
            logger.warn({ err, userId, messageId: savedMessage.id }, 'Failed to ingest chat message (non-blocking)');
          });

        timelineUpdates.push('Message saved and queued for processing');
      }

      // Auto-update memoir (fire and forget)
      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      // Auto-update main lifestory biography (fire and forget)
      const { mainLifestoryService } = await import('./mainLifestoryService');
      mainLifestoryService.updateAfterChatEntry(userId).catch(err => {
        logger.warn({ err }, 'Failed to update main lifestory after chat');
      });

      // Extract essence insights after conversation (fire and forget)
      const fullHistory = [...conversationHistory, { role: 'user' as const, content: message }];
      essenceProfileService.extractEssence(userId, fullHistory, ragPacket.relatedEntries)
        .then(insights => {
          if (Object.keys(insights).length > 0) {
            return essenceProfileService.updateProfile(userId, insights);
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to extract essence insights');
        });
    }

    // Extract characters (check both names and aliases/nicknames)
    const characters = await peoplePlacesService.listEntities(userId);
    const messageLower = message.toLowerCase();
    const mentionedCharacters = characters.filter(char => {
      const nameMatch = messageLower.includes(char.name.toLowerCase());
      // Also check corrected names (nicknames/aliases)
      const aliasMatch = char.corrected_names && Array.isArray(char.corrected_names) 
        ? char.corrected_names.some((alias: string) => messageLower.includes(alias.toLowerCase()))
        : false;
      return nameMatch || aliasMatch;
    });
    const characterIds = mentionedCharacters.map(c => c.id);

    // Detect unnamed characters and generate nicknames (fire and forget)
    const { characterNicknameService } = await import('./characterNicknameService');
    characterNicknameService.extractNicknamesFromConversation(userId, message, conversationHistory)
      .then(async (result) => {
        // Create characters with generated nicknames
        for (const newChar of result.newCharacters) {
          try {
            const created = await characterNicknameService.createCharacterWithNickname(userId, newChar);
            if (created) {
              logger.info({ userId, characterId: created.id, nickname: created.name }, 'Created character with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, character: newChar }, 'Failed to create character with nickname');
          }
        }

        // Add nicknames to existing characters
        for (const mapping of result.nicknameMappings) {
          try {
            await characterNicknameService.addNicknameToCharacter(userId, mapping.characterId, mapping.nickname);
          } catch (error) {
            logger.debug({ error, mapping }, 'Failed to add nickname to character');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract nicknames from conversation');
      });

    // Detect unnamed locations and generate nicknames (fire and forget)
    const { locationNicknameService } = await import('./locationNicknameService');
    locationNicknameService.detectAndGenerateNicknames(userId, message, conversationHistory)
      .then(async (locations) => {
        for (const loc of locations) {
          try {
            const created = await locationNicknameService.createLocationWithNickname(userId, loc);
            if (created) {
              logger.info({ userId, locationId: created.id, nickname: created.name }, 'Created location with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, location: loc }, 'Failed to create location with nickname');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract location nicknames from conversation');
      });

    // Detect memory suggestion (proactive memory capture)
    let memorySuggestion: MemorySuggestion | null = null;
    try {
      memorySuggestion = await this.detectMemorySuggestion(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to detect memory suggestion, continuing');
    }

    // Ingest message with entity context (fire-and-forget)
    if (entityContext) {
      this.ingestMessageWithContext(userId, message, conversationHistory, entityContext).catch(err => {
        logger.warn({ err, userId, entityContext }, 'Failed to ingest message with entity context (non-blocking)');
      });
    }

    // RL: Save context for later reward updates (generate message ID if entryId not available)
    const messageId = entryId || randomUUID();
    const sessionId = await this.getOrCreateChatSession(userId);
    if (rlContext && personaBlend) {
      this.personaRL.saveChatContext(
        userId,
        messageId,
        sessionId,
        rlContext,
        personaBlend.primary
      ).catch(err => {
        logger.debug({ err }, 'RL: Failed to save chat context (non-critical)');
      });

      // AUTOMATIC: Record implicit rewards after a delay (when user likely read response)
      // This happens automatically without user action
      setTimeout(() => {
        this.personaRL.recordImplicitRewards(userId, sessionId, {
          messageId,
          actionType: 'follow_up', // Will be updated when user actually sends follow-up
          timeSpent: 5000, // Assume user spent at least 5 seconds reading
        }).catch(err => {
          logger.debug({ err }, 'RL: Failed to record automatic implicit rewards (non-critical)');
        });
      }, 10000); // After 10 seconds, assume user has read the response
    }

    return {
      stream,
      metadata: {
        entryId,
        messageId, // Include messageId for feedback
        sessionId, // Include sessionId for action tracking
        characterIds,
        sources: sources.slice(0, 10),
        connections,
        continuityWarnings,
        timelineUpdates,
        memorySuggestion: memorySuggestion || undefined,
        disambiguationPrompt: disambiguationPrompt || undefined,
        meaningDriftPrompt: meaningDriftPrompt || undefined,
        activePersona: activePersona || undefined
      }
    };
  }

  /**
   * Detect if user query requires Archivist persona (factual recall only)
   */
  private detectArchivistIntent(message: string): boolean {
    const archivistKeywords = [
      'when did', 'when was', 'have i', 'did i', 'what did',
      'tell me about', 'show me', 'find', 'search', 'recall',
      'what happened', 'what was', 'when did i', 'how many times',
      'how often', 'last time', 'first time'
    ];
    const adviceKeywords = ['should', 'advice', 'recommend', 'suggest', 'what should'];
    
    const lowerMessage = message.toLowerCase();
    const hasArchivistKeyword = archivistKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasAdviceKeyword = adviceKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Archivist if has archivist keywords AND no advice keywords
    return hasArchivistKeyword && !hasAdviceKeyword;
  }

  /**
   * Non-streaming chat (fallback)
   */
  async chat(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string }
  ): Promise<OmegaChatResponse> {
    // Build RAG packet
    const ragPacket = await this.buildRAGPacket(userId, message);
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Load essence profile for context
    let essenceProfile: any = null;
    try {
      essenceProfile = await essenceProfileService.getProfile(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to load essence profile, continuing without');
    }

    // Check continuity
    const continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);

    // Find connections
    const connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);

    // Get strategic guidance
    const strategicGuidance = await this.getStrategicGuidance(userId, message);

    // Load entity analytics and confidence if entityContext is provided
    let entityAnalytics: any = null;
    let entityConfidence: number | null = null;
    let analyticsGate: any = null;
    
    if (entityContext) {
      try {
        // Get confidence gate first
        const { entityConfidenceService } = await import('./entityConfidenceService');
        analyticsGate = await entityConfidenceService.shouldSurfaceAnalytics(
          userId,
          entityContext.id,
          entityContext.type === 'ENTITY' ? 'ORG' : entityContext.type
        );
        
        entityConfidence = await entityConfidenceService['getCurrentEntityConfidence'](
          userId,
          entityContext.id,
          entityContext.type === 'ENTITY' ? 'ORG' : entityContext.type
        );

        if (entityContext.type === 'CHARACTER') {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('*')
            .eq('id', entityContext.id)
            .eq('user_id', userId)
            .single();
          if (character) {
            const { characterAnalyticsService } = await import('./characterAnalyticsService');
            entityAnalytics = await characterAnalyticsService.calculateAnalytics(userId, entityContext.id, character);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'LOCATION') {
          const location = await locationService.getLocationProfile(userId, entityContext.id);
          if (location) {
            const { locationAnalyticsService } = await import('./locationAnalyticsService');
            entityAnalytics = await locationAnalyticsService.calculateAnalytics(userId, entityContext.id, location);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'ENTITY') {
          const { organizationService } = await import('./organizationService');
          const org = await organizationService.getOrganization(userId, entityContext.id);
          if (org) {
            const { groupAnalyticsService } = await import('./groupAnalyticsService');
            entityAnalytics = await groupAnalyticsService.calculateAnalytics(userId, entityContext.id, org);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'ROMANTIC_RELATIONSHIP') {
          // Load romantic relationship data
          const { data: relationship } = await supabaseAdmin
            .from('romantic_relationships')
            .select('*')
            .eq('id', entityContext.id)
            .eq('user_id', userId)
            .single();
          
          if (relationship) {
            // Load person name
            let personName = 'Unknown';
            if (relationship.person_type === 'character') {
              const { data: character } = await supabaseAdmin
                .from('characters')
                .select('name')
                .eq('id', relationship.person_id)
                .single();
              personName = character?.name || 'Unknown';
            }
            
            // Load analytics
            const { romanticRelationshipAnalytics } = await import('./conversationCentered/romanticRelationshipAnalytics');
            const analytics = await romanticRelationshipAnalytics.generateAnalytics(userId, entityContext.id);
            
            entityAnalytics = {
              relationship,
              personName,
              analytics: analytics || {
                pros: relationship.pros || [],
                cons: relationship.cons || [],
                redFlags: relationship.red_flags || [],
                greenFlags: relationship.green_flags || [],
                strengths: relationship.strengths || [],
                weaknesses: relationship.weaknesses || [],
                affectionScore: relationship.affection_score || 0.5,
                compatibilityScore: relationship.compatibility_score || 0.5,
                healthScore: relationship.relationship_health || 0.5,
                intensityScore: relationship.emotional_intensity || 0.5,
              }
            };
          }
        }
      } catch (error) {
        logger.debug({ error, entityContext }, 'Failed to load entity analytics, continuing without');
      }
    }

    // RL: Select optimal persona blend
    let personaBlend;
    let rlContext;
    try {
      personaBlend = await this.personaRL.selectPersonaBlend(
        userId,
        message,
        conversationHistory
      );
      // Build context for saving (needed for reward updates)
      rlContext = await this.personaRL.buildContext(userId, message, conversationHistory);
    } catch (error) {
      logger.warn({ error }, 'RL: Failed to select persona, using default');
      personaBlend = {
        primary: 'therapist',
        secondary: [],
        weights: { therapist: 1.0 },
      };
      rlContext = {
        type: 'chat_persona',
        features: {},
      };
    }

    // RESPONSE SAFETY: Analyze message for stress signals and generate safety guidance
    let safetyContext;
    try {
      safetyContext = responseSafetyService.analyzeMessage(message);
      if (safetyContext.stressSignals.length > 0) {
        logger.debug(
          {
            userId,
            stressSignals: safetyContext.stressSignals.length,
            hasShame: safetyContext.hasShameLanguage,
            hasIsolation: safetyContext.hasIsolationLanguage,
          },
          'Response safety analysis complete'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Response safety analysis failed, continuing without');
      safetyContext = null;
    }

    // Build system prompt with comprehensive lore and essence profile
    let systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources,
      {
        allCharacters: ragPacket.allCharacters,
        allLocations: ragPacket.allLocations,
        allChapters: ragPacket.allChapters,
        timelineHierarchy: ragPacket.timelineHierarchy,
        allPeoplePlaces: ragPacket.allPeoplePlaces,
        essenceProfile: essenceProfile,
        characterAttributesMap: ragPacket.characterAttributesMap,
        romanticRelationships: ragPacket.romanticRelationships,
        corrections: ragPacket.corrections,
        deprecatedUnits: ragPacket.deprecatedUnits,
        workoutEvents: ragPacket.workoutEvents,
        recentBiometrics: ragPacket.recentBiometrics,
        topInterests: ragPacket.topInterests
      },
      entityContext,
      entityAnalytics,
      entityConfidence,
      analyticsGate,
      personaBlend
    );

    // RESPONSE SAFETY: Inject safety guidance if stress signals detected (BEFORE creating messages)
    if (safetyContext && safetyContext.stressSignals.length > 0) {
      systemPrompt += `\n\n${safetyContext.safetyGuidance}\n`;
      
      // Adjust persona blend if needed (reduce strategist weight if advice should be avoided)
      if (safetyContext.shouldAvoidAdvice && personaBlend) {
        // Reduce strategist weight, increase therapist weight
        if (personaBlend.weights.strategist && personaBlend.weights.strategist > 0.3) {
          const strategistWeight = personaBlend.weights.strategist;
          personaBlend.weights.strategist = Math.max(0.1, strategistWeight * 0.5);
          personaBlend.weights.therapist = (personaBlend.weights.therapist || 0) + strategistWeight * 0.5;
        }
      }
    }

    // BELIEF CHALLENGE: Check if we can safely challenge a belief (non-streaming chat only)
    // Only if safety context allows and user is not in vulnerable state
    if (safetyContext && !safetyContext.hasShame && !safetyContext.hasIsolationLanguage && !safetyContext.hasDependencyFear) {
      try {
        // Get recent perceptions (last 30 days, limit 5)
        const recentPerceptions = await perceptionService.getPerceptionEntries(userId, {
          limit: 5,
          retracted: false,
        });

        // Filter to perceptions older than 7 days
        const eligiblePerceptions = recentPerceptions.filter(p => {
          const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return ageDays >= 7 && p.confidence_level >= 0.3;
        });

        // Check each perception for eligibility
        for (const perception of eligiblePerceptions.slice(0, 2)) { // Limit to 2 challenges max
          const eligibility = isBeliefChallengeAllowed(
            {
              id: perception.id,
              confidence_level: perception.confidence_level,
              created_at: perception.created_at,
            },
            {
              isIsolated: safetyContext.hasIsolationLanguage,
              hasShame: safetyContext.hasShameLanguage,
              hasDependencyFear: safetyContext.hasDependencyFear,
              hasRelationalStrain: safetyContext.hasRelationalStrain,
            }
          );

          if (eligibility.eligible) {
            // Evaluate the belief
            const evaluation = await evaluateBelief(userId, perception.id);

            // Only challenge if there's evidence it might need exploration
            // (repeated multiple times, or has negative reward correlation, or has contradictions)
            if (
              evaluation.repetitionCount > 2 ||
              evaluation.rewardCorrelation < -0.3 ||
              evaluation.contradictingEvidenceCount > 0
            ) {
              // Generate challenge (use 'curious' style for first challenge, 'gentle' for others)
              const challenge = generateBeliefChallenge(
                {
                  id: perception.id,
                  content: perception.content,
                  subject_alias: perception.subject_alias,
                },
                'curious',
                evaluation
              );

              // Inject challenge into system prompt
              systemPrompt += `\n\n**OPTIONAL BELIEF EXPLORATION** (only if conversation naturally flows this way):\n${challenge.challengePrompt}\n\nNote: This is optional. Only bring this up if the conversation naturally allows for gentle exploration. Do not force it.`;

              logger.debug(
                { perceptionId: perception.id, style: challenge.style },
                'Generated belief challenge'
              );

              // Only challenge one belief per conversation to avoid overwhelming
              break;
            }
          }
        }
      } catch (error) {
        // Fail silently - belief challenges are optional
        logger.debug({ error }, 'Belief challenge check failed, continuing without');
      }
    }

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

    // RL: Save context for later reward updates (use entryId if available, otherwise generate)
    const messageId = entryId || randomUUID();
    const sessionId = await this.getOrCreateChatSession(userId);

    // Save assistant response with challenge metadata if present
    const assistantMetadata: any = {
      sources: sources.slice(0, 10).map(s => ({ type: s.type, id: s.id, title: s.title })),
      connections: connections,
      continuity_warnings: continuityWarnings,
    };

    // Store challenged perception ID if a challenge was generated
    if (challengedPerceptionIdForResponse) {
      assistantMetadata.challenged_perception_id = challengedPerceptionIdForResponse;
      assistantMetadata.challenge_prompt = challengePromptForResponse;
    }

    // Save assistant message (fire-and-forget)
    supabaseAdmin
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        content: answer,
        metadata: assistantMetadata,
      })
      .select('id')
      .single()
      .then(async (result) => {
        if (result.data && result.data.id) {
          logger.debug({ userId, sessionId }, 'Saved assistant response');
          
          // Fire-and-forget: Ingest AI response (for insights and connections)
          // AI responses are marked with lower confidence and as interpretations
          const { conversationIngestionPipeline } = await import('./conversationCentered/ingestionPipeline');
          conversationIngestionPipeline
            .ingestFromChatMessage(
              userId,
              result.data.id,
              sessionId,
              conversationHistory
            )
            .then(() => {
              logger.debug({ userId, messageId: result.data.id }, 'Successfully ingested AI response');
            })
            .catch(err => {
              logger.warn({ err, userId, messageId: result.data.id }, 'Failed to ingest AI response (non-blocking)');
            });
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to save assistant response (non-blocking)');
      });
    if (rlContext && personaBlend) {
      this.personaRL.saveChatContext(
        userId,
        messageId,
        sessionId,
        rlContext,
        personaBlend.primary
      ).catch(err => {
        logger.debug({ err }, 'RL: Failed to save chat context (non-critical)');
      });

      // AUTOMATIC: Record implicit rewards after a delay (when user likely read response)
      // This happens automatically without user action
      setTimeout(() => {
        this.personaRL.recordImplicitRewards(userId, sessionId, {
          messageId,
          actionType: 'follow_up', // Will be updated when user actually sends follow-up
          timeSpent: 5000, // Assume user spent at least 5 seconds reading
        }).catch(err => {
          logger.debug({ err }, 'RL: Failed to record automatic implicit rewards (non-critical)');
        });
      }, 10000); // After 10 seconds, assume user has read the response
    }

    // Generate citations
    const citations = this.generateCitations(sources, answer);

    // Extract memory claims used in response (from omega memory)
    // Note: This is a placeholder - in production, you'd query omega_claims
    // based on entities mentioned in sources or the response content
    const memories: MemoryClaim[] = [];

    // Save chat message and ingest through pipeline (all non-trivial messages)
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    // Only exclude truly trivial messages (hi, ok, thanks, etc.)
    if (!isTrivialMessage(message)) {
      // Get or create chat session
      const sessionId = await this.getOrCreateChatSession(userId);

      // Save message to chat_messages table
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: {
            extractedDates,
            connections: connections.length,
            hasContinuityWarnings: continuityWarnings.length > 0,
            sourcesUsed: sources.length,
          },
        })
        .select('id')
        .single();

      if (saveError || !savedMessage || !savedMessage.id) {
        logger.warn({ error: saveError, userId }, 'Failed to save chat message');
      } else {
        // Set entryId for tracking and RL
        entryId = savedMessage.id;

        // Fire-and-forget ingestion through pipeline (non-blocking)
        conversationIngestionPipeline
          .ingestFromChatMessage(
            userId,
            savedMessage.id,
            sessionId,
            conversationHistory
          )
          .then(result => {
            logger.debug({ userId, messageId: savedMessage.id }, 'Successfully ingested chat message');
          })
          .catch(err => {
            logger.warn({ err, userId, messageId: savedMessage.id }, 'Failed to ingest chat message (non-blocking)');
          });

        timelineUpdates.push('Message saved and queued for processing');
      }

      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      // Auto-update main lifestory biography (fire and forget)
      const { mainLifestoryService } = await import('./mainLifestoryService');
      mainLifestoryService.updateAfterChatEntry(userId).catch(err => {
        logger.warn({ err }, 'Failed to update main lifestory after chat');
      });

      // Extract essence insights after conversation (fire and forget)
      const fullHistory = [...conversationHistory, { role: 'user' as const, content: message }];
      essenceProfileService.extractEssence(userId, fullHistory, ragPacket.relatedEntries)
        .then(insights => {
          if (Object.keys(insights).length > 0) {
            return essenceProfileService.updateProfile(userId, insights);
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to extract essence insights');
        });
    }

    // Extract characters and detect unnamed characters with nicknames
    const characters = await peoplePlacesService.listEntities(userId);
    const mentionedCharacters = characters.filter(char =>
      message.toLowerCase().includes(char.name.toLowerCase())
    );
    const characterIds = mentionedCharacters.map(c => c.id);

    // Detect unnamed characters and generate nicknames (fire and forget)
    const { characterNicknameService } = await import('./characterNicknameService');
    characterNicknameService.extractNicknamesFromConversation(userId, message, conversationHistory)
      .then(async (result) => {
        // Create characters with generated nicknames
        for (const newChar of result.newCharacters) {
          try {
            const created = await characterNicknameService.createCharacterWithNickname(userId, newChar);
            if (created) {
              logger.info({ userId, characterId: created.id, nickname: created.name }, 'Created character with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, character: newChar }, 'Failed to create character with nickname');
          }
        }

        // Add nicknames to existing characters
        for (const mapping of result.nicknameMappings) {
          try {
            await characterNicknameService.addNicknameToCharacter(userId, mapping.characterId, mapping.nickname);
          } catch (error) {
            logger.debug({ error, mapping }, 'Failed to add nickname to character');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract nicknames from conversation');
      });

    // Detect memory suggestion (proactive memory capture)
    let memorySuggestion: MemorySuggestion | null = null;
    try {
      memorySuggestion = await this.detectMemorySuggestion(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to detect memory suggestion, continuing');
    }

    // Detect groups in conversation (fire-and-forget)
    import('./groupDetectionService').then(({ groupDetectionService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      groupDetectionService.detectGroupsInMessage(userId, message, conversationTexts)
        .then(async (detectedGroups) => {
          if (detectedGroups.length > 0) {
            try {
              await groupDetectionService.processDetectedGroups(userId, detectedGroups);
              logger.info({ userId, groupCount: detectedGroups.length }, 'Detected and processed groups from conversation');
            } catch (error) {
              logger.debug({ error, userId }, 'Failed to process detected groups');
            }
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to detect groups from conversation');
        });
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group detection service');
    });

    // Ingest message with entity context (fire-and-forget)
    if (entityContext) {
      this.ingestMessageWithContext(userId, message, conversationHistory, entityContext).catch(err => {
        logger.warn({ err, userId, entityContext }, 'Failed to ingest message with entity context (non-blocking)');
      });
    }

    return {
      answer,
      entryId,
      messageId, // Include messageId for feedback
      sessionId, // Include sessionId for action tracking
      characterIds,
      connections,
      continuityWarnings,
      timelineUpdates,
      strategicGuidance: strategicGuidance || undefined,
      extractedDates,
      sources: sources.slice(0, 10),
      citations,
      memorySuggestion: memorySuggestion || undefined
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

  /**
   * Detect memory-worthy content and create suggestion
   * Proactive memory capture - better than ChatGPT
   */
  private async detectMemorySuggestion(
    userId: string,
    message: string
  ): Promise<MemorySuggestion | null> {
    try {
      // Use LLM to detect if message contains memory-worthy content
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a memory detection system. Determine if the user message contains a factual statement worth remembering.

Return JSON:
{
  "is_memory_worthy": boolean,
  "entity_name": "name of entity (or 'self' for user)",
  "claim_text": "the factual statement to remember",
  "confidence": 0.0-1.0,
  "reasoning": "why this is memory-worthy"
}

Examples of memory-worthy:
- "I'm a software engineer"
- "I live in Seattle"
- "I like coffee"
- "John is my best friend"
- "I work at Google"

Examples of NOT memory-worthy:
- "What do I like?"
- "Tell me about myself"
- "How are you?"
- "Thanks"
- Questions or commands`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

      if (!response.is_memory_worthy || !response.entity_name || !response.claim_text) {
        return null;
      }

      // Get or resolve entity
      const entities = await omegaMemoryService.getEntities(userId);
      let entity = entities.find(e =>
        e.primary_name.toLowerCase() === response.entity_name.toLowerCase() ||
        e.aliases.some((a: string) => a.toLowerCase() === response.entity_name.toLowerCase())
      );

      // If entity is 'self', use first entity or create a default
      if (!entity && response.entity_name.toLowerCase() === 'self') {
        entity = entities[0] || null;
      }

      // If no entity found, try to create one (or skip for now)
      if (!entity) {
        logger.debug({ entityName: response.entity_name }, 'Entity not found for memory suggestion, skipping');
        return null;
      }

      // Get default perspective
      const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
      const selfPerspective = perspectives.find(p => p.type === 'SELF');

      // Create memory proposal through MRQ
      const { proposal } = await memoryReviewQueueService.ingestMemory(
        userId,
        {
          id: '',
          text: response.claim_text,
          confidence: response.confidence || 0.6,
          metadata: {},
        },
        entity,
        selfPerspective?.id || null,
        message
      );

      return {
        proposal_id: proposal.id,
        entity_name: entity.primary_name,
        claim_text: response.claim_text,
        confidence: response.confidence || 0.6,
        source_excerpt: message.length > 200 ? message.substring(0, 200) + '...' : message,
        reasoning: response.reasoning || proposal.reasoning,
        risk_level: proposal.risk_level,
      };
    } catch (error) {
      logger.debug({ err: error, userId, message }, 'Failed to detect memory suggestion');
      return null;
    }
  }

  /**
   * Helper: Get or create a chat session for the user
   */
  private async getOrCreateChatSession(userId: string): Promise<string> {
    try {
      // Try to get the most recent active session
      const { data: existingSession } = await supabaseAdmin
        .from('chat_sessions')
        .select('session_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingSession?.session_id) {
        // Update the session's updated_at timestamp
        await supabaseAdmin
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('session_id', existingSession.session_id);
        
        if (!existingSession.session_id) {
          throw new Error('Existing session has no session_id');
        }
        return existingSession.session_id;
      }

      // Create new session
      const newSessionId = randomUUID();
      const { data: newSession, error } = await supabaseAdmin
        .from('chat_sessions')
        .insert({
          user_id: userId,
          session_id: newSessionId,
          metadata: {},
        })
        .select('session_id')
        .single();

      if (error) {
        logger.warn({ error, userId }, 'Failed to create chat session, using temporary ID');
        return randomUUID(); // Fallback to temporary ID
      }

      if (!newSession || !newSession.session_id) {
        logger.warn({ userId }, 'Created session but no session_id returned, using provided ID');
        return newSessionId; // Use the ID we generated
      }

      return newSession.session_id;
    } catch (error) {
      logger.warn({ error, userId }, 'Error getting/creating chat session, using temporary ID');
      return randomUUID(); // Fallback to temporary ID
    }
  }

  /**
   * Helper: Get recent insights from essence profile for refinement context
   */
  private getRecentInsights(profile: any): Array<{ id: string; category: string; text: string; confidence: number }> {
    const insights: Array<{ id: string; category: string; text: string; confidence: number }> = [];
    
    const categories: Array<keyof typeof profile> = [
      'hopes', 'dreams', 'fears', 'strengths', 'weaknesses',
      'coreValues', 'personalityTraits', 'relationshipPatterns'
    ];

    for (const category of categories) {
      const items = profile[category] || [];
      items.forEach((item: any, idx: number) => {
        if (item.confidence > 0.5) {
          insights.push({
            id: `${String(category)}-${idx}`,
            category: String(category),
            text: item.text,
            confidence: item.confidence
          });
        }
      });
    }

    // Add skills
    if (profile.topSkills) {
      profile.topSkills.forEach((skill: any, idx: number) => {
        if (skill.confidence > 0.5) {
          insights.push({
            id: `topSkills-${idx}`,
            category: 'topSkills',
            text: skill.skill,
            confidence: skill.confidence
          });
        }
      });
    }

    // Return top 10 most confident insights
    return insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /**
   * Ingest message with entity context (fire-and-forget)
   */
  private async ingestMessageWithContext(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    entityContext: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string }
  ): Promise<void> {
    try {
      // Get or create a conversation session for entity-scoped chat
      // Use metadata to mark it as entity-scoped
      const { data: existingSession } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('metadata->>entity_type', entityContext.type)
        .eq('metadata->>entity_id', entityContext.id)
        .single();

      let sessionId: string;
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const { data: newSession, error: sessionError } = await supabaseAdmin
          .from('conversation_sessions')
          .insert({
            user_id: userId,
            scope: 'PRIVATE',
            metadata: {
              entity_type: entityContext.type,
              entity_id: entityContext.id,
              is_entity_scoped: true,
            },
          })
          .select('id')
          .single();

        if (sessionError || !newSession) {
          throw sessionError || new Error('Failed to create entity-scoped session');
        }

        sessionId = newSession.id;
      }

      // Ingest message with entity context
      await conversationIngestionPipeline.ingestMessage(
        userId,
        sessionId,
        'USER',
        message,
        conversationHistory,
        undefined, // eventContext
        entityContext
      );
    } catch (error) {
      logger.warn({ error, userId, entityContext }, 'Failed to ingest message with entity context');
      throw error;
    }
  }
}

export const omegaChatService = new OmegaChatService();


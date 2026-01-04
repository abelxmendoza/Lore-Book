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
import { locationService } from './locationService';
import { supabaseAdmin } from './supabaseClient';
import { ragPacketCacheService } from './ragPacketCacheService';
import { essenceProfileService } from './essenceProfileService';
import { essenceRefinementEngine } from './essenceRefinement';
import { omegaMemoryService } from './omegaMemoryService';
import { memoryReviewQueueService } from './memoryReviewQueueService';
import { perspectiveService } from './perspectiveService';

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
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata: {
    entryId?: string;
    characterIds?: string[];
    sources?: ChatSource[];
    connections?: string[];
    continuityWarnings?: string[];
    timelineUpdates?: string[];
    memorySuggestion?: MemorySuggestion;
  };
};

class OmegaChatService {
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

    // Get HQI semantic search results with error handling
    let hqiResults: any[] = [];
    try {
      hqiResults = hqiService.search(message, {}).slice(0, 5);
    } catch (error) {
      logger.warn({ error }, 'Failed to get HQI results, using empty');
    }

    // Get related entries for Memory Fabric with error handling
    let relatedEntries: ResolvedMemoryEntry[] = [];
    try {
      relatedEntries = await memoryService.searchEntriesWithCorrections(userId, {
        search: message,
        limit: 20
      });
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
      allPeoplePlaces
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
    }
  ): string {
    const timelineSummary = orchestratorSummary.timeline.events
      .slice(0, 20)
      .map((e: any) => `Date: ${e.date}\n${e.summary || e.content?.substring(0, 100)}`)
      .join('\n---\n');

    // Build comprehensive character knowledge (including nicknames/aliases)
    const charactersKnowledge = loreData?.allCharacters?.length
      ? loreData.allCharacters.map((char: any) => {
          const aliases = char.alias && Array.isArray(char.alias) && char.alias.length > 0 
            ? ` (also known as: ${char.alias.join(', ')})` 
            : '';
          const details = [
            `${char.name}${aliases}`,
            char.role ? `Role: ${char.role}` : '',
            char.archetype ? `Archetype: ${char.archetype}` : '',
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

    return `You are a multi-faceted AI companion integrated into Lore Keeper. You seamlessly blend five personas based on context:

**YOUR PERSONAS** (adapt naturally based on conversation):

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

**IMPORTANT**: You know ALL their lore AND their essence. Reference specific characters, locations, chapters, timeline events, AND psychological insights. Show deep knowledge of their story AND their inner world. Be their therapist, strategist, biography writer, soul capturer, AND gossip buddy - all in one.`;
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
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<StreamingChatResponse> {
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

    // Build system prompt with comprehensive lore and essence profile
    const systemPrompt = this.buildSystemPrompt(
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
        essenceProfile: essenceProfile
      }
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

    // Detect memory suggestion (proactive memory capture)
    let memorySuggestion: MemorySuggestion | null = null;
    try {
      memorySuggestion = await this.detectMemorySuggestion(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to detect memory suggestion, continuing');
    }

    return {
      stream,
      metadata: {
        entryId,
        characterIds,
        sources: sources.slice(0, 10),
        connections,
        continuityWarnings,
        timelineUpdates,
        memorySuggestion: memorySuggestion || undefined
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

    // Build system prompt with comprehensive lore and essence profile
    const systemPrompt = this.buildSystemPrompt(
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
        essenceProfile: essenceProfile
      }
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

    // Extract memory claims used in response (from omega memory)
    // Note: This is a placeholder - in production, you'd query omega_claims
    // based on entities mentioned in sources or the response content
    const memories: MemoryClaim[] = [];

    // Save entry if needed
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    if (shouldPersistMessage(message)) {
      // Extract and assign date if available
      let entryDate: Date | undefined;
      if (extractedDates && extractedDates.length > 0) {
        // Use the first extracted date with highest confidence
        const bestDate = extractedDates.reduce((best, current) => 
          (current.confidence || 0) > (best.confidence || 0) ? current : best
        );
        entryDate = new Date(bestDate.date);
      }

      const savedEntry = await memoryService.saveEntry({
        userId,
        content: message,
        date: entryDate?.toISOString(),
        tags: extractTags(message),
        source: 'chat',
        metadata: { 
          autoCaptured: true,
          extractedDates,
          datePrecision: extractedDates[0]?.precision,
          dateConfidence: extractedDates[0]?.confidence,
          dateSource: extractedDates[0] ? 'extracted' : 'default',
          connections: connections.length,
          hasContinuityWarnings: continuityWarnings.length > 0,
          sourcesUsed: sources.length
        }
      });
      entryId = savedEntry.id;
      timelineUpdates.push('Entry saved to timeline');
      if (entryDate) {
        timelineUpdates.push(`Date assigned: ${entryDate.toLocaleDateString()}`);
      }

      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
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
}

export const omegaChatService = new OmegaChatService();


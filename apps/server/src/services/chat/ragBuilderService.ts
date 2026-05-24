import { logger } from '../../logger';
import type { ResolvedMemoryEntry } from '../../types';
import type { CurrentContext } from '../../types/currentContext';

import { chapterService } from '../chapterService';
import { hqiService } from '../hqiService';
import { locationService } from '../locationService';
import { memoryGraphService } from '../memoryGraphService';
import { orchestratorService } from '../orchestratorService';
import { peoplePlacesService } from '../peoplePlacesService';
import { ragPacketCacheService } from '../ragPacketCacheService';
import { supabaseAdmin } from '../supabaseClient';
import type { ChatSource } from '../omegaChatService';

// ─── Fitness keyword gate ────────────────────────────────────────────────────
const FITNESS_RE = /\b(workout|exercise|gym|ran|run|lifted|bench|squat|deadlift|calories|weight|lbs|kg|miles|steps|cardio|biometric|body fat|muscle)\b/i;

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Assembles the full RAG packet for a chat turn.
 * Results are cached: lore data by userId (3-min TTL), full packet by message hash (5-min TTL).
 */
export async function buildRAGPacket(
  userId: string,
  message: string,
  currentContext?: CurrentContext,
  extractDatesAndTimes?: (msg: string) => Promise<Array<{ date: string; context: string; precision: string; confidence: number }>>
) {
  // Full-packet cache hit — skip everything
  const cached = ragPacketCacheService.getCachedPacket(userId, message);
  if (cached) return cached;

  // ── Orchestrator summary ─────────────────────────────────────────────────
  let orchestratorSummary: any = { timeline: { events: [], arcs: [] }, characters: [] };
  try {
    orchestratorSummary = await orchestratorService.getSummary(userId);
  } catch (error) {
    logger.warn({ error }, 'RAGBuilder: orchestrator summary failed');
  }

  // ── Static lore (characters, locations, chapters, etc.) ─────────────────
  let allCharacters: any[] = [];
  let allLocations: any[] = [];
  let allChapters: any[] = [];
  let timelineHierarchy: any = { eras: [], sagas: [], arcs: [] };
  let allPeoplePlaces: any[] = [];
  let characterAttributesMap = new Map<string, any[]>();
  let romanticRelationships: any[] = [];
  let corrections: any[] = [];
  let deprecatedUnits: any[] = [];
  let workoutEvents: any[] = [];
  let recentBiometrics: any[] = [];
  let topInterests: any[] = [];

  const cachedLore = ragPacketCacheService.getLoreCache(userId);
  if (cachedLore) {
    ({ allCharacters, allLocations, allChapters, timelineHierarchy, allPeoplePlaces,
      romanticRelationships, corrections, deprecatedUnits, workoutEvents, recentBiometrics, topInterests } = cachedLore);
    characterAttributesMap = new Map(Object.entries(cachedLore.characterAttributesMap || {}));
  } else {
    // Characters
    try {
      const { data } = await supabaseAdmin
        .from('characters').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      allCharacters = (data as any[]) || [];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: characters fetch failed'); }

    // Locations, chapters, timeline hierarchy, people/places — parallel
    try {
      const [locResult, chapResult, erasResult, sagasResult, arcsResult, ppResult] = await Promise.all([
        locationService.listLocations(userId).catch((): any[] => []),
        chapterService.listChapters(userId).catch((): any[] => []),
        supabaseAdmin.from('eras').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('sagas').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('arcs').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        peoplePlacesService.listEntities(userId).catch((): any[] => []),
      ]);
      allLocations = locResult as any[];
      allChapters = chapResult as any[];
      timelineHierarchy = {
        eras: (erasResult as any).data || [],
        sagas: (sagasResult as any).data || [],
        arcs: (arcsResult as any).data || [],
      };
      allPeoplePlaces = ppResult as any[];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: lore parallel fetch failed'); }

    // Character attributes — single batched query
    if (allCharacters.length > 0) {
      try {
        const charIds = allCharacters.map((c: any) => c.id);
        const { data: attrData } = await supabaseAdmin
          .from('entity_attributes').select('*')
          .eq('user_id', userId).eq('entity_type', 'character').eq('is_current', true)
          .in('entity_id', charIds);
        for (const attr of ((attrData as any[]) || [])) {
          const list = characterAttributesMap.get(attr.entity_id) ?? [];
          list.push({
            entityId: attr.entity_id, entityType: attr.entity_type,
            attributeType: attr.attribute_type, attributeValue: attr.attribute_value,
            confidence: attr.confidence, isCurrent: attr.is_current,
            startTime: attr.start_time, endTime: attr.end_time,
            evidence: attr.metadata?.evidence || '',
            evidenceSourceIds: attr.evidence_source_ids || [],
          });
          characterAttributesMap.set(attr.entity_id, list);
        }
      } catch (e) { logger.debug({ e }, 'RAGBuilder: character attributes fetch failed'); }
    }

    // Romantic relationships
    try {
      const { data } = await supabaseAdmin
        .from('romantic_relationships').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(20);
      romanticRelationships = (data as any[]) || [];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: romantic relationships fetch failed'); }

    // Corrections + deprecated units
    try {
      const [corrResult, deprResult] = await Promise.all([
        supabaseAdmin.from('correction_records').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabaseAdmin.from('extracted_units').select('*').eq('user_id', userId).eq('metadata->>deprecated', 'true').order('created_at', { ascending: false }).limit(30),
      ]);
      corrections = ((corrResult as any).data as any[]) || [];
      deprecatedUnits = ((deprResult as any).data as any[]) || [];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: corrections/deprecated fetch failed'); }

    // Fitness data — only if message is fitness-related
    if (FITNESS_RE.test(message)) {
      try {
        const { workoutEventDetector } = await import('../conversationCentered/workoutEventDetector');
        workoutEvents = await workoutEventDetector.getWorkoutEvents(userId, 20, 0);
        const { data } = await supabaseAdmin
          .from('biometric_measurements').select('*').eq('user_id', userId)
          .order('measurement_date', { ascending: false }).limit(10);
        recentBiometrics = (data as any[]) || [];
      } catch (e) { logger.debug({ e }, 'RAGBuilder: fitness data fetch failed'); }
    }

    // Interests
    try {
      const { interestTracker } = await import('../conversationCentered/interestTracker');
      topInterests = await interestTracker.getTopInterests(userId, 30);
    } catch (e) { logger.debug({ e }, 'RAGBuilder: interests fetch failed'); }

    ragPacketCacheService.setLoreCache(userId, {
      allCharacters, allLocations, allChapters, timelineHierarchy, allPeoplePlaces,
      characterAttributesMap: Object.fromEntries(characterAttributesMap),
      romanticRelationships, corrections, deprecatedUnits, workoutEvents, recentBiometrics, topInterests,
    });
  }

  // ── HQI semantic search ──────────────────────────────────────────────────
  let hqiResults: any[] = [];
  try {
    hqiResults = hqiService.search(message, {}).slice(0, 5);
  } catch (e) { logger.warn({ e }, 'RAGBuilder: HQI search failed'); }

  // ── Related entries (context-aware or enhanced retrieval) ────────────────
  let relatedEntries: ResolvedMemoryEntry[] = [];
  try {
    const { retrieveMemoriesByThread, retrieveMemoriesUnderNode } = await import('../chat/contextAwareMemoryRetrieval');
    const { MemoryRetriever } = await import('../chat/memoryRetriever');

    if (currentContext?.kind === 'thread' && currentContext.threadId) {
      relatedEntries = (await retrieveMemoriesByThread(userId, currentContext.threadId, 30)) as ResolvedMemoryEntry[];
    } else if (currentContext?.kind === 'timeline' && currentContext.timelineNodeId && currentContext.timelineLayer) {
      relatedEntries = (await retrieveMemoriesUnderNode(userId, currentContext.timelineNodeId, currentContext.timelineLayer, 30)) as ResolvedMemoryEntry[];
    } else {
      const retriever = new MemoryRetriever();
      const ctx = await retriever.retrieve(userId, 20, message, []);
      relatedEntries = ctx.entries as ResolvedMemoryEntry[];
    }
  } catch (e) { logger.warn({ e }, 'RAGBuilder: related entries fetch failed'); }

  // ── Memory Fabric neighbors ──────────────────────────────────────────────
  const fabricNeighbors: ChatSource[] = [];
  try {
    if (relatedEntries.length > 0) {
      const graph = await memoryGraphService.buildGraph(userId);
      const topIds = relatedEntries.slice(0, 5).map(e => e.id);
      const seen = new Set<string>();
      topIds.forEach(entryId => {
        graph.edges
          .filter(e => (e.source === entryId || e.target === entryId))
          .slice(0, 3)
          .forEach(edge => {
            const neighborId = edge.source === entryId ? edge.target : edge.source;
            if (seen.has(neighborId)) return;
            seen.add(neighborId);
            const node = graph.nodes.find(n => n.id === neighborId);
            if (node?.type === 'event') {
              fabricNeighbors.push({
                type: 'fabric', id: neighborId, title: node.label,
                snippet: (node.metadata as any)?.content?.substring(0, 100) || node.label,
              });
            }
          });
      });
    }
  } catch (e) { logger.debug({ e }, 'RAGBuilder: memory fabric failed'); }

  // ── Date extraction ──────────────────────────────────────────────────────
  let extractedDates: Array<{ date: string; context: string; precision: string; confidence: number }> = [];
  if (extractDatesAndTimes) {
    try {
      extractedDates = await extractDatesAndTimes(message);
    } catch (e) { logger.warn({ e }, 'RAGBuilder: date extraction failed'); }
  }

  // ── Sources array ────────────────────────────────────────────────────────
  const sources: ChatSource[] = [
    ...orchestratorSummary.timeline.events.slice(0, 15).map((e: any) => ({
      type: 'entry' as const, id: e.id,
      title: e.summary || e.content?.substring(0, 50) || 'Untitled',
      snippet: e.summary || e.content?.substring(0, 150), date: e.date,
    })),
    ...allCharacters.slice(0, 20).map((c: any) => ({
      type: 'character' as const, id: c.id, title: c.name || 'Unknown',
      snippet: c.summary || `${c.role || ''} ${c.archetype || ''}`.trim() || 'Character',
      date: c.first_appearance,
    })),
    ...allLocations.slice(0, 15).map((l: any) => ({
      type: 'location' as const, id: l.id, title: l.name || 'Unknown Location',
      snippet: `Visited ${l.visitCount || 0} times`, date: l.firstVisited,
    })),
    ...allChapters.slice(0, 10).map((c: any) => ({
      type: 'chapter' as const, id: c.id, title: c.title || 'Untitled Chapter',
      snippet: c.summary || c.description || '', date: c.start_date,
    })),
    ...timelineHierarchy.eras.slice(0, 5).map((e: any) => ({
      type: 'era' as const, id: e.id, title: e.title || 'Untitled Era',
      snippet: e.description || '', date: e.start_date,
    })),
    ...timelineHierarchy.sagas.slice(0, 5).map((s: any) => ({
      type: 'saga' as const, id: s.id, title: s.title || 'Untitled Saga',
      snippet: s.description || '', date: s.start_date,
    })),
    ...timelineHierarchy.arcs.slice(0, 5).map((a: any) => ({
      type: 'arc' as const, id: a.id, title: a.title || 'Untitled Arc',
      snippet: a.description || '', date: a.start_date,
    })),
    ...hqiResults.map((r: any) => ({
      type: 'hqi' as const, id: r.node_id, title: r.title,
      snippet: r.snippet, date: r.timestamp,
    })),
    ...fabricNeighbors,
  ];

  const packet = {
    orchestratorSummary, hqiResults, relatedEntries, fabricNeighbors,
    extractedDates, sources,
    allCharacters, allLocations, allChapters, timelineHierarchy, allPeoplePlaces,
    characterAttributesMap: Object.fromEntries(characterAttributesMap),
    romanticRelationships, corrections, deprecatedUnits,
    workoutEvents, recentBiometrics, topInterests,
  };

  ragPacketCacheService.cachePacket(userId, message, packet);
  return packet;
}

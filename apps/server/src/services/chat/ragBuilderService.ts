import { logger } from '../../logger';
import type { ResolvedMemoryEntry } from '../../types';
import type { CurrentContext } from '../../types/currentContext';
import { formatSelfRomanticIdentityLines } from '../identity/selfRomanticIdentity';
import { chapterService } from '../chapterService';
import { hqiService } from '../hqiService';
import { loadPromptClaims } from '../knowledgeCrystallization';
import { locationService } from '../locationService';
import { memoryGraphService } from '../memoryGraphService';
import type { ChatSource } from '../omegaChatService';
import { orchestratorService } from '../orchestratorService';
import { ragPacketCacheService } from '../ragPacketCacheService';
import { supabaseAdmin } from '../supabaseClient';

import {
  isEntityQuery,
  detectMentionedEntities,
  loadEntityArc,
  arcToMemoryEntries,
} from './entityScopedRetriever';
import { buildLegacyPeoplePlacesView } from './foundationEntityIndex';
import {
  resolveRelationshipNames,
  buildRelationshipContext,
  type RelationshipContinuitySummary,
} from './relationshipContextBuilder';
import {
  buildRetellingRecallBlock,
  isRetellingRecallMessage,
  retrievePriorRetellings,
} from './retellingRecallService';
import { chooseRetrievalPath } from './retrievalStrategy';
import {
  RAG_ARC_COLS,
  RAG_BIOMETRIC_COLS,
  RAG_CHARACTER_COLS,
  RAG_CORRECTION_COLS,
  RAG_DEPRECATED_UNIT_COLS,
  RAG_ENTITY_ATTR_COLS,
  RAG_ERA_COLS,
  RAG_ORG_COLS,
  RAG_ROMANCE_COLS,
  RAG_SAGA_COLS,
} from './ragLoreProjections';
import {
  assembleWorkingMemory,
  buildWorkingMemoryPacket,
  type WorkingMemoryAssembly,
  type WorkingMemoryItem,
} from './workingMemoryAssembler';

export type RagFocus = {
  id: string;
  name: string;
  type: 'character' | 'location' | 'organization' | string;
};

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
  extractDatesAndTimes?: (msg: string) => Promise<Array<{ date: string; context: string; precision: string; confidence: number }>>,
  scopePlan?: import('../responseScope').ResponseScopePlan,
  currentMessageId?: string,
  focus?: RagFocus | null,
) {
  // Full-packet cache hit — skip everything
  // Retellings deliberately bypass the message-text cache: an identical new
  // telling changes the evidence set even when the text is unchanged.
  const retellingRecall = isRetellingRecallMessage(message);
  const cacheContextKey = [
    currentContext?.kind ?? 'none',
    currentContext?.threadId ?? '',
    currentContext?.timelineNodeId ?? '',
    focus?.type ?? '',
    focus?.id ?? '',
  ].join(':');
  const cached = retellingRecall
    ? null
    : ragPacketCacheService.getCachedPacket(userId, message, cacheContextKey);
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
  // Episodic evidence: recent character_memories grouped by character_id
  let characterMemoriesMap: Record<string, any[]> = {};

  const cachedLore = ragPacketCacheService.getLoreCache(userId);
  if (cachedLore) {
    ({ allCharacters, allLocations, allChapters, timelineHierarchy, allPeoplePlaces,
      romanticRelationships, corrections, deprecatedUnits, workoutEvents, recentBiometrics, topInterests } = cachedLore);
    characterAttributesMap = new Map(Object.entries(cachedLore.characterAttributesMap || {}));
    characterMemoriesMap = (cachedLore as any).characterMemoriesMap || {};
  } else {
    // Characters
    try {
      const { data } = await supabaseAdmin
        .from('characters').select(RAG_CHARACTER_COLS).eq('user_id', userId).order('created_at', { ascending: false });
      allCharacters = (data as any[]) || [];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: characters fetch failed'); }

    // Locations, chapters, timeline hierarchy, people/places — parallel
    try {
      const [locResult, chapResult, erasResult, sagasResult, arcsResult, orgsResult] = await Promise.all([
        locationService.listLocations(userId).catch((): any[] => []),
        chapterService.listChapters(userId).catch((): any[] => []),
        supabaseAdmin.from('eras').select(RAG_ERA_COLS).eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('sagas').select(RAG_SAGA_COLS).eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('arcs').select(RAG_ARC_COLS).eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('organizations').select(RAG_ORG_COLS).eq('user_id', userId),
      ]);
      allLocations = locResult as any[];
      allChapters = chapResult as any[];
      timelineHierarchy = {
        eras: (erasResult as any).data || [],
        sagas: (sagasResult as any).data || [],
        arcs: (arcsResult as any).data || [],
      };
      allPeoplePlaces = buildLegacyPeoplePlacesView(
        allCharacters,
        allLocations,
        ((orgsResult as any).data as any[]) || []
      );
    } catch (e) { logger.debug({ e }, 'RAGBuilder: lore parallel fetch failed'); }

    // Character attributes — single batched query
    if (allCharacters.length > 0) {
      try {
        const charIds = allCharacters.map((c: any) => c.id);
        const { data: attrData } = await supabaseAdmin
          .from('entity_attributes').select(RAG_ENTITY_ATTR_COLS)
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

      // character_memories — batched, capped at 5 per character for system prompt relevance
      try {
        const charIds = allCharacters.map((c: any) => c.id);
        const { data: memData } = await supabaseAdmin
          .from('character_memories')
          .select('character_id, summary, created_at')
          .in('character_id', charIds)
          .order('created_at', { ascending: false })
          .limit(charIds.length * 5);
        for (const mem of ((memData as any[]) || [])) {
          const list = characterMemoriesMap[mem.character_id] ?? [];
          if (list.length < 5) list.push({ summary: mem.summary, createdAt: mem.created_at });
          characterMemoriesMap[mem.character_id] = list;
        }
      } catch (e) { logger.debug({ e }, 'RAGBuilder: character memories fetch failed'); }
    }

    // Romantic relationships — fetch + resolve partner names (batched, not N+1)
    try {
      const { data } = await supabaseAdmin
        .from('romantic_relationships').select(RAG_ROMANCE_COLS).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(20);
      const raw = (data as any[]) || [];
      romanticRelationships = await resolveRelationshipNames(raw);
    } catch (e) { logger.debug({ e }, 'RAGBuilder: romantic relationships fetch failed'); }

    // Corrections + deprecated units
    try {
      const [corrResult, deprResult] = await Promise.all([
        supabaseAdmin.from('correction_records').select(RAG_CORRECTION_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabaseAdmin.from('extracted_units').select(RAG_DEPRECATED_UNIT_COLS).eq('user_id', userId).or('metadata->>deprecated.eq.true,superseded_at.not.is.null').order('created_at', { ascending: false }).limit(30),
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
          .from('biometric_measurements').select(RAG_BIOMETRIC_COLS).eq('user_id', userId)
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
      characterMemoriesMap,
      romanticRelationships, corrections, deprecatedUnits, workoutEvents, recentBiometrics, topInterests,
    } as any);
  }

  // ── Social centrality → character salience boost ────────────────────────
  // Load top social-graph centrality scores and merge onto allCharacters by name.
  // This lets systemPromptBuilder rank characters by their actual network importance
  // rather than just recency/confidence.
  if (allCharacters.length > 0) {
    try {
      const { data: centralityRows } = await supabaseAdmin
        .from('social_nodes')
        .select('person_name, centrality')
        .eq('user_id', userId)
        .order('centrality', { ascending: false })
        .limit(50);

      if (centralityRows && centralityRows.length > 0) {
        const centralityMap = new Map<string, number>(
          centralityRows.map((r: any) => [r.person_name?.toLowerCase(), r.centrality ?? 0])
        );
        allCharacters = allCharacters.map((c: any) => ({
          ...c,
          centrality: centralityMap.get(c.name?.toLowerCase()) ?? 0,
        }));
      }
    } catch (e) { logger.debug({ e }, 'RAGBuilder: centrality merge failed'); }
  }

  // ── Working Memory — single authoritative retrieval packet ───────────────
  // Assemble before legacy retrieval so normal turns can skip the parallel
  // entity arc / generic memory / dossier passes when WMA found usable context.
  let foundationRecallBlock = '';
  let foundationRelationships: any[] = [];
  let foundationTimeline: any[] = [];
  let workingMemory: WorkingMemoryAssembly | null = null;
  let workingMemoryPacket: ReturnType<typeof buildWorkingMemoryPacket> | null = null;
  const workingMemorySources: ChatSource[] = [];
  const retrievalPaths: string[] = [];

  try {
    const { loadLivingMemoryPreferences } = await import('../preferences/livingMemoryPreferences');
    const livingMemory = await loadLivingMemoryPreferences(userId);
    if (!livingMemory.useLivingMemory) {
      logger.debug({ userId }, 'RAGBuilder: Living Memory use disabled — skipping WMA');
    } else {
      workingMemory = await assembleWorkingMemory({
        userId,
        question: message,
        threadId: (currentContext as { threadId?: string } | undefined)?.threadId,
        focus: focus
          ? { id: focus.id, name: focus.name, type: focus.type }
          : undefined,
      });
      const { planResponseScope, applyScopePlanToAssembly } = await import('../responseScope');
      workingMemory = applyScopePlanToAssembly(
        workingMemory,
        scopePlan ?? planResponseScope(message),
      );
      workingMemoryPacket = buildWorkingMemoryPacket(workingMemory);
      foundationRecallBlock = workingMemoryPacket.text;
      foundationRelationships = workingMemory.relationships;
      foundationTimeline = workingMemory.timeline;
      retrievalPaths.push('working_memory');

      const selectedItems: WorkingMemoryItem[] = [
        ...workingMemory.episodes,
        ...workingMemory.events,
        ...workingMemory.projects,
        ...workingMemory.goals,
        ...workingMemory.skills,
        ...workingMemory.communities,
        ...workingMemory.relationships,
        ...workingMemory.preferences,
        ...workingMemory.claims,
        ...workingMemory.timeline,
      ];
      const existingSourceIds = new Set<string>();
      for (const item of selectedItems) {
        if (existingSourceIds.has(item.id)) continue;
        existingSourceIds.add(item.id);
        workingMemorySources.push({
          type: 'knowledge',
          id: item.id,
          title: item.title,
          snippet: item.content.slice(0, 240),
          date: item.date ?? undefined,
          relevanceScore: Math.round(item.score * 100),
          relevanceReasons: item.reasons,
        });
      }

      logger.debug({
        userId,
        intent: workingMemory.intent,
        primaryContext: workingMemory.contextPlan.primary,
        secondaryContexts: workingMemory.contextPlan.secondary,
        excludedContexts: workingMemory.contextPlan.excluded,
        contextDriftPruned: workingMemory.contextDiagnostics.prunedForDrift,
        contextCoverage: workingMemory.contextDiagnostics.coverageEstimate,
        contextConfidence: workingMemory.contextDiagnostics.confidenceEstimate,
        contextCompleteness: workingMemory.contextDiagnostics.completenessEstimate,
        contextFreshness: workingMemory.contextDiagnostics.newestEvidenceAt,
        selected: workingMemory.budget.selected,
        rejected: workingMemory.budget.rejected,
        confidence: workingMemory.confidence,
        queries: workingMemory.timing?.queryCount ?? 0,
      }, 'RAGBuilder: working memory assembled');
    }
  } catch (e) {
    logger.debug({ e }, 'RAGBuilder: working memory assembly failed');
  }

  let retellingRecallBlock: string | null = null;
  const retellingSources: ChatSource[] = [];
  if (retellingRecall) {
    const priorRetellings = await retrievePriorRetellings(
      userId,
      message,
      currentMessageId,
    );
    retellingRecallBlock = buildRetellingRecallBlock(message, priorRetellings);
    for (const prior of priorRetellings) {
      retellingSources.push({
        type: 'knowledge',
        id: prior.id,
        title: 'Prior telling of this story',
        snippet: prior.content.replace(/\s+/g, ' ').trim().slice(0, 240),
        date: prior.createdAt,
        relevanceScore: Math.round(prior.similarity * 100),
        relevanceReasons: [
          'prior user-authored telling',
          `${prior.sharedTerms.length} shared story terms`,
          'explicit retelling verification',
        ],
      });
    }
    retrievalPaths.push(
      priorRetellings.length > 0 ? 'retelling_evidence_match' : 'retelling_no_verified_match',
    );
  }

  // ── HQI semantic search ──────────────────────────────────────────────────
  let hqiResults: any[] = [];
  try {
    hqiResults = hqiService.search(message, {}).slice(0, 5);
  } catch (e) { logger.warn({ e }, 'RAGBuilder: HQI search failed'); }

  // ── Related entries — entity-scoped or generic retrieval ────────────────
  //
  // Entity-scoped path (Phase 2 — highest retrieval quality for entity queries):
  //   When the message is a query about a specific person or place, bypass
  //   generic semantic search and load that entity's complete arc from the DB.
  //   This gives the model an ordered, structured, confidence-weighted history
  //   instead of a random sample of semantically-similar diary excerpts.
  //
  //   Trigger conditions (both must be true):
  //     1. Message matches ENTITY_QUERY_PATTERNS ("tell me about X", "who is X"…)
  //     2. At least one character/location name appears in the message
  //
  //   Fallback: if entity detection or DB queries fail, or if the entity has
  //   fewer than 2 events on record, falls through to generic retrieval.
  //
  // Generic path (unchanged — context-aware or MemoryRetriever):
  //   Thread context → retrieveMemoriesByThread
  //   Timeline context → retrieveMemoriesUnderNode
  //   Default → MemoryRetriever (semantic vector search)

  let relatedEntries: ResolvedMemoryEntry[] = [];
  let entityArcNarrativeBlock: string | null = null; // injected into system prompt later
  let knowledgeGapBlock: string | null = null; // explicit unknowns for this message

  try {
    const { retrieveMemoriesByThread, retrieveMemoriesUnderNode } = await import('../chat/contextAwareMemoryRetrieval');
    const { MemoryRetriever } = await import('../chat/memoryRetriever');
    const retrievalPath = chooseRetrievalPath({
      hasWorkingMemory: Boolean(workingMemory && workingMemory.budget.selected > 0),
      contextKind: currentContext?.kind,
      entityQuery: Boolean(focus) || isEntityQuery(message),
    });
    retrievalPaths.push(retrievalPath);

    if (retrievalPath === 'working_memory_only') {
      // WMA already supplied ranked, deduplicated evidence and sources. Do not
      // issue a second generic/entity-scoped retrieval pass for the same turn.
    } else if (retrievalPath === 'thread_scoped_fallback' && currentContext?.kind === 'thread' && currentContext.threadId) {
      // Thread-scoped entries + cross-thread entity mentions run in parallel.
      // Cross-thread path uses related_entries on legacy entity rows to surface what the user
      // said about the same people in completely different conversations.
      const [threadEntries, crossThreadEntries] = await Promise.all([
        retrieveMemoriesByThread(userId, currentContext.threadId, 20),
        (await import('../chat/contextAwareMemoryRetrieval')).retrieveEntityMentionsAcrossThreads(
          userId, message, allCharacters, 10
        ),
      ]);
      const seen = new Set(threadEntries.map((e: any) => e.id));
      relatedEntries = [
        ...threadEntries,
        ...crossThreadEntries.filter((e: any) => !seen.has(e.id)),
      ] as ResolvedMemoryEntry[];

    } else if (retrievalPath === 'timeline_scoped_fallback' && currentContext?.kind === 'timeline' && currentContext.timelineNodeId && currentContext.timelineLayer) {
      relatedEntries = (await retrieveMemoriesUnderNode(userId, currentContext.timelineNodeId, currentContext.timelineLayer, 30)) as ResolvedMemoryEntry[];

    } else if (retrievalPath === 'entity_arc_fallback') {
      // Entity-scoped retrieval path
      const mentionedEntities = focus && (focus.type === 'character' || focus.type === 'location')
        ? [{ id: focus.id, type: focus.type, name: focus.name, matchScore: 1 } as const]
        : detectMentionedEntities(message, allCharacters, allLocations);
      let arcLoadedForPrimary = false;

      if (mentionedEntities.length > 0) {
        // Try the highest-confidence match first
        const primary = mentionedEntities[0];
        try {
          const arc = await loadEntityArc(userId, primary);
          if (arc) {
            relatedEntries = arcToMemoryEntries(arc) as unknown as ResolvedMemoryEntry[];
            entityArcNarrativeBlock = arc.narrativeBlock;
            arcLoadedForPrimary = true;
            logger.debug(
              { userId, entityId: primary.id, entityName: primary.name, events: arc.events.length },
              '[EntityScopedRetriever] Loaded entity arc — bypassing generic retrieval'
            );
            // This name has a real record now — close any pending gap for it
            import('./knowledgeGapsService')
              .then(({ knowledgeGapsService }) => knowledgeGapsService.markFilled(userId, [primary.name]))
              .catch(() => undefined);
          }
        } catch (arcErr) {
          logger.warn({ arcErr, userId, entity: primary.name }, '[EntityScopedRetriever] Arc load failed');
        }
      }

      // Explicit unknowns: names that match nothing, or matched entities whose
      // record is just a name. Becomes a KNOWLEDGE GAPS prompt block so the
      // model says "we haven't talked about X yet" instead of guessing.
      try {
        const { detectKnowledgeGaps, formatKnowledgeGapBlock } = await import('./knowledgeGapDetector');
        const primary = mentionedEntities[0];
        const gaps = detectKnowledgeGaps({
          message,
          characters: allCharacters,
          locations: allLocations,
          matchedEntities: mentionedEntities,
          arcLoadedForPrimary,
          primaryHasAttributes: primary ? (characterAttributesMap.get(primary.id)?.length ?? 0) > 0 : false,
        });
        knowledgeGapBlock = formatKnowledgeGapBlock(gaps);
        if (gaps.length > 0) {
          logger.debug({ userId, gaps }, '[KnowledgeGapDetector] Gaps detected for message');
          // Persist for the "things Lorebook doesn't know yet" dashboard —
          // fire-and-forget, never blocks chat.
          const { knowledgeGapsService } = await import('./knowledgeGapsService');
          knowledgeGapsService.recordGaps(userId, gaps).catch(() => undefined);
        }
      } catch (gapErr) {
        logger.debug({ gapErr, userId }, '[KnowledgeGapDetector] Gap detection failed');
      }

      // Fall through to generic if entity arc is empty
      if (relatedEntries.length === 0) {
        const retriever = new MemoryRetriever();
        const ctx = await retriever.retrieve(userId, 20, message, []);
        relatedEntries = ctx.entries as ResolvedMemoryEntry[];
      }

    } else {
      // Generic semantic retrieval
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
  let sources: ChatSource[] = [
    ...workingMemorySources,
    ...retellingSources,
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

  // ── Social communities (Louvain clusters) ────────────────────────────────
  // Fetch persisted community output from the social network engine.
  // These drive the "YOUR SOCIAL CIRCLES" system prompt block so the LLM can
  // answer questions like "who are my gym people?" by cluster, not enumeration.
  let socialCommunities: any[] = [];
  try {
    const { data: commData } = await supabaseAdmin
      .from('social_communities')
      .select('id, theme, members, cohesion, size')
      .eq('user_id', userId)
      .order('size', { ascending: false })
      .limit(8);
    socialCommunities = (commData as any[]) ?? [];
  } catch (e) { logger.debug({ e }, 'RAGBuilder: social communities fetch failed'); }

  // ── Episodic events (resolved_events, structured) ───────────────────────
  // These are the most semantically clean temporal units: structured events with
  // start_time/end_time, people[] UUIDs, and confidence scores. Previously orphaned.
  let episodicEvents: any[] = [];
  try {
    const { data: evData } = await supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, type, start_time, end_time, confidence, people, locations, activities, metadata')
      .eq('user_id', userId)
      .gte('confidence', 0.35)
      .order('start_time', { ascending: false })
      .limit(40);
    episodicEvents = (evData as any[]) ?? [];
  } catch (e) { logger.debug({ e }, 'RAGBuilder: episodic events fetch failed'); }

  // ── Recent interpretations (reconsolidation layer) ───────────────────────
  let recentInterpretations: any[] = [];
  try {
    const { interpretationService } = await import('../interpretationService');
    recentInterpretations = await interpretationService.getRecentInterpretations(userId, 5);
  } catch (e) { logger.debug({ e }, 'RAGBuilder: interpretations fetch failed'); }

  // ── Stable life arcs (stability_score >= 0.5) ────────────────────────────
  let stableArcs: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('life_arcs')
      .select('id, title, arc_type, start_date, end_date, summary, confidence, stability_score, is_active')
      .eq('user_id', userId)
      .gte('stability_score', 0.5)
      .order('stability_score', { ascending: false })
      .limit(8);
    stableArcs = (data as any[]) ?? [];
  } catch (e) { logger.debug({ e }, 'RAGBuilder: stable arcs fetch failed'); }

  // ── Crystallized knowledge (confidence >= 0.70, ACTIVE only) ────────────
  // Fetched here so the system prompt builder receives pre-ranked claims.
  // loadPromptClaims applies the 6-claim cap and per-type limits internally.
  // Failure is non-fatal — the WHAT LOREBOOK KNOWS block is simply omitted.
  let crystallizedKnowledge: Array<{ id?: string; knowledge_type: string; human_readable_claim: string; confidence: number; last_reinforced_at?: string | null }> = [];
  try {
    crystallizedKnowledge = await loadPromptClaims(userId);
  } catch (e) { logger.debug({ e }, 'RAGBuilder: crystallized knowledge fetch failed'); }

  // Crystallized claims are first-class sources: retrieval prefers durable
  // knowledge over re-deriving the same truth from many observations.
  sources.push(
    ...crystallizedKnowledge.map((k, i) => ({
      type: 'knowledge' as const,
      id: k.id ?? `claim-${i}`,
      title: k.human_readable_claim.slice(0, 80),
      snippet: k.human_readable_claim,
      date: k.last_reinforced_at ?? undefined,
    })),
  );

  // ── Cognitive plan: how to think about this question (pure, no I/O) ──────
  // Strategy is chosen BEFORE evidence: retrieval becomes a consequence of
  // planning. The directive reaches the prompt; the plan tightens the
  // evidence contract for inspect-style strategies below.
  const { planCognition, formatCognitivePlanBlock } = await import('../cognitivePlanner/cognitivePlanner');
  const { classifyIntentForAudit } = await import('./workingMemoryAssembler');
  const cognitivePlan = planCognition(message, { wmaIntent: classifyIntentForAudit(message) });
  const cognitivePlanBlock = formatCognitivePlanBlock(cognitivePlan);
  let epistemicBlock: string | null = null;

  // ── Active Narrative Threads (what is unfolding, not what happened) ──────
  // Derived fresh from life_arcs + recent moments/scenes; failure is non-fatal.
  let activeThreadsBlock: string | null = null;
  try {
    const { buildThreadsPromptBlock } = await import('../narrativeThreads/narrativeThreadService');
    activeThreadsBlock = await buildThreadsPromptBlock(userId);
  } catch (e) { logger.debug({ e }, 'RAGBuilder: narrative threads fetch failed'); }

  // ── Continuity That Feels Alive (0–3 structured candidates) ──────────────
  // Selective autobiographical continuity with explainable relevance + modes.
  // Does not replace Working Memory; adds composition guidance for the LLM.
  let continuityAliveBlock: string | null = null;
  let continuityAliveTrace: unknown = null;
  try {
    const { selectContinuityForUser, CONTINUITY_COMPOSITION_RULES } = await import(
      '../continuityAlive'
    );
    const claimMemories = crystallizedKnowledge.map((k, i) => ({
      memoryId: `claim-${i}`,
      memoryType: 'claim' as const,
      summary: k.human_readable_claim,
      confidence: k.confidence,
      epistemicType: 'direct_statement',
      correctionState: 'active' as const,
      tags: [k.knowledge_type],
      source: 'crystallized_knowledge',
    }));
    const selection = await selectContinuityForUser({
      userId,
      message,
      extraMemories: claimMemories,
    });
    continuityAliveTrace = selection.trace;
    if (selection.promptBlock) {
      continuityAliveBlock = `${CONTINUITY_COMPOSITION_RULES}\n\n${selection.promptBlock}`;
    } else if (selection.selected.length === 0) {
      // Explicit none — helps the model avoid forcing callbacks on definitional Qs
      continuityAliveBlock = `${CONTINUITY_COMPOSITION_RULES}\n\nCONTINUITY MODE: none\nNo continuity candidate selected for this message. Answer directly.`;
    }
  } catch (e) {
    logger.debug({ e }, 'RAGBuilder: continuityAlive selection failed');
  }

  // ── Relationship context — per-request, NOT cached ────────────────────────
  let romanticContext: RelationshipContinuitySummary[] = [];
  try {
    const activeRels = romanticRelationships.filter((r: any) => r.is_current);
    if (activeRels.length > 0) {
      romanticContext = await buildRelationshipContext(activeRels, userId);
    }
  } catch (e) { logger.debug({ e }, 'RAGBuilder: relationship context build failed'); }

  // ── Entity dossier fallback ───────────────────────────────────────────────
  // Only runs when WMA found no usable evidence (or Living Memory is disabled).
  // Normal turns now have one retrieval pass instead of WMA + dossier + arc.
  let entityDossierBlock: string | null = null;
  if (!workingMemory || workingMemory.budget.selected === 0) {
    try {
      const { buildEntityDossierBlock } = await import('./entityDossierService');
      entityDossierBlock = await buildEntityDossierBlock(
        userId, message, allCharacters, allLocations,
        workingMemory?.factsCoveredEntityIds ?? [],
      );
      if (entityDossierBlock) retrievalPaths.push('entity_dossier_fallback');
    } catch (e) { logger.debug({ e }, 'RAGBuilder: entity dossier build failed'); }
  }

  let lifeArcSynthesisBlock = '';
  let lifeArcSynthesis: Awaited<ReturnType<typeof import('../continuityRuntime/arcs/lifeArcSynthesisService').synthesizeLifeArcs>> | null = null;
  let storyContextBlock = '';
  let storyContext: Awaited<ReturnType<typeof import('../storyContextService').buildStoryContext>> | null = null;
  try {
    const intent = workingMemory?.intent;
    const { isStoryIntent, buildStoryContext } = await import('../storyContextService');
    if (intent && isStoryIntent(intent)) {
      storyContext = await buildStoryContext(userId, intent);
      storyContextBlock = storyContext.text;
      lifeArcSynthesisBlock = storyContextBlock;
      lifeArcSynthesis = storyContext.synthesis;
    }
  } catch (e) { logger.debug({ e }, 'RAGBuilder: story context assembly failed'); }

  let confirmedSkills: Array<{ id: string; name: string; category: string; skill_key: string }> = [];
  try {
    const { skillIndexService } = await import('../skills/skillIndexService');
    confirmedSkills = (await skillIndexService.listForContext(userId, 20)).map((s) => ({
      ...s,
      skill_key: s.name.toLowerCase().replace(/\s+/g, ' ').trim(),
    }));
  } catch (e) {
    logger.debug({ e }, 'RAGBuilder: skills index fetch failed');
  }

  // Scope every downstream evidence surface once. This filtered list feeds
  // the prompt, visible source chips, citations, suggested actions, and
  // response metadata, preventing the UI from leaking broad retrieval noise.
  let rejectedEvidence: Array<{
    type?: string;
    id?: string;
    title?: string;
    relevanceScore: number;
    relevanceReasons: string[];
  }> = [];
  if (scopePlan) {
    const { filterSourcesForPresentation } = await import('../responseScope');
    sources = filterSourcesForPresentation(sources, scopePlan, workingMemory);

    // Evidence contract: every surviving source must justify why it belongs.
    // Scores travel with the source so the UI can show them; sub-floor
    // sources never reach the model.
    const { buildEvidenceContract, enforceEvidenceContract } = await import('../responseScope');
    // Closed-scope queries need the active-story roster so their entities
    // count as evidence hits even when the message doesn't re-type every
    // name. Cheap cached-snapshot read — only fetched when actually needed.
    let closedScopeRosterNames: string[] | undefined;
    if (scopePlan?.closedScope && currentContext?.threadId) {
      try {
        const { threadRosterService } = await import('../conversationCentered/threadRosterService');
        const { cast } = await threadRosterService.getChatRosterContext(userId, currentContext.threadId);
        closedScopeRosterNames = cast.map((c) => c.name);
      } catch (e) {
        logger.debug({ e }, 'RAGBuilder: closed-scope roster fetch failed');
      }
    }
    const contract = buildEvidenceContract(message, scopePlan, closedScopeRosterNames);
    // Inspect-style strategies answer from structured state (threads,
    // knowledge). The allowlist is hard: broad observation results never
    // ride along, regardless of how well they scored.
    if (!cognitivePlan.allowObservationSearch) {
      contract.minScore = Math.max(contract.minScore, 45);
      contract.maxSources = Math.min(contract.maxSources, 12);
      sources = sources.filter(
        (source) => source.type !== 'entry' && source.type !== 'hqi' && source.type !== 'fabric',
      );
    }
    const verdict = enforceEvidenceContract(sources, contract);
    rejectedEvidence = verdict.rejected.map((source) => ({
      type: source.type,
      id: source.id,
      title: source.title,
      relevanceScore: source.relevanceScore,
      relevanceReasons: source.relevanceReasons,
    }));
    if (verdict.rejected.length > 0) {
      logger.info(
        {
          userId,
          topic: contract.topic,
          accepted: verdict.accepted.length,
          rejected: verdict.rejected.length,
          rejectedSample: verdict.rejected.slice(0, 5).map((s) => ({
            title: s.title,
            score: s.relevanceScore,
            reasons: s.relevanceReasons,
          })),
        },
        'Evidence contract: sources rejected before prompt',
      );
    }
    sources = verdict.accepted;

    // Epistemic calibration: what level of claim does the assembled evidence
    // justify? Computed from the accepted sources, not from vibes.
    try {
      const { assessEpistemicState, formatEpistemicBlock } = await import(
        '../cognitivePlanner/epistemicCalibration'
      );
      const assessment = assessEpistemicState({
        strategy: cognitivePlan.strategy,
        sources: verdict.accepted,
        claims: crystallizedKnowledge.map((k) => ({ confidence: k.confidence })),
        threadsAvailable: Boolean(activeThreadsBlock),
      });
      epistemicBlock = formatEpistemicBlock(assessment);
    } catch (e) { logger.debug({ e }, 'RAGBuilder: epistemic calibration failed'); }

    if (scopePlan.intent === 'work' && scopePlan.responseMode !== 'audit' && scopePlan.responseMode !== 'debug_inspector') {
      const allowedCharacterIds = new Set(
        sources.filter((source) => source.type === 'character').map((source) => source.id),
      );
      const allowedTimelineIds = new Set(
        sources.filter((source) => source.type === 'entry').map((source) => source.id),
      );
      allCharacters = allCharacters.filter((character: any) => allowedCharacterIds.has(character.id));
      characterAttributesMap = new Map(
        [...characterAttributesMap.entries()].filter(([characterId]) => allowedCharacterIds.has(characterId)),
      );
      characterMemoriesMap = Object.fromEntries(
        Object.entries(characterMemoriesMap).filter(([characterId]) => allowedCharacterIds.has(characterId)),
      );
      allLocations = [];
      allChapters = [];
      romanticRelationships = [];
      romanticContext = [];
      timelineHierarchy = { eras: [], sagas: [], arcs: [] };
      orchestratorSummary = {
        ...orchestratorSummary,
        timeline: {
          ...(orchestratorSummary.timeline ?? {}),
          events: (orchestratorSummary.timeline?.events ?? []).filter((event: any) =>
            allowedTimelineIds.has(event.id),
          ),
          arcs: [],
        },
        characters: (orchestratorSummary.characters ?? []).filter((entry: any) =>
          allowedCharacterIds.has(entry.character?.id),
        ),
      };
    }
  }

  const packet = {
    orchestratorSummary, hqiResults, relatedEntries, fabricNeighbors,
    extractedDates, sources,
    allCharacters, allLocations, allChapters, timelineHierarchy, allPeoplePlaces,
    characterAttributesMap: Object.fromEntries(characterAttributesMap),
    characterMemoriesMap,
    romanticRelationships,
    selfRomanticIdentity: (() => {
      const selfChar = (allCharacters as Array<{ metadata?: Record<string, unknown> | null }> | undefined)?.find((row) => {
        const meta = row.metadata ?? {};
        return meta.is_self === true || meta.is_user === true;
      });
      if (!selfChar?.metadata) return null;
      const lines = formatSelfRomanticIdentityLines(selfChar.metadata);
      return lines.length ? { lines } : null;
    })(),
    romanticContext, corrections, deprecatedUnits,
    workoutEvents, recentBiometrics, topInterests,
    recentInterpretations, stableArcs, episodicEvents, socialCommunities,
    crystallizedKnowledge,
    continuityAliveBlock,
    activeThreadsBlock,
    cognitivePlan,
    cognitivePlanBlock,
    epistemicBlock,
    continuityAliveTrace,
    // Entity dossier: verified facts + recurring moments for mentioned entities
    entityDossierBlock,
    // Phase 2: entity arc narrative block (null when generic retrieval was used)
    entityArcNarrativeBlock,
    // Explicit unknowns detected for this message (null when none)
    knowledgeGapBlock,
    // Sprint G: foundation recall data
    foundationRecallBlock,
    retellingRecallBlock,
    foundationRelationships,
    foundationTimeline,
    workingMemory,
    workingMemoryPacket,
    retrievalTrace: {
      paths: retrievalPaths,
      focus: focus
        ? {
            id: focus.id,
            name: focus.name,
            type: focus.type,
            resolution: 'authoritative_navigation_focus',
          }
        : null,
      promptSections: [
        foundationRecallBlock ? 'working_memory' : null,
        retellingRecallBlock ? 'retelling_recall' : null,
        entityDossierBlock ? 'entity_dossier' : null,
        entityArcNarrativeBlock ? 'entity_arc' : null,
      ].filter(Boolean),
      queryCount: workingMemory?.timing?.queryCount ?? 0,
      rejectedEvidence,
    },
    lifeArcSynthesisBlock,
    lifeArcSynthesis,
    storyContextBlock,
    storyContext,
    confirmedSkills,
  };

  logger.info({
    userId,
    paths: retrievalPaths,
    promptSections: packet.retrievalTrace.promptSections,
    queryCount: packet.retrievalTrace.queryCount,
  }, 'RAGBuilder: retrieval trace');

  if (!retellingRecall) ragPacketCacheService.cachePacket(userId, message, packet, cacheContextKey);
  return packet;
}

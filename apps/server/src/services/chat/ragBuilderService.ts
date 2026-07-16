import { logger } from '../../logger';
import type { ResolvedMemoryEntry } from '../../types';
import type { CurrentContext } from '../../types/currentContext';

import { loadPromptClaims } from '../knowledgeCrystallization';
import {
  resolveRelationshipNames,
  buildRelationshipContext,
  type RelationshipContinuitySummary,
} from './relationshipContextBuilder';
import { chapterService } from '../chapterService';
import { hqiService } from '../hqiService';
import { locationService } from '../locationService';
import { memoryGraphService } from '../memoryGraphService';
import { orchestratorService } from '../orchestratorService';
import { buildLegacyPeoplePlacesView } from './foundationEntityIndex';
import { ragPacketCacheService } from '../ragPacketCacheService';
import { supabaseAdmin } from '../supabaseClient';
import type { ChatSource } from '../omegaChatService';
import {
  isEntityQuery,
  detectMentionedEntities,
  loadEntityArc,
  arcToMemoryEntries,
} from './entityScopedRetriever';
import { assembleWorkingMemory, buildWorkingMemoryPacket } from './workingMemoryAssembler';

// ─── Fitness keyword gate ────────────────────────────────────────────────────
const FITNESS_RE = /\b(workout|exercise|gym|ran|run|lifted|bench|squat|deadlift|calories|weight|lbs|kg|miles|steps|cardio|biometric|body fat|muscle)\b/i;

// Every `characters` column EXCEPT the 1536-dim `embedding` vector (~6KB/row).
// The RAG packet never reads the embedding (semantic match runs in the DB via the
// HNSW index), so pulling it on this per-message, all-rows scan is pure egress
// waste. Keep this in sync with the characters table if columns are added.
const CHARACTER_COLS =
  'id, user_id, name, alias, pronouns, archetype, role, status, first_appearance, ' +
  'summary, tags, metadata, created_at, updated_at, embedding_model, embedding_version, ' +
  'last_embedded_at, perception_count, first_perception_at, last_perception_at, ' +
  'sensitivity_level, requires_extra_confirmation, first_name, last_name, is_nickname, ' +
  'avatar_url, importance_level, importance_score, proximity_level, has_met, ' +
  'relationship_depth, associated_with_character_ids, mentioned_by_character_ids, ' +
  'context_of_mention, likelihood_to_meet';

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
        .from('characters').select(CHARACTER_COLS).eq('user_id', userId).order('created_at', { ascending: false });
      allCharacters = (data as any[]) || [];
    } catch (e) { logger.debug({ e }, 'RAGBuilder: characters fetch failed'); }

    // Locations, chapters, timeline hierarchy, people/places — parallel
    try {
      const [locResult, chapResult, erasResult, sagasResult, arcsResult, orgsResult] = await Promise.all([
        locationService.listLocations(userId).catch((): any[] => []),
        chapterService.listChapters(userId).catch((): any[] => []),
        supabaseAdmin.from('eras').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('sagas').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('arcs').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabaseAdmin.from('organizations').select('id, name, aliases').eq('user_id', userId),
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
        .from('romantic_relationships').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(20);
      const raw = (data as any[]) || [];
      romanticRelationships = await resolveRelationshipNames(raw);
    } catch (e) { logger.debug({ e }, 'RAGBuilder: romantic relationships fetch failed'); }

    // Corrections + deprecated units
    try {
      const [corrResult, deprResult] = await Promise.all([
        supabaseAdmin.from('correction_records').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabaseAdmin.from('extracted_units').select('*').eq('user_id', userId).or('metadata->>deprecated.eq.true,superseded_at.not.is.null').order('created_at', { ascending: false }).limit(30),
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

    if (currentContext?.kind === 'thread' && currentContext.threadId) {
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

    } else if (currentContext?.kind === 'timeline' && currentContext.timelineNodeId && currentContext.timelineLayer) {
      relatedEntries = (await retrieveMemoriesUnderNode(userId, currentContext.timelineNodeId, currentContext.timelineLayer, 30)) as ResolvedMemoryEntry[];

    } else if (isEntityQuery(message)) {
      // Entity-scoped retrieval path
      const mentionedEntities = detectMentionedEntities(message, allCharacters, allLocations);
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
  let crystallizedKnowledge: Array<{ knowledge_type: string; human_readable_claim: string; confidence: number }> = [];
  try {
    crystallizedKnowledge = await loadPromptClaims(userId);
  } catch (e) { logger.debug({ e }, 'RAGBuilder: crystallized knowledge fetch failed'); }

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

  // ── Entity dossier — verified facts + recurring moments for entities the
  //    user just mentioned. Grounding layer for accurate recall.
  let entityDossierBlock: string | null = null;
  try {
    const { buildEntityDossierBlock } = await import('./entityDossierService');
    entityDossierBlock = await buildEntityDossierBlock(userId, message, allCharacters, allLocations);
  } catch (e) { logger.debug({ e }, 'RAGBuilder: entity dossier build failed'); }

  // ── Relationship context — per-request, NOT cached ────────────────────────
  let romanticContext: RelationshipContinuitySummary[] = [];
  try {
    const activeRels = romanticRelationships.filter((r: any) => r.is_current);
    if (activeRels.length > 0) {
      romanticContext = await buildRelationshipContext(activeRels, userId);
    }
  } catch (e) { logger.debug({ e }, 'RAGBuilder: relationship context build failed'); }

  // ── Working Memory — single authoritative retrieval packet ───────────────
  // This replaces the duplicate routeRecallQuery() pass that used to run here.
  // Upstream recall gates still exist for explicit diagnostic/short-circuit
  // modes, but normal LLM context now gets one bounded memory packet.
  let foundationRecallBlock = '';
  let foundationRelationships: any[] = [];
  let foundationTimeline: any[] = [];
  let workingMemory: Awaited<ReturnType<typeof assembleWorkingMemory>> | null = null;
  let workingMemoryPacket: ReturnType<typeof buildWorkingMemoryPacket> | null = null;

  try {
    workingMemory = await assembleWorkingMemory({
      userId,
      question: message,
      threadId: (currentContext as { threadId?: string } | undefined)?.threadId,
    });
    // Response scope gate: retrieval stays broad, but evidence from domains
    // this question blocked (family in a work answer, romance in a family
    // answer, diagnostics anywhere) never reaches the LLM.
    // Prefer the caller's plan — it carries the thread's active context, so a
    // follow-up like "what about Joss?" gates by the inherited intent instead
    // of re-planning from the bare message.
    const { planResponseScope, applyScopePlanToAssembly } = await import('../responseScope');
    workingMemory = applyScopePlanToAssembly(workingMemory, scopePlan ?? planResponseScope(message));
    workingMemoryPacket = buildWorkingMemoryPacket(workingMemory);
    foundationRecallBlock = workingMemoryPacket.text;
    foundationRelationships = workingMemory.relationships;
    foundationTimeline = workingMemory.timeline;
    logger.debug({
      userId,
      intent: workingMemory.intent,
      selected: workingMemory.budget.selected,
      rejected: workingMemory.budget.rejected,
      confidence: workingMemory.confidence,
    }, 'RAGBuilder: working memory assembled');
  } catch (e) { logger.debug({ e }, 'RAGBuilder: working memory assembly failed'); }

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
  if (scopePlan) {
    const { filterSourcesForPresentation } = await import('../responseScope');
    sources = filterSourcesForPresentation(sources, scopePlan, workingMemory);

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
    romanticRelationships, romanticContext, corrections, deprecatedUnits,
    workoutEvents, recentBiometrics, topInterests,
    recentInterpretations, stableArcs, episodicEvents, socialCommunities,
    crystallizedKnowledge,
    continuityAliveBlock,
    continuityAliveTrace,
    // Entity dossier: verified facts + recurring moments for mentioned entities
    entityDossierBlock,
    // Phase 2: entity arc narrative block (null when generic retrieval was used)
    entityArcNarrativeBlock,
    // Explicit unknowns detected for this message (null when none)
    knowledgeGapBlock,
    // Sprint G: foundation recall data
    foundationRecallBlock,
    foundationRelationships,
    foundationTimeline,
    workingMemory,
    workingMemoryPacket,
    lifeArcSynthesisBlock,
    lifeArcSynthesis,
    storyContextBlock,
    storyContext,
    confirmedSkills,
  };

  ragPacketCacheService.cachePacket(userId, message, packet);
  return packet;
}

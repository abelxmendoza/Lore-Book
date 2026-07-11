// =====================================================
// CONVERSATION-CENTERED API ROUTES
// Purpose: API endpoints for conversation-first architecture
// =====================================================

import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { loreBookParseLimit } from '../middleware/apiProtection';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { generateReturnGreeting } from '../services/chat/returnGreetingService';
import { DRAFT_THREAD_TITLE } from '../utils/threadTitleUtils';
import {
  dedupeUserConversationThreads,
  findReusableEmptyDraft,
} from '../services/conversationCentered/threadDedupeService';
import { getWhatChangedSinceLastVisit, formatWhatChangedLines } from '../services/chat/whatChangedService';
import { confidenceTrackingService } from '../services/confidenceTrackingService';
import { affectionCalculator } from '../services/conversationCentered/affectionCalculator';
import { breakupDetector } from '../services/conversationCentered/breakupDetector';
import { characterTimelineBuilder } from '../services/conversationCentered/characterTimelineBuilder';
import { correctionResolutionService } from '../services/conversationCentered/correctionResolutionService';
import { entityAttributeDetector } from '../services/conversationCentered/entityAttributeDetector';
import { entityRelationshipDetector } from '../services/conversationCentered/entityRelationshipDetector';
import { entityScopeService } from '../services/conversationCentered/entityScopeService';
import { eventAssemblyService } from '../services/conversationCentered/eventAssemblyService';
import { eventCausalDetector } from '../services/conversationCentered/eventCausalDetector';
// Note: eventExtractionService intentionally not imported here.
// Fix 4 was removed: calling extractEventStructure() from event chat creates
// event_records for the current date (not the historical event's date), causing
// meaning data to become orphaned and unfindable via the date-join in the event
// detail endpoint. Fix 2 (later_interpretation writer) is the correct approach.
import { eventImpactDetector } from '../services/conversationCentered/eventImpactDetector';
import { groupNetworkBuilder } from '../services/conversationCentered/groupNetworkBuilder';
import { conversationIngestionPipeline } from '../services/conversationCentered/ingestionPipeline';
import { memoryTraceService } from '../services/conversationCentered/memoryTraceService';
import { relationshipCycleDetector } from '../services/conversationCentered/relationshipCycleDetector';
import { relationshipDriftDetector } from '../services/conversationCentered/relationshipDriftDetector';
import { relationshipTreeBuilder, type RelationshipCategory } from '../services/conversationCentered/relationshipTreeBuilder';
import { romanticRelationshipAnalytics } from '../services/conversationCentered/romanticRelationshipAnalytics';
import { enrichRomanticRelationshipsForUser } from '../services/conversationCentered/romanticRelationshipEnrichment';
import { romanticRelationshipDetector } from '../services/conversationCentered/romanticRelationshipDetector';
import { romanticConversationRescanService } from '../services/romanticConversationRescanService';
import {
  confirmPeripheral,
  dismissPeripheral,
  listPeripheralsForRelationship,
  promotePeripheralToCharacter,
} from '../services/relationshipPeripheralService';
import { skillNetworkBuilder } from '../services/conversationCentered/skillNetworkBuilder';
import { conversationService } from '../services/conversationService';
import { threadIntelligenceService } from '../services/conversationCentered/threadIntelligenceService';
import { metaControlService } from '../services/metaControlService';
import { narrativeContinuityService } from '../services/narrativeContinuityService';
import { omegaChatService } from '../services/omegaChatService';
import { selfAwarenessService } from '../services/selfAwarenessService';
import { supabaseAdmin } from '../services/supabaseClient';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const linkRomanticRelationshipSchema = z.object({
  character_id: z.string().uuid().optional(),
  character_name: z.string().min(1).max(160).optional(),
});

const romanticRelationshipPatchSchema = z.object({
  relationship_type: z.enum([
    'boyfriend', 'girlfriend', 'wife', 'husband', 'fiancé', 'fiancée',
    'lover', 'fuck_buddy', 'crush', 'obsession', 'infatuation', 'lust',
    'ex_boyfriend', 'ex_girlfriend', 'ex_wife', 'ex_husband',
    'situationship', 'dating', 'talking', 'hooking_up', 'one_night_stand',
    'complicated', 'on_break', 'friends_with_benefits', 'ex_lover', 'in_love',
  ]).optional(),
  love_status: z.enum(['in_love', 'falling_in_love', 'loved', 'love_faded', 'never_loved', 'uncertain']).nullable().optional(),
  love_declared_at: z.string().datetime().nullable().optional(),
  love_reciprocated: z.boolean().nullable().optional(),
  status: z.enum(['active', 'on_break', 'ended', 'complicated', 'paused', 'ghosted', 'blocked', 'unrequited', 'fading', 'rekindled']).optional(),
  start_date: z.string().datetime().nullable().optional(),
  end_date: z.string().datetime().nullable().optional(),
  is_current: z.boolean().optional(),
  is_situationship: z.boolean().optional(),
  exclusivity_status: z.enum(['exclusive', 'non_exclusive', 'unknown', 'complicated']).nullable().optional(),
  strengths: z.array(z.string().max(240)).optional(),
  weaknesses: z.array(z.string().max(240)).optional(),
  pros: z.array(z.string().max(240)).optional(),
  cons: z.array(z.string().max(240)).optional(),
  red_flags: z.array(z.string().max(240)).optional(),
  green_flags: z.array(z.string().max(240)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().max(500).optional(),
  reason_note: z.string().max(1000).optional(),
}).strict();

const romanticRelationshipDeleteSchema = z.object({
  reason: z.string().max(500).optional(),
  reason_note: z.string().max(1000).optional(),
}).strict();

/**
 * POST /api/conversation/ingest
 * Ingest a message through the full pipeline
 */
router.post(
  '/ingest',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      thread_id: z.string().uuid(),
      sender: z.enum(['USER', 'AI']),
      raw_text: z.string().min(1),
      conversation_history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          })
        )
        .optional(),
      event_context: z.string().uuid().optional(), // Event ID if scoped to an event
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const userId = req.user!.id;

    const result = await conversationIngestionPipeline.ingestMessage(
      userId,
      body.thread_id,
      body.sender,
      body.raw_text,
      body.conversation_history,
      body.event_context
    );

    res.json({
      success: true,
      message_id: result.messageId,
      utterance_ids: result.utteranceIds,
      unit_ids: result.unitIds,
    });
  })
);

/**
 * POST /api/conversation/assemble-events
 * Assemble events from extracted units
 */
router.post(
  '/assemble-events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const requestedWindowDays = Number(req.body?.windowDays || req.query.windowDays || 30);
    const windowDays = Number.isFinite(requestedWindowDays)
      ? Math.min(Math.max(Math.floor(requestedWindowDays), 1), 3650)
      : 30;

    const events = await eventAssemblyService.assembleEvents(userId, undefined, { windowDays });

    res.json({
      success: true,
      windowDays,
      events,
    });
  })
);

/**
 * GET /api/conversation/threads
 * Paginated conversation threads — keyset on (updated_at, id) for stable infinite scroll.
 */
const THREAD_LIST_COLUMNS = 'id, title, updated_at, metadata, thread_number';
const THREAD_LIST_COLUMNS_LEGACY = 'id, title, updated_at, metadata';

function isUndefinedColumnError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /does not exist/i.test(error?.message ?? '');
}

type ThreadListRow = {
  id: string;
  title: string | null;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  thread_number?: number | null;
};

/** Messages stored on the legacy conversation_sessions.metadata.messages blob (pre-P2 dual-write). */
function metadataMessageCount(metadata: Record<string, unknown> | null | undefined): number {
  const msgs = metadata?.messages;
  return Array.isArray(msgs) ? msgs.length : 0;
}

/** Message counts per session — chat_messages is canonical, conversation_messages covers legacy threads. */
async function loadThreadMessageCounts(userId: string, sessionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await Promise.all(
    sessionIds.map(async (id) => {
      const { count } = await supabaseAdmin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', id)
        .eq('user_id', userId);
      counts.set(id, count ?? 0);
    })
  );
  const emptyIds = sessionIds.filter((id) => (counts.get(id) ?? 0) === 0);
  await Promise.all(
    emptyIds.map(async (id) => {
      const { count } = await supabaseAdmin
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', id)
        .eq('user_id', userId);
      if ((count ?? 0) > 0) counts.set(id, count ?? 0);
    })
  );
  return counts;
}

router.get(
  '/threads',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const { count: totalCount } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const buildPageQuery = (columns: string) => {
      let query = supabaseAdmin
        .from('conversation_sessions')
        .select(columns)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);

      if (cursorRaw) {
        try {
          const cursor = JSON.parse(Buffer.from(cursorRaw, 'base64url').toString('utf8')) as {
            updatedAt: string;
            id: string;
          };
          if (cursor.updatedAt && cursor.id) {
            query = query.or(
              `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
            );
          }
        } catch {
          // ignore malformed cursor — return first page
        }
      }
      return query;
    };

    // thread_number may not exist until the reference-numbers migration is applied.
    let { data: pageRows, error } = await buildPageQuery(THREAD_LIST_COLUMNS);
    if (error && isUndefinedColumnError(error)) {
      ({ data: pageRows, error } = await buildPageQuery(THREAD_LIST_COLUMNS_LEGACY));
    }
    if (error) throw error;

    const rows = (pageRows ?? []) as unknown as ThreadListRow[];
    const hasMore = rows.length > limit;
    const threads = hasMore ? rows.slice(0, limit) : rows;

    const { getLinkedSessionIds } = await import('../services/conversationCentered/threadContentService');
    const linkedIds = await getLinkedSessionIds(userId);
    const existingIds = new Set(threads.map((t) => t.id));
    const missingLinked = linkedIds.filter((id) => !existingIds.has(id));

    let extraRows: ThreadListRow[] = [];
    if (!cursorRaw && missingLinked.length > 0) {
      const selectLinked = (columns: string) =>
        supabaseAdmin
          .from('conversation_sessions')
          .select(columns)
          .eq('user_id', userId)
          .in('id', missingLinked.slice(0, 30));
      let { data: linkedThreads, error: linkedError }: { data: unknown; error: { code?: string; message?: string } | null } =
        await selectLinked(THREAD_LIST_COLUMNS);
      if (linkedError && isUndefinedColumnError(linkedError)) {
        ({ data: linkedThreads } = await selectLinked(THREAD_LIST_COLUMNS_LEGACY));
      }
      extraRows = ((linkedThreads as ThreadListRow[] | null) ?? []);
    }

    const merged = [...threads, ...extraRows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    // Message counts let the client distinguish real conversations from empty drafts
    // without hydrating messages — a thread with messages must never be dedupe-dropped.
    const messageCounts = await loadThreadMessageCounts(userId, merged.map((t) => t.id));

    const last = merged[merged.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(JSON.stringify({ updatedAt: last.updated_at, id: last.id }), 'utf8').toString('base64url')
        : null;

    res.json({
      success: true,
      total: totalCount ?? merged.length,
      hasMore,
      nextCursor,
      threads: merged.map((t) => ({
        id: t.id,
        title: t.title ?? DRAFT_THREAD_TITLE,
        subtitle: (t.metadata as Record<string, unknown>)?.subtitle as string | undefined,
        updatedAt: t.updated_at,
        metadata: t.metadata ?? {},
        message_count: messageCounts.get(t.id) || metadataMessageCount(t.metadata),
        thread_number: t.thread_number ?? null,
      })),
    });
  })
);

/**
 * POST /api/conversation/threads/backfill-entity-links
 * Recover orphaned sessions and link characters to their origin conversations.
 */
router.post(
  '/threads/backfill-entity-links',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      characterId: z.string().uuid().optional(),
      characterName: z.string().min(1).max(200).optional(),
    });
    const body = schema.parse(req.body ?? {});
    const { backfillEntityConversationLinksForUser } = await import(
      '../services/conversationCentered/entityConversationBackfillService'
    );
    const result = await backfillEntityConversationLinksForUser(userId, {
      characterId: body.characterId,
      characterName: body.characterName,
    });
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/conversation/threads/recover-orphans
 * Recreate conversation_sessions rows for chat_messages whose session was accidentally deleted.
 */
router.post(
  '/threads/recover-orphans',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { recoverOrphanedChatSessions } = await import('../services/conversationCentered/threadContentService');
    const recovered = await recoverOrphanedChatSessions(userId);
    res.json({ success: true, recovered });
  })
);

/**
 * DELETE /api/conversation/threads/empty
 * Purge stale threads that were created but never had any messages saved.
 * Safe to call on every boot — only deletes threads older than 1 hour with no messages.
 */
router.delete(
  '/threads/empty',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago

    // Find thread IDs where metadata has no messages and the thread is old enough.
    const { data: candidates, error: fetchErr } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, metadata, updated_at')
      .eq('user_id', userId)
      .lt('updated_at', cutoff);

    if (fetchErr) {
      res.json({ success: true, deleted: 0 });
      return;
    }

    const metadataEmpty = (candidates ?? []).filter((t) => {
      const msgs = (t.metadata as Record<string, unknown> | null)?.messages;
      return !msgs || (Array.isArray(msgs) && msgs.length === 0);
    });

    const emptyIds: string[] = [];
    const { isThreadProtected } = await import('../services/conversationCentered/threadContentService');
    for (const t of metadataEmpty) {
      const protectedThread = await isThreadProtected(userId, t.id);
      if (protectedThread) continue;

      const { count } = await supabaseAdmin
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', t.id);
      const { count: chatCount } = await supabaseAdmin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', t.id)
        .eq('user_id', userId);
      if ((!count || count === 0) && (!chatCount || chatCount === 0)) emptyIds.push(t.id);
    }

    if (emptyIds.length === 0) {
      res.json({ success: true, deleted: 0 });
      return;
    }

    await supabaseAdmin
      .from('conversation_messages')
      .delete()
      .eq('user_id', userId)
      .in('session_id', emptyIds);

    await supabaseAdmin
      .from('conversation_sessions')
      .delete()
      .eq('user_id', userId)
      .in('id', emptyIds);

    res.json({ success: true, deleted: emptyIds.length });
  })
);

/**
 * POST /api/conversation/suggestion-rescan
 * Re-run lexical intelligence + entity detection across chat/journal for suggestion domains.
 */
router.post(
  '/suggestion-rescan',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      domains: z
        .array(
          z.enum(['characters', 'quests', 'skills', 'projects', 'locations', 'romantic'])
        )
        .min(1)
        .max(6),
      incremental: z.boolean().optional(),
      cardCleanup: z.boolean().optional(),
      fullRescan: z.boolean().optional(),
    });
    const body = schema.parse(req.body);
    const { conversationSuggestionRescanService } = await import(
      '../services/conversationSuggestionRescanService'
    );
    const summary = await conversationSuggestionRescanService.rescan(userId, body.domains, {
      incremental: body.fullRescan ? false : body.incremental,
      cardCleanup: body.cardCleanup,
    });
    res.json({ success: true, summary });
  })
);

/**
 * POST /api/conversation/lorebook-parse
 * Read-only LoreBook parse for live composer — maps lexical spans to book operations.
 */
router.post(
  '/lorebook-parse',
  loreBookParseLimit,
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      text: z.string().min(1).max(50_000),
      threadId: z.string().uuid().optional(),
      messageId: z.string().uuid().optional(),
    });
    const body = schema.parse(req.body);

    const { parseLoreBookTextForUser } = await import('../services/lorebook/parser/loreBookParseEngine');
    const result = await parseLoreBookTextForUser(userId, body.text, {
      threadId: body.threadId,
      messageId: body.messageId,
    });

    res.json({
      operations: result.operations,
      redirects: result.redirects,
      suppressed: result.suppressed,
      warnings: result.warnings,
      lexicalSpanCount: result.lexicalSpans.length,
    });
  })
);

/**
 * POST /api/conversation/suggestion-reclassify
 * User redirects a suggestion to a different LoreBook category (training signal).
 */
router.post(
  '/suggestion-reclassify',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      name: z.string().trim().min(1).max(200),
      from_domain: z.enum(['characters', 'locations', 'skills', 'projects', 'quests', 'organizations', 'groups']),
      to_domain: z.enum(['characters', 'locations', 'skills', 'projects', 'quests', 'organizations', 'groups']),
      suggestion_id: z.string().uuid().optional(),
      context: z.string().max(2000).optional(),
      evidence: z.string().max(2000).optional(),
      description: z.string().max(2000).optional(),
      quest_type: z.string().optional(),
      skill_category: z.string().optional(),
      project_type: z.string().optional(),
      location_type: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const { suggestionReclassifyService } = await import('../services/suggestionReclassifyService');
    const result = await suggestionReclassifyService.reclassify(userId, {
      name: body.name,
      fromDomain: body.from_domain,
      toDomain: body.to_domain,
      suggestionId: body.suggestion_id,
      context: body.context,
      evidence: body.evidence,
      description: body.description,
      questType: body.quest_type,
      skillCategory: body.skill_category,
      projectType: body.project_type,
      locationType: body.location_type,
    });
    res.json(result);
  })
);

/**
 * POST /api/conversation/lexical-rescan
 * Scan all chat + journal text for keyword groups via lexical intelligence.
 */
router.post(
  '/lexical-rescan',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      keywords: z.array(z.string().min(1).max(120)).min(1).max(30),
      promote: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    });
    const body = schema.parse(req.body);
    const { keywordLexicalRescanService } = await import(
      '../services/conversationCentered/keywordLexicalRescanService'
    );
    const summary = await keywordLexicalRescanService.rescan(userId, body.keywords, {
      promote: body.promote,
      limit: body.limit,
    });
    res.json({ success: true, summary });
  })
);

/**
 * GET /api/conversation/threads/explore
 * Knowledge-aware search across chat threads (titles, entities, messages, claims).
 */
router.get(
  '/threads/explore',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      q: z.string().optional(),
      entity: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      since: z.string().optional(),
    });
    const query = schema.parse(req.query);
    const { threadExplorerService } = await import('../services/conversationCentered/threadExplorerService');
    const result = await threadExplorerService.explore(userId, query);
    res.json({ success: true, ...result });
  })
);

/**
 * GET /api/conversation/threads/facets
 * Entity/subtitle/keyword facets for quick thread navigation.
 */
router.get(
  '/threads/facets',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { threadExplorerService } = await import('../services/conversationCentered/threadExplorerService');
    const facets = await threadExplorerService.getFacets(userId);
    res.json({ success: true, facets });
  })
);

/**
 * DELETE /api/conversation/threads/dedupe
 * Remove duplicate threads (identical conversations, extra empty drafts) and disambiguate duplicate titles.
 */
router.delete(
  '/threads/dedupe',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const result = await dedupeUserConversationThreads(userId);
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/conversation/threads
 * Create a new conversation session — reuses an empty draft when possible.
 */
router.post(
  '/threads',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      id: z.string().uuid().optional(),
      title: z.string().optional(),
    });
    const { id, title } = schema.parse(req.body);

    if (!id) {
      const reused = await findReusableEmptyDraft(userId);
      if (reused) {
        res.json({ success: true, id: reused, reused: true });
        return;
      }
    }

    const sessionId = id ?? randomUUID();
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.id) {
      res.json({ success: true, id: sessionId, existing: true });
      return;
    }

    const { error } = await supabaseAdmin.from('conversation_sessions').insert({
      id: sessionId,
      user_id: userId,
      title: title ?? DRAFT_THREAD_TITLE,
      started_at: now,
      created_at: now,
      updated_at: now,
      metadata: {},
    });

    if (error) throw error;
    res.json({ success: true, id: sessionId });
  })
);

/**
 * POST /api/conversation/threads/:id/end
 * End a conversation session and queue it for memory extraction
 */
router.post(
  '/threads/:id/end',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { summary } = req.body as { summary?: string };

    const session = await conversationService.endSession(id, userId, summary, true);
    res.json({ success: true, session });
  })
);

/**
 * GET /api/conversation/threads/:id/context
 * Rich index for a thread: messages, entities, knowledge, extracted units.
 */
router.get(
  '/threads/:id/context',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { threadExplorerService } = await import('../services/conversationCentered/threadExplorerService');
    const context = await threadExplorerService.getThreadContext(userId, id);
    if (!context) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, context });
  })
);

/**
 * POST /api/conversation/threads/:id/ensure-visible
 * Recover orphaned sessions without bumping updated_at (opening a thread must not reorder it).
 */
router.post(
  '/threads/:id/ensure-visible',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { recoverOrphanSession, loadThreadMessages } = await import(
      '../services/conversationCentered/threadContentService'
    );

    await recoverOrphanSession(userId, id);

    let { data: thread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, updated_at, metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!thread) {
      const messages = await loadThreadMessages(userId, id);
      if (messages.length === 0) {
        return res.status(404).json({ success: false, error: 'Thread not found' });
      }
      await recoverOrphanSession(userId, id);
      const { data: recovered } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id, title, updated_at, metadata')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      thread = recovered;
    }

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const messages = await loadThreadMessages(userId, id);

    // Backfill thread intelligence + summaries for threads that missed ingestion.
    void threadIntelligenceService.syncFromStoredMessages(userId, id).catch(() => {});

    res.json({
      success: true,
      thread: {
        id: thread.id,
        title: thread.title ?? DRAFT_THREAD_TITLE,
        subtitle: (thread.metadata as Record<string, unknown>)?.subtitle as string | undefined,
        updatedAt: thread.updated_at,
        metadata: thread.metadata ?? {},
        messageCount: messages.length,
      },
    });
  })
);

/**
 * GET /api/conversation/threads/:id/status
 * Whether a thread has recoverable content or is protected from auto-deletion.
 */
router.get(
  '/threads/:id/status',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { getThreadStatus } = await import('../services/conversationCentered/threadContentService');
    const status = await getThreadStatus(userId, id);
    res.json({ success: true, status });
  })
);

/**
 * GET /api/conversation/threads/:id/summary
 * Living thread summary + continuity card for recall UI.
 */
router.get(
  '/threads/:id/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const { data: thread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const meta = await threadIntelligenceService.syncFromStoredMessages(userId, id);
    const { card } = await threadIntelligenceService.getContinuity(userId, id);
    const recallText = meta.summary_long || meta.summary_medium || meta.summary_short || card;

    res.json({
      success: true,
      summary: {
        short: meta.summary_short,
        medium: meta.summary_medium,
        long: meta.summary_long,
        version: meta.summary_version,
        messageCount: meta.message_count,
        people: meta.people,
        places: meta.places,
        themes: meta.themes,
      },
      continuity: card,
      recallText,
    });
  })
);

/**
 * POST /api/conversation/threads/:id/summary/refresh
 * Force-regenerate thread summaries from stored messages.
 */
router.post(
  '/threads/:id/summary/refresh',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const { data: thread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const { threadSummaryService } = await import('../services/conversationCentered/threadSummaryService');
    const refreshed = await threadSummaryService.refresh(userId, id);
    const meta = await threadIntelligenceService.getThreadMeta(userId, id);
    const { card } = await threadIntelligenceService.getContinuity(userId, id);
    const recallText = refreshed.long || refreshed.medium || refreshed.short || card;

    res.json({
      success: true,
      summary: {
        short: refreshed.short,
        medium: refreshed.medium,
        long: refreshed.long,
        version: refreshed.version,
        messageCount: meta.message_count,
        people: meta.people,
        places: meta.places,
        themes: meta.themes,
      },
      continuity: card,
      recallText,
    });
  })
);

/**
 * GET /api/conversation/threads/:id/messages
 * Get all messages in a thread
 */
router.get(
  '/threads/:id/messages',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const { recoverOrphanSession, loadThreadMessages } = await import(
      '../services/conversationCentered/threadContentService'
    );

    const selectThreadRow = async (): Promise<ThreadListRow | null> => {
      const withRefs = await supabaseAdmin
        .from('conversation_sessions')
        .select(THREAD_LIST_COLUMNS)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!withRefs.error) return withRefs.data as unknown as ThreadListRow | null;
      const legacy = await supabaseAdmin
        .from('conversation_sessions')
        .select(THREAD_LIST_COLUMNS_LEGACY)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      return legacy.data as unknown as ThreadListRow | null;
    };

    let thread = await selectThreadRow();

    if (!thread) {
      const recovered = await recoverOrphanSession(userId, id);
      if (recovered) {
        thread = await selectThreadRow();
      }
    }

    if (!thread) {
      const messages = await loadThreadMessages(userId, id);
      if (messages.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.status(404).json({ error: 'Thread not found', recoverable: true });
    }

    const messages = await loadThreadMessages(userId, id);

    void threadIntelligenceService.syncFromStoredMessages(userId, id).catch(() => {});

    const threadNumber = thread.thread_number ?? null;
    if (messages.length > 0) {
      res.json({
        success: true,
        thread_number: threadNumber,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          metadata: m.metadata ?? null,
          turn_number: m.turn_number ?? null,
          reply_seq: m.reply_seq ?? null,
          // Human-referencable id: thread.turn for prompts, thread.turn.reply for responses.
          ref:
            threadNumber != null && m.turn_number != null
              ? m.reply_seq
                ? `${threadNumber}.${m.turn_number}.${m.reply_seq}`
                : `${threadNumber}.${m.turn_number}`
              : null,
        })),
      });
      return;
    }

    res.json({ success: true, thread_number: threadNumber, messages: [] });
  })
);

/**
 * GET /api/conversation/threads/:id/roster
 * The thread's cast — derived from durable mention metadata with provenance
 * refs, user overrides applied. Never LLM-generated.
 */
router.get(
  '/threads/:id/roster',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { threadRosterService } = await import('../services/conversationCentered/threadRosterService');
    const roster = await threadRosterService.getRoster(req.user!.id, req.params.id as string);
    if (!roster) return res.status(404).json({ error: 'Thread not found' });
    res.json({ success: true, ...roster });
  })
);

/**
 * PATCH /api/conversation/threads/:id/roster
 * User override for one roster entry: role, exclude/include, pin.
 */
router.patch(
  '/threads/:id/roster',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      key: z.string().min(1).max(300),
      role: z.enum(['main', 'supporting', 'mentioned']).optional(),
      status: z.enum(['active', 'excluded']).optional(),
      pinned: z.boolean().optional(),
    }).refine((b) => b.role !== undefined || b.status !== undefined || b.pinned !== undefined, {
      message: 'At least one of role/status/pinned is required',
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { key, ...override } = parsed.data;
    const { threadRosterService } = await import('../services/conversationCentered/threadRosterService');
    const roster = await threadRosterService.setOverride(req.user!.id, req.params.id as string, key, override);
    if (!roster) return res.status(404).json({ error: 'Thread not found' });
    res.json({ success: true, ...roster });
  })
);

/**
 * GET /api/conversation/threads/:id/units
 * Get all extracted units from a thread
 */
router.get(
  '/threads/:id/units',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    // Get all messages in thread
    const { data: messages } = await supabaseAdmin
      .from('conversation_messages')
      .select('id')
      .eq('session_id', id)
      .eq('user_id', userId);

    if (!messages || messages.length === 0) {
      return res.json({
        success: true,
        units: [],
      });
    }

    const messageIds = messages.map(m => m.id);

    // Get all utterances for these messages
    const { data: utterances } = await supabaseAdmin
      .from('utterances')
      .select('id')
      .in('message_id', messageIds)
      .eq('user_id', userId);

    if (!utterances || utterances.length === 0) {
      return res.json({
        success: true,
        units: [],
      });
    }

    const utteranceIds = utterances.map(u => u.id);

    // Get all extracted units
    const { data: units, error } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .in('utterance_id', utteranceIds)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      units: units || [],
    });
  })
);

/**
 * POST /api/conversation/resolve-contradiction
 * Manually resolve a contradiction between two units
 */
router.post(
  '/resolve-contradiction',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      unit1_id: z.string().uuid(),
      unit2_id: z.string().uuid(),
      resolution: z.enum(['NEW_WINS', 'OLD_WINS', 'BOTH_DEPRECATED', 'NEEDS_REVIEW']),
      reason: z.string().optional(),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    // Verify both units belong to user
    const { data: units } = await supabaseAdmin
      .from('extracted_units')
      .select('id, user_id')
      .in('id', [body.unit1_id, body.unit2_id])
      .eq('user_id', userId);

    if (!units || units.length !== 2) {
      return res.status(404).json({ error: 'One or both units not found' });
    }

    const result = await correctionResolutionService.resolveContradiction(
      userId,
      body.unit1_id,
      body.unit2_id,
      body.resolution,
      body.reason
    );

    res.json({
      success: true,
      resolution: result,
    });
  })
);

/**
 * POST /api/conversation/correct-unit
 * Explicitly mark a unit as correcting another unit
 */
router.post(
  '/correct-unit',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      correction_unit_id: z.string().uuid(),
      corrected_unit_id: z.string().uuid(),
      correction_type: z.enum(['EXPLICIT', 'IMPLICIT', 'CONTRADICTION']).optional(),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    // Verify both units belong to user
    const { data: units } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .in('id', [body.correction_unit_id, body.corrected_unit_id])
      .eq('user_id', userId);

    if (!units || units.length !== 2) {
      return res.status(404).json({ error: 'One or both units not found' });
    }

    const correctionUnit = units.find(u => u.id === body.correction_unit_id);
    const correctedUnit = units.find(u => u.id === body.corrected_unit_id);

    if (!correctionUnit || !correctedUnit) {
      return res.status(404).json({ error: 'Units not found' });
    }

    await correctionResolutionService.processCorrection(
      userId,
      correctionUnit,
      [body.corrected_unit_id],
      body.correction_type || 'EXPLICIT'
    );

    res.json({
      success: true,
      message: 'Correction processed successfully',
    });
  })
);

/**
 * POST /api/conversation/prune-deprecated
 * Prune deprecated units older than specified days
 */
router.post(
  '/prune-deprecated',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      older_than_days: z.number().int().min(1).max(365).optional().default(30),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    const prunedCount = await correctionResolutionService.pruneDeprecatedUnits(
      userId,
      body.older_than_days
    );

    res.json({
      success: true,
      pruned_count: prunedCount,
      message: `Pruned ${prunedCount} deprecated units`,
    });
  })
);

/**
 * GET /api/conversation/contradictions
 * Get all contradictions that need review
 */
router.get(
  '/contradictions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Get units marked for review
    const { data: reviewUnits, error: reviewError } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>needs_review', 'true')
      .order('created_at', { ascending: false });

    if (reviewError) {
      throw reviewError;
    }

    // Get deprecated units with contradictions
    const { data: deprecatedUnits, error: depError } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>deprecated', 'true')
      .not('metadata->>deprecation_reason', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (depError) {
      throw depError;
    }

    res.json({
      success: true,
      needs_review: reviewUnits || [],
      deprecated: deprecatedUnits || [],
    });
  })
);

function isTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? '';
  if (code === 'PGRST205') return true;
  if (/schema cache|could not find the table/i.test(message)) return true;
  return false;
}

/**
 * Resolve a list of entity IDs to human-readable names.
 * Checks omega_entities (primary_name) first, then people_places (name).
 * IDs that are already names (no UUID format) are passed through as-is.
 * Returns the same array length with unresolvable IDs replaced by empty string and filtered out.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveEntityNamesToDisplay(ids: string[], userId: string): Promise<string[]> {
  if (!ids || ids.length === 0) return [];

  const uuids = ids.filter(id => UUID_RE.test(id));
  const alreadyNames = ids.filter(id => !UUID_RE.test(id));

  if (uuids.length === 0) return alreadyNames;

  const nameMap = new Map<string, string>();

  // Query all three tables in parallel — each is typed with `as any` since not all are in the generated schema
  const db = supabaseAdmin as any;
  const [omegaResult, ppResult, charResult] = await Promise.allSettled([
    db.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', uuids),
    db.from('people_places').select('id, name').eq('user_id', userId).in('id', uuids),
    db.from('characters').select('id, name').eq('user_id', userId).in('id', uuids),
  ]);

  if (omegaResult.status === 'fulfilled') {
    for (const row of ((omegaResult.value?.data as Array<{ id: string; primary_name: string }>) ?? [])) {
      if (row.primary_name) nameMap.set(row.id, row.primary_name);
    }
  }
  if (ppResult.status === 'fulfilled') {
    for (const row of ((ppResult.value?.data as Array<{ id: string; name: string }>) ?? [])) {
      if (!nameMap.has(row.id) && row.name) nameMap.set(row.id, row.name);
    }
  }
  if (charResult.status === 'fulfilled') {
    for (const row of ((charResult.value?.data as Array<{ id: string; name: string }>) ?? [])) {
      if (!nameMap.has(row.id) && row.name) nameMap.set(row.id, row.name);
    }
  }

  // Rebuild: resolved UUIDs + passthrough names, drop unresolvable UUIDs
  const resolvedUuids = uuids.map(id => nameMap.get(id)).filter((n): n is string => !!n);
  return [...alreadyNames, ...resolvedUuids];
}

/**
 * GET /api/conversation/events
 * Get all events for user, sorted by time
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Get all events, then filter by overrides
    const { data: events, error } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (error) {
      if (isTableMissingError(error)) {
        logger.warn({ userId }, 'resolved_events table missing, returning empty list');
        return res.json({ success: true, events: [] });
      }
      throw error;
    }

    // Filter out archived and not-important events
    const filteredEvents = [];
    for (const event of events || []) {
      const isArchived = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'ARCHIVE'
      );
      if (isArchived) continue;

      const isNotImportant = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'NOT_IMPORTANT'
      );
      if (isNotImportant) continue;

      filteredEvents.push(event);
    }

    if (error) {
      throw error;
    }

    // Get source unit counts and impacts for each event
    const eventsWithCounts = await Promise.all(
      filteredEvents.map(async event => {
        const { count } = await supabaseAdmin
          .from('event_unit_links')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id);

        // Get impacts for this event
        const impacts = await eventImpactDetector.getEventImpacts(userId, event.id);
        const primaryImpact = impacts[0]; // Get the primary impact

        // Get connection character name if exists
        let connectionCharacterName: string | undefined;
        if (primaryImpact?.connectionCharacterId) {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', primaryImpact.connectionCharacterId)
            .single();
          connectionCharacterName = character?.name;
        }

        const ev = event as any;
        const resolvedPeople = await resolveEntityNamesToDisplay(ev.people ?? [], userId);
        const resolvedLocations = await resolveEntityNamesToDisplay(ev.locations ?? [], userId);

        return {
          ...ev,
          people: resolvedPeople,
          locations: resolvedLocations,
          source_count: count || 0,
          impact: primaryImpact
            ? {
                type: primaryImpact.impactType,
                connectionCharacter: connectionCharacterName,
                connectionType: primaryImpact.connectionType,
                emotionalImpact: primaryImpact.emotionalImpact,
                impactIntensity: primaryImpact.impactIntensity,
                impactDescription: primaryImpact.impactDescription,
              }
            : undefined,
        };
      })
    );

    res.json({
      success: true,
      events: eventsWithCounts,
    });
  })
);

/**
 * GET /api/conversation/events/:id
 * Get a specific event with source messages, linked decisions, and insights
 */
router.get(
  '/events/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    // Get event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get linked units
    const { data: unitLinks, error: linksError } = await supabaseAdmin
      .from('event_unit_links')
      .select('unit_id')
      .eq('event_id', id);

    if (linksError) {
      throw linksError;
    }

    const unitIds = (unitLinks || []).map(link => link.unit_id);

    // Get source messages from units
    const sourceMessages: any[] = [];
    if (unitIds.length > 0) {
      // Get utterances for these units
      const { data: units } = await supabaseAdmin
        .from('extracted_units')
        .select('utterance_id')
        .in('id', unitIds);

      const utteranceIds = (units || []).map(u => u.utterance_id);

      if (utteranceIds.length > 0) {
        // Get messages for these utterances
        const { data: utterances } = await supabaseAdmin
          .from('utterances')
          .select('message_id, original_text, created_at')
          .in('id', utteranceIds);

        const messageIds = (utterances || []).map(u => u.message_id);

        if (messageIds.length > 0) {
          const { data: messages } = await supabaseAdmin
            .from('conversation_messages')
            .select('id, role, content, created_at, session_id')
            .in('id', messageIds)
            .order('created_at', { ascending: true });

          // Combine with utterance info
          sourceMessages.push(
            ...(messages || []).map(msg => {
              const utterance = utterances?.find(u => u.message_id === msg.id);
              return {
                ...msg,
                original_text: utterance?.original_text || msg.content,
                utterance_created_at: utterance?.created_at,
              };
            })
          );
        }
      }
    }

    // Get linked decisions (from memory_review_queue or decisions table if exists)
    const linkedDecisions: any[] = [];
    try {
      // Check if decisions table exists and has event links
      const { data: decisions } = await supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .contains('linked_event_ids', [id])
        .limit(10);

      if (decisions) {
        linkedDecisions.push(...decisions);
      }
    } catch (error) {
      // Decisions table might not exist, that's okay
      logger.debug({ error, eventId: id }, 'Could not fetch linked decisions');
    }

    // Get linked insights via temporal proximity.
    //
    // BRIDGE SOLUTION — the insights table does not yet have a linked_event_ids
    // column, so the natural join fails silently. Until that column is added and
    // backfilled, we surface insights created within a ±45 day window around the
    // event. This is an approximation: insights created near the event date are
    // likely related. Replace with a proper event-id join once the migration lands.
    const linkedInsights: any[] = [];
    try {
      const eventDate = new Date(event.start_time);
      const windowStart = new Date(eventDate);
      windowStart.setDate(windowStart.getDate() - 45);
      const windowEnd = new Date(eventDate);
      windowEnd.setDate(windowEnd.getDate() + 14);

      const { data: insights } = await supabaseAdmin
        .from('insights')
        .select('id, insight_type, text, confidence, tags, created_at, metadata')
        .eq('user_id', userId)
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString())
        .order('confidence', { ascending: false })
        .limit(5);

      if (insights && insights.length > 0) {
        // Entity-based relevance filter — reduces the 40-60% false positive rate
        // of pure temporal matching. An insight is considered relevant if its text
        // mentions at least one of the event's people, locations, or activities.
        // Falls back to all temporal results only when the event has no entities.
        const eventPeople: string[] = (event.people || []).map((p: string) => p.toLowerCase());
        const eventLocations: string[] = (event.locations || []).map((l: string) => l.toLowerCase());
        const eventActivities: string[] = (event.activities || []).map((a: string) => a.toLowerCase());
        const hasEntityContext = eventPeople.length > 0 || eventLocations.length > 0;

        const relevantInsights = hasEntityContext
          ? insights.filter((ins: any) => {
              const text = (ins.text || '').toLowerCase();
              return (
                eventPeople.some(p => p.length >= 3 && text.includes(p)) ||
                eventLocations.some(l => l.length >= 4 && text.includes(l)) ||
                eventActivities.some(a => a.length >= 4 && text.includes(a))
              );
            })
          : insights; // no entity context: use all temporal results

        linkedInsights.push(
          ...relevantInsights.map((ins: any) => ({
            id: ins.id,
            category: ins.insight_type || ins.tags?.[0] || 'general',
            text: ins.text,
            confidence: ins.confidence || 0.7,
            created_at: ins.created_at,
          }))
        );
      }
    } catch (error) {
      // Insights table might not exist or schema differs
      logger.debug({ error, eventId: id }, 'Could not fetch linked insights via temporal window');
    }

    // Get confidence history
    const confidenceHistory = await confidenceTrackingService.getConfidenceHistory(id, userId);

    // Get continuity links
    const continuityLinks = await narrativeContinuityService.getContinuityLinksForEvent(
      id,
      userId
    );
    const continuityNotes = continuityLinks.map(link =>
      narrativeContinuityService.generateContinuityLanguage(link)
    );

    // ── Meaning layer: 4-layer mode-router data ──────────────────────────────
    // Joined via date match since event_records has no direct FK to resolved_events.
    // Approximate but safe: most users have at most one significant event per day.
    let meaningData: {
      narratives: Array<{ account_type: string; narrative_text: string; recorded_at: string }>;
      emotions: Array<{ emotion: string; intensity: number; timestamp_offset?: number }>;
      cognitions: Array<{ cognition_type: string; content: string }>;
      identity_impacts: Array<{ impact_type: string; identity_aspect?: string }>;
    } = { narratives: [], emotions: [], cognitions: [], identity_impacts: [] };

    try {
      const eventDate = new Date(event.start_time);
      const dayStart = new Date(eventDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(eventDate);
      dayEnd.setHours(23, 59, 59, 999);

      const eventRecordsResult = await supabaseAdmin
        .from('event_records')
        .select('id')
        .eq('user_id', userId)
        .gte('event_date', dayStart.toISOString())
        .lte('event_date', dayEnd.toISOString());

      const recordIds: string[] = ((eventRecordsResult.data ?? []) as Array<{ id: string }>).map(r => r.id);

      if (recordIds.length > 0) {
        const [narrativesRes, emotionsRes, cognitionsRes, identityRes] = await Promise.all([
          supabaseAdmin
            .from('narrative_accounts')
            .select('account_type, narrative_text, recorded_at')
            .in('event_record_id', recordIds as string[])
            .order('recorded_at', { ascending: true }),
          supabaseAdmin
            .from('event_emotions')
            .select('emotion, intensity, timestamp_offset')
            .in('event_record_id', recordIds as string[])
            .order('intensity', { ascending: false }),
          supabaseAdmin
            .from('event_cognitions')
            .select('cognition_type, content')
            .in('event_record_id', recordIds as string[]),
          supabaseAdmin
            .from('event_identity_impacts')
            .select('impact_type, identity_aspect')
            .in('event_record_id', recordIds as string[]),
        ]);

        meaningData = {
          narratives: narrativesRes.data || [],
          emotions: emotionsRes.data || [],
          cognitions: cognitionsRes.data || [],
          identity_impacts: identityRes.data || [],
        };
      }
    } catch (err) {
      logger.debug({ err, eventId: id }, 'Could not fetch meaning data (optional)');
    }

    // ── Story Position: which arc and chapter does this event belong to? ────────
    // Queries life_arcs and chapters by date range. Both tables have start_date +
    // end_date (end_date may be NULL for ongoing). Returns the containing arc and
    // chapter so the frontend can display: "Part of: Robotics Genesis · Chapter: ..."
    let storyPosition: {
      arc_id?: string;
      arc_title?: string;
      arc_type?: string;
      chapter_id?: string;
      chapter_title?: string;
    } | null = null;

    try {
      const eventDateStr = event.start_time;

      const [arcResult, chapterResult] = await Promise.all([
        supabaseAdmin
          .from('life_arcs')
          .select('id, title, arc_type')
          .eq('user_id', userId)
          .lte('start_date', eventDateStr)
          .or(`end_date.is.null,end_date.gte.${eventDateStr}`)
          .order('start_date', { ascending: false })
          .limit(1),
        supabaseAdmin
          .from('chapters')
          .select('id, title')
          .eq('user_id', userId)
          .lte('start_date', eventDateStr)
          .or(`end_date.is.null,end_date.gte.${eventDateStr}`)
          .order('start_date', { ascending: false })
          .limit(1),
      ]);

      const arc = arcResult.data?.[0];
      const chapter = chapterResult.data?.[0];

      if (arc || chapter) {
        storyPosition = {
          arc_id: arc?.id,
          arc_title: arc?.title,
          arc_type: arc?.arc_type,
          chapter_id: chapter?.id,
          chapter_title: chapter?.title,
        };
      }
    } catch (err) {
      logger.debug({ err, eventId: id }, 'Could not fetch story position (optional)');
    }

    const [resolvedPeople, resolvedLocations] = await Promise.all([
      resolveEntityNamesToDisplay(event.people ?? [], userId),
      resolveEntityNamesToDisplay(event.locations ?? [], userId),
    ]);

    res.json({
      success: true,
      event: {
        ...event,
        people: resolvedPeople,
        locations: resolvedLocations,
        source_messages: sourceMessages,
        source_unit_ids: unitIds,
        linked_decisions: linkedDecisions,
        linked_insights: linkedInsights,
        confidence_history: confidenceHistory,
        continuity_notes: continuityNotes,
        meaning: meaningData,
        story_position: storyPosition,
      },
    });
  })
);

/**
 * GET /api/conversation/events/:id/causal-links
 * Get causal relationships for an event (both causes and effects)
 */
router.get(
  '/events/:id/causal-links',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.id;

    // Verify event exists and belongs to user
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get causal links
    const causalLinks = await eventCausalDetector.getEventCausalLinks(userId, eventId);

    res.json({
      success: true,
      eventId,
      causes: causalLinks.causes,
      effects: causalLinks.effects,
    });
  })
);

/**
 * GET /api/conversation/events/:id/chat-history
 * Return the persistent conversation thread for this event.
 * Messages are stored in conversation_messages under a session whose
 * metadata contains event_id — created lazily by the POST /chat endpoint.
 */
router.get(
  '/events/:id/chat-history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.id;

    // Verify the event belongs to this user
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Find the event-scoped conversation session (if any)
    const { data: session } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>event_id', eventId)
      .maybeSingle();

    if (!session) {
      return res.json({ success: true, messages: [], thread_id: null });
    }

    // Return full chronological message history
    const { data: messages, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('id, role, content, created_at')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      messages: (messages || []).map(m => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        created_at: m.created_at,
      })),
      thread_id: session.id,
    });
  })
);

/**
 * GET /api/conversation/events/:id/sources
 * Get source messages for an event (dedicated endpoint)
 */
router.get(
  '/events/:id/sources',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    // Verify event exists and belongs to user
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get linked units
    const { data: unitLinks } = await supabaseAdmin
      .from('event_unit_links')
      .select('unit_id')
      .eq('event_id', id);

    const unitIds = (unitLinks || []).map(link => link.unit_id);

    // Get source messages from units
    const sourceMessages: any[] = [];
    if (unitIds.length > 0) {
      const { data: units } = await supabaseAdmin
        .from('extracted_units')
        .select('utterance_id')
        .in('id', unitIds);

      const utteranceIds = (units || []).map(u => u.utterance_id);

      if (utteranceIds.length > 0) {
        const { data: utterances } = await supabaseAdmin
          .from('utterances')
          .select('message_id, original_text, created_at')
          .in('id', utteranceIds);

        const messageIds = (utterances || []).map(u => u.message_id);

        if (messageIds.length > 0) {
          const { data: messages } = await supabaseAdmin
            .from('conversation_messages')
            .select('id, role, content, created_at, session_id')
            .in('id', messageIds)
            .order('created_at', { ascending: true });

          sourceMessages.push(
            ...(messages || []).map(msg => {
              const utterance = utterances?.find(u => u.message_id === msg.id);
              return {
                ...msg,
                original_text: utterance?.original_text || msg.content,
                utterance_created_at: utterance?.created_at,
              };
            })
          );
        }
      }
    }

    res.json({
      success: true,
      sources: sourceMessages,
    });
  })
);

/**
 * POST /api/conversation/events/:id/chat
 * Send a message scoped to a specific event
 */
router.post(
  '/events/:id/chat',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      message: z.string().min(1),
    });

    const body = schema.parse(req.body);

    // Verify event exists and belongs to user, get full event data for context
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get source count for self-awareness
    const { count: sourceCount } = await supabaseAdmin
      .from('event_unit_links')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

    // Get or create event-scoped conversation thread
    // Use metadata to mark this as an event-scoped thread
    const { data: existingThread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>event_id', eventId)
      .single();

    let threadId: string;
    if (existingThread) {
      threadId = existingThread.id;
    } else {
      const { data: newThread, error: threadError } = await supabaseAdmin
        .from('conversation_sessions')
        .insert({
          user_id: userId,
          scope: 'PRIVATE',
          metadata: {
            event_id: eventId,
            is_event_scoped: true,
          },
        })
        .select('id')
        .single();

      if (threadError || !newThread) {
        throw threadError || new Error('Failed to create event thread');
      }

      threadId = newThread.id;
    }

    // Get conversation history for context
    const { data: recentMessages } = await supabaseAdmin
      .from('conversation_messages')
      .select('role, content')
      .eq('session_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (recentMessages || [])
      .reverse()
      .map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

    // Fire-and-forget: Ingest message with event context (async, non-blocking)
    conversationIngestionPipeline
      .ingestMessage(
        userId,
        threadId,
        'USER',
        body.message,
        conversationHistory,
        eventId // event context
      )
      .then(async () => {
        // After ingestion, reconcile the event to update it with new information
        await eventAssemblyService.reconcileEvent(eventId, userId);
      })
      .catch(err => {
        logger.warn({ error: err, eventId, userId }, 'Event-scoped ingestion failed (non-blocking)');
      });

    // Generate AI response with event context
    const userName = req.user?.fullName ?? undefined;
    const chatResponse = await omegaChatService.chat(
      userId,
      body.message,
      conversationHistory,
      undefined, // No entity context, but event context is handled via ingestion
      undefined,
      undefined,
      userName
    );

    // Apply self-awareness modifiers
    const selfAwarenessContext = {
      event: {
        confidence: event.confidence || 0.5,
        source_count: sourceCount || 0,
      },
      scope: 'EVENT' as const,
    };

    const uncertainty = selfAwarenessService.detectUncertainty(selfAwarenessContext);
    const confidence = selfAwarenessService.detectConfidence(selfAwarenessContext);
    const toneModifiers = selfAwarenessService.buildSelfAwarenessTone(uncertainty, confidence);
    const whyStatement = selfAwarenessService.buildWhyStatement(selfAwarenessContext);

    // Apply tone to response
    const enhancedResponse = selfAwarenessService.applyTone(chatResponse.response, toneModifiers);

    // Save AI response
    await supabaseAdmin.from('conversation_messages').insert({
      user_id: userId,
      session_id: threadId,
      role: 'assistant',
      content: enhancedResponse,
    });

    // ── Feed the Reflection Timeline ────────────────────────────────────────
    // Every user message in an event-scoped chat is a "later reflection" — the
    // user is revisiting this memory and articulating new understanding. Save it
    // as a narrative_accounts record (account_type = 'later_interpretation') so
    // the Meaning Tab's "Looking Back" section has data to render.
    //
    // Strategy: find the event_record for this event's date (via the approximate
    // date join used throughout this codebase). If one exists, attach the
    // reflection. If not, create a minimal event_record so the narrative can
    // be stored. Fire-and-forget — must not block the chat response.
    if (body.message.length >= 20) {
      ;(async () => {
        try {
          const eventDate = new Date(event.start_time);
          const dayStart = new Date(eventDate);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(eventDate);
          dayEnd.setHours(23, 59, 59, 999);

          // Try to find an existing event_record for this event's date
          let eventRecordId: string | null = null;
          const { data: existingRecords } = await supabaseAdmin
            .from('event_records')
            .select('id')
            .eq('user_id', userId)
            .gte('event_date', dayStart.toISOString())
            .lte('event_date', dayEnd.toISOString())
            .limit(1);

          if (existingRecords && existingRecords.length > 0) {
            eventRecordId = existingRecords[0].id;
          } else {
            // No event_record for this date yet — create a minimal one so the
            // narrative has a home. This is intentional: the event_record is the
            // anchor for the 4-layer meaning system.
            const { data: newRecord } = await supabaseAdmin
              .from('event_records')
              .insert({
                user_id: userId,
                event_date: event.start_time,
                tags: event.type ? [event.type] : [],
                participant_ids: [],
                location_ids: [],
                metadata: { created_by: 'event_chat_reflection', event_id: eventId },
              })
              .select('id')
              .single();
            eventRecordId = newRecord?.id ?? null;
          }

          if (eventRecordId) {
            // ── Phase C2: Set the explicit FK while we have both IDs in scope ─────
            // This is the highest-confidence linking opportunity: we know exactly
            // which resolved_event (eventId) the user is reflecting on, and we have
            // the event_record that will hold the narrative. Setting resolved_event_id
            // here upgrades this record from "linked by date approximation" to
            // "linked explicitly." IS NULL guard ensures we never overwrite a link
            // that was already set more explicitly (e.g., by Phase C1 assembly).
            //
            // Link_mechanism is stored in metadata for instrumentation visibility.
            const { error: linkError } = await supabaseAdmin
              .from('event_records')
              .update({ resolved_event_id: eventId })
              .eq('id', eventRecordId)
              .is('resolved_event_id', null);            // never overwrite existing links

            if (!linkError) {
              logger.debug(
                { userId, eventId, eventRecordId, mechanism: 'reflection_writer' },
                'Set resolved_event_id on event_record via Reflection Timeline writer'
              );
            }

            await supabaseAdmin.from('narrative_accounts').insert({
              user_id: userId,
              event_record_id: eventRecordId,
              account_type: 'later_interpretation',
              narrative_text: body.message,
              recorded_at: new Date().toISOString(),
              metadata: {
                source: 'event_chat',
                event_id: eventId,
                thread_id: threadId,
              },
            });

            logger.debug(
              { userId, eventId, eventRecordId },
              'Saved later_interpretation narrative from event chat'
            );
          }
        } catch (err) {
          logger.debug({ err, eventId, userId }, 'Failed to write reflection narrative (non-blocking)');
        }
      })();
    }

    res.json({
      success: true,
      response: enhancedResponse,
      meta: {
        uncertainty_level: uncertainty.level,
        confidence_level: confidence.level,
        why: whyStatement,
        confidence_humanized: selfAwarenessService.humanizeConfidence(event.confidence || 0.5),
      },
      thread_id: threadId,
      event_id: eventId,
    });
  })
);

/**
 * GET /api/conversation/trace/chat/:chatMessageId
 * Trace full lineage from a chat message
 * Shows: chat → conversation → utterance → unit → memory → event
 */
router.get(
  '/trace/chat/:chatMessageId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { chatMessageId } = req.params;
    const userId = req.user!.id;

    const trace = await memoryTraceService.traceFromChatMessage(userId, chatMessageId);

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Chat message not found or not yet processed',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/trace/memory/:artifactType/:artifactId
 * Reverse trace from a memory artifact
 * Shows: memory → unit → utterance → conversation → chat
 */
router.get(
  '/trace/memory/:artifactType/:artifactId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { artifactType, artifactId } = req.params;
    const userId = req.user!.id;

    if (!['perception_entry', 'journal_entry', 'insight'].includes(artifactType)) {
      return res.status(400).json({
        error: 'Invalid artifact type',
        message: 'Must be one of: perception_entry, journal_entry, insight',
      });
    }

    const trace = await memoryTraceService.traceFromMemoryArtifact(
      userId,
      artifactType as 'perception_entry' | 'journal_entry' | 'insight',
      artifactId
    );

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Memory artifact not found or has no trace',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/trace/unit/:unitId
 * Trace from an extracted unit
 * Shows: unit → memory artifacts + backward to utterance/conversation
 */
router.get(
  '/trace/unit/:unitId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { unitId } = req.params;
    const userId = req.user!.id;

    const trace = await memoryTraceService.traceFromExtractedUnit(userId, unitId);

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Extracted unit not found',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/relationships
 * Get all relationships for an entity
 */
router.get(
  '/entities/:entityId/relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const relationships = await entityRelationshipDetector.getEntityRelationships(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      relationships.map(async (rel) => {
        let fromName = '';
        let toName = '';

        if (rel.fromEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', rel.fromEntityId)
            .single();
          fromName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', rel.fromEntityId)
            .single();
          fromName = entity?.primary_name || '';
        }

        if (rel.toEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', rel.toEntityId)
            .single();
          toName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', rel.toEntityId)
            .single();
          toName = entity?.primary_name || '';
        }

        return {
          ...rel,
          fromEntityName: fromName,
          toEntityName: toName,
        };
      })
    );

    res.json({
      success: true,
      relationships: enriched,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/scopes
 * Get all scopes for an entity
 */
router.get(
  '/entities/:entityId/scopes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const scopes = await entityRelationshipDetector.getEntityScopes(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    res.json({
      success: true,
      scopes,
    });
  })
);

/**
 * GET /api/conversation/scopes/:scope/entities
 * Get all entities in a scope
 */
router.get(
  '/scopes/:scope/entities',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { scope } = req.params;
    const { scopeContext } = req.query;
    const userId = req.user!.id;

    const entities = await entityScopeService.getEntitiesInScope(
      userId,
      scope,
      scopeContext as string | undefined
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      entities.map(async (e) => {
        let name = '';
        if (e.type === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', e.id)
            .single();
          name = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', e.id)
            .single();
          name = entity?.primary_name || '';
        }

        return {
          ...e,
          name,
        };
      })
    );

    res.json({
      success: true,
      entities: enriched,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/relationship-chain
 * Get relationship chain for an entity (e.g., Sam → works_for → Strativ Group → recruits_for → Mach Industries)
 */
router.get(
  '/entities/:entityId/relationship-chain',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const chain = await entityScopeService.buildRelationshipChain(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      chain.map(async (link) => {
        let entityName = '';
        let nextEntityName = '';

        if (link.entityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', link.entityId)
            .single();
          entityName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', link.entityId)
            .single();
          entityName = entity?.primary_name || '';
        }

        if (link.nextEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', link.nextEntityId)
            .single();
          nextEntityName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', link.nextEntityId)
            .single();
          nextEntityName = entity?.primary_name || '';
        }

        return {
          ...link,
          entityName,
          nextEntityName,
        };
      })
    );

    res.json({
      success: true,
      chain: enriched,
    });
  })
);

/**
 * GET /api/conversation/relationship-trees/:entityId
 * Get relationship tree for a specific entity
 */
router.get(
  '/relationship-trees/:entityId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const category = (req.query.category as RelationshipCategory) || 'all';
    const depth = parseInt(req.query.depth as string) || 3;
    const entityType = (req.query.entityType as 'omega_entity' | 'character') || 'character';

    // Try to get saved tree first
    let tree = await relationshipTreeBuilder.getSavedTree(userId, entityId, entityType);

    // If no saved tree or needs rebuild, build it
    if (!tree) {
      tree = await relationshipTreeBuilder.buildTree(userId, entityId, entityType, category, depth);
      if (tree) {
        await relationshipTreeBuilder.saveTree(userId, tree);
      }
    }

    if (!tree) {
      return res.status(404).json({ error: 'Entity not found or no relationships' });
    }

    res.json({
      success: true,
      tree: {
        rootNode: tree.rootNode,
        nodes: Array.from(tree.nodes.values()),
        relationships: tree.relationships,
        memberCount: tree.memberCount,
        relationshipCount: tree.relationshipCount,
        categories: tree.categories,
      },
    });
  })
);

/**
 * POST /api/conversation/relationship-trees/:entityId/rebuild
 * Rebuild relationship tree for an entity
 */
router.post(
  '/relationship-trees/:entityId/rebuild',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const category = (req.body.category as RelationshipCategory) || 'all';
    const depth = parseInt(req.body.depth as string) || 3;
    const entityType = (req.body.entityType as 'omega_entity' | 'character') || 'character';

    const tree = await relationshipTreeBuilder.buildTree(userId, entityId, entityType, category, depth);

    if (!tree) {
      return res.status(404).json({ error: 'Entity not found or no relationships' });
    }

    await relationshipTreeBuilder.saveTree(userId, tree);

    res.json({
      success: true,
      tree: {
        rootNode: tree.rootNode,
        nodes: Array.from(tree.nodes.values()),
        relationships: tree.relationships,
        memberCount: tree.memberCount,
        relationshipCount: tree.relationshipCount,
        categories: tree.categories,
      },
    });
  })
);

/**
 * GET /api/conversation/relationship-trees
 * Get all relationship trees (list of root entities with trees)
 */
router.get(
  '/relationship-trees',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const { data: trees } = await supabaseAdmin
      .from('relationship_trees')
      .select('root_entity_id, root_entity_type, member_count, relationship_count, categories, last_updated')
      .eq('user_id', userId)
      .order('last_updated', { ascending: false });

    res.json({
      success: true,
      trees: trees || [],
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/attributes
 * Get attributes for an entity
 */
router.get(
  '/entities/:entityId/attributes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const entityType = (req.query.entityType as 'omega_entity' | 'character') || 'character';
    const currentOnly = req.query.currentOnly === 'true';

    const attributes = await entityAttributeDetector.getEntityAttributes(
      userId,
      entityId,
      entityType,
      currentOnly
    );

    res.json({
      success: true,
      attributes,
    });
  })
);

/**
 * GET /api/conversation/skill-network
 * Get skill network for user
 */
router.get(
  '/skill-network',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const rootSkillId = req.query.rootSkillId as string | undefined;
    const depth = parseInt(req.query.depth as string) || 3;

    const network = await skillNetworkBuilder.buildNetwork(userId, rootSkillId, depth);

    res.json({
      success: true,
      network: {
        rootSkill: network.rootSkill,
        skills: Array.from(network.skills.values()),
        relationships: network.relationships,
        clusters: network.clusters,
        skillCount: network.skillCount,
        relationshipCount: network.relationshipCount,
      },
    });
  })
);

/**
 * POST /api/conversation/skill-network/detect-clusters
 * Detect and create skill clusters
 */
router.post(
  '/skill-network/detect-clusters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    await skillNetworkBuilder.detectSkillClusters(userId);

    res.json({
      success: true,
      message: 'Skill clusters detected',
    });
  })
);

/**
 * GET /api/conversation/group-network
 * Get group network for user
 */
router.get(
  '/group-network',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const rootGroupId = req.query.rootGroupId as string | undefined;
    const depth = parseInt(req.query.depth as string) || 3;

    const network = await groupNetworkBuilder.buildNetwork(userId, rootGroupId, depth);

    res.json({
      success: true,
      network: {
        rootGroup: network.rootGroup,
        groups: Array.from(network.groups.values()),
        relationships: network.relationships,
        evolution: network.evolution,
        groupCount: network.groupCount,
        relationshipCount: network.relationshipCount,
      },
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships
 * Get all romantic relationships
 */
router.get(
  '/romantic-relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const status = req.query.status as string | undefined;
    const isCurrent = req.query.isCurrent === 'true';

    // Self-heal: collapse duplicates and link partners to Character Book cards
    // before reading. Deterministic, idempotent, best-effort — never block the
    // view if cleanup fails.
    try {
      const { romanticRelationshipDedupeService } = await import(
        '../services/conversationCentered/romanticRelationshipDedupeService'
      );
      await romanticRelationshipDedupeService.dedupeAndLink(userId);
    } catch (dedupeError) {
      logger.warn({ error: dedupeError, userId }, 'romantic relationship dedupe skipped');
    }

    const query = supabaseAdmin
      .from('romantic_relationships')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query.eq('status', status);
    }
    if (isCurrent) {
      query.eq('is_current', true);
    }

    const { data: relationships, error } = await query;

    if (error) {
      // PGRST205 = table not in schema (romantic_relationships not migrated); return empty
      if ((error as { code?: string }).code === 'PGRST205') {
        return res.json({ success: true, relationships: [] });
      }
      throw error;
    }

    const enriched = await enrichRomanticRelationshipsForUser(userId, relationships || []);

    res.json({
      success: true,
      relationships: enriched,
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/rescan
 * Replay chat + journal through lexical romantic intelligence.
 */
router.post(
  '/romantic-relationships/rescan',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const summary = await romanticConversationRescanService.rescan(userId);
    // Clean up + link right after a rescan so new detections never leave dupes.
    const { romanticRelationshipDedupeService } = await import(
      '../services/conversationCentered/romanticRelationshipDedupeService'
    );
    await romanticRelationshipDedupeService.dedupeAndLink(userId).catch(() => {});
    res.json({ success: true, summary });
  })
);

/**
 * POST /api/conversation/romantic-relationships/dedupe
 * Explicitly collapse duplicates and link partners to Character Book cards.
 */
router.post(
  '/romantic-relationships/dedupe',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { romanticRelationshipDedupeService } = await import(
      '../services/conversationCentered/romanticRelationshipDedupeService'
    );
    const report = await romanticRelationshipDedupeService.dedupeAndLink(userId);
    res.json({ success: true, report });
  })
);

/**
 * PATCH /api/conversation/romantic-relationships/:id
 * User/admin corrections for a romantic relationship row.
 */
router.patch(
  '/romantic-relationships/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const parsed = romanticRelationshipPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid relationship update', details: parsed.error.flatten() });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('romantic_relationships')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }

    const { metadata, reason, reason_note, ...values } = parsed.data;
    const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    const correctionMeta =
      reason || reason_note
        ? {
            last_user_correction: {
              reason,
              reason_note,
              corrected_at: new Date().toISOString(),
            },
          }
        : {};
    const updatePayload: Record<string, unknown> = {
      ...values,
      updated_at: new Date().toISOString(),
    };
    if (metadata || reason || reason_note) {
      updatePayload.metadata = {
        ...existingMeta,
        ...(metadata ?? {}),
        ...correctionMeta,
      };
    }

    if (Object.keys(values).length === 0 && !metadata && !reason && !reason_note) {
      return res.status(400).json({ success: false, error: 'No relationship updates provided' });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('romantic_relationships')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, relationship: updated });
  })
);

/**
 * DELETE /api/conversation/romantic-relationships/:id
 * Remove a wrong/irrelevant romantic relationship and keep a correction note
 * on the linked character when possible.
 */
router.delete(
  '/romantic-relationships/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const parsed = romanticRelationshipDeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid relationship delete request', details: parsed.error.flatten() });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id, person_id, person_type, metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }

    const correction = {
      relationship_id: id,
      reason: parsed.data.reason ?? 'user_deleted_relationship',
      reason_note: parsed.data.reason_note,
      deleted_at: new Date().toISOString(),
    };

    if (existing.person_type === 'character' && existing.person_id) {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('id, metadata')
        .eq('id', existing.person_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (character?.id) {
        const characterMeta = (character.metadata ?? {}) as Record<string, unknown>;
        const previousDeletes = Array.isArray(characterMeta.romantic_relationship_deletions)
          ? characterMeta.romantic_relationship_deletions
          : [];
        await supabaseAdmin
          .from('characters')
          .update({
            metadata: {
              ...characterMeta,
              romantic_relationship_deletions: [...previousDeletes.slice(-9), correction],
            },
          })
          .eq('id', character.id)
          .eq('user_id', userId);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('romantic_relationships')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    res.json({ success: true, deleted_id: id, correction });
  })
);

/**
 * POST /api/conversation/romantic-relationships/:id/link-character
 * Connect an omega-backed romantic relationship to the same character entity
 * used by Character Book, creating a minimal card when needed.
 */
router.post(
  '/romantic-relationships/:id/link-character',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const parsed = linkRomanticRelationshipSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid link request', details: parsed.error.flatten() });
    }

    const { data: relationship, error: relationshipError } = await supabaseAdmin
      .from('romantic_relationships')
      // partner_name is not a column — the display name is resolved from
      // person_id or metadata.partner_name (see enrichRomanticRelationshipsForUser).
      .select('id, person_id, person_type, metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (relationshipError || !relationship) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }

    let characterId = parsed.data.character_id;
    if (characterId) {
      const { data: existingCharacter } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('id', characterId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!existingCharacter) {
        return res.status(404).json({ success: false, error: 'Character not found' });
      }
    } else {
      const metadata = (relationship.metadata ?? {}) as Record<string, unknown>;
      const name =
        parsed.data.character_name?.trim() ||
        (typeof metadata.partner_name === 'string' ? metadata.partner_name.trim() : '') ||
        (typeof metadata.person_name === 'string' ? metadata.person_name.trim() : '');
      if (!name) {
        return res.status(400).json({ success: false, error: 'Character name is required' });
      }

      const { data: existingCharacters } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('user_id', userId)
        .ilike('name', name)
        .limit(1);

      if (existingCharacters?.[0]?.id) {
        characterId = existingCharacters[0].id as string;
      } else {
        const { data: created, error: createError } = await supabaseAdmin
          .from('characters')
          .insert({
            user_id: userId,
            name,
            archetype: 'romantic',
            role: 'Romantic relationship',
            status: 'active',
            metadata: {
              relationship_type: 'romantic',
              omega_entity_id: relationship.person_type === 'omega_entity' ? relationship.person_id : undefined,
              created_from_romantic_relationship_id: relationship.id,
              identity_review_required: true,
            },
          })
          .select('id')
          .single();

        if (createError || !created?.id) {
          throw createError ?? new Error('Failed to create character');
        }
        characterId = created.id as string;
      }
    }

    const relationshipMeta = (relationship.metadata ?? {}) as Record<string, unknown>;
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('romantic_relationships')
      .update({
        person_type: 'character',
        person_id: characterId,
        metadata: {
          ...relationshipMeta,
          linked_character_id: characterId,
          linked_from_person_type: relationship.person_type,
          linked_from_person_id: relationship.person_id,
          linked_at: new Date().toISOString(),
        },
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, relationship: updated, character_id: characterId });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/peripherals
 * Vicarious romantic connections for a relationship subject.
 */
router.get(
  '/romantic-relationships/:id/peripherals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const includeDismissed = req.query.includeDismissed === 'true';

    const peripherals = await listPeripheralsForRelationship(userId, id, includeDismissed);
    res.json({ success: true, peripherals });
  })
);

/**
 * POST /api/conversation/romantic-relationships/:id/peripherals/:peripheralId/confirm
 */
router.post(
  '/romantic-relationships/:id/peripherals/:peripheralId/confirm',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const peripheralId = req.params.peripheralId as string;
    const peripheral = await confirmPeripheral(userId, peripheralId);
    res.json({ success: true, peripheral });
  })
);

/**
 * POST /api/conversation/romantic-relationships/:id/peripherals/:peripheralId/dismiss
 */
router.post(
  '/romantic-relationships/:id/peripherals/:peripheralId/dismiss',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const peripheralId = req.params.peripheralId as string;
    const peripheral = await dismissPeripheral(userId, peripheralId);
    res.json({ success: true, peripheral });
  })
);

/**
 * POST /api/conversation/romantic-relationships/:id/peripherals/:peripheralId/promote
 * Promote peripheral to Character Book entry.
 */
router.post(
  '/romantic-relationships/:id/peripherals/:peripheralId/promote',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const peripheralId = req.params.peripheralId as string;
    const result = await promotePeripheralToCharacter(userId, peripheralId);
    res.json({ success: true, ...result });
  })
);

/**
 * GET /api/conversation/romantic-relationships/top-affections
 * Get who you like most
 */
router.get(
  '/romantic-relationships/top-affections',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 5;

    const topAffections = await affectionCalculator.getTopAffections(userId, limit);

    res.json({
      success: true,
      affections: topAffections,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/analytics
 * Get analytics for a relationship
 */
router.get(
  '/romantic-relationships/:id/analytics',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const analytics = await romanticRelationshipAnalytics.generateAnalytics(userId, id);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    res.json({
      success: true,
      analytics,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/ranking
 * Get ranking information for a relationship
 */
router.get(
  '/romantic-relationships/:id/ranking',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { romanticRelationshipRanking } = await import('../services/conversationCentered/romanticRelationshipRanking');
    const ranking = await romanticRelationshipRanking.getRanking(userId, id);

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: 'Ranking not found',
      });
    }

    res.json({
      success: true,
      rankAmongAll: ranking.rankAmongAll,
      rankAmongActive: ranking.rankAmongActive,
      totalRelationships: ranking.totalRelationships,
      totalActive: ranking.totalActive,
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/calculate-rankings
 * Calculate and update all relationship rankings
 */
router.post(
  '/romantic-relationships/calculate-rankings',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Sprint AD: deterministically re-score all relationships first, then rank
    // (scoreAllForUser also calls calculateRankings internally).
    const { romanticRelationshipScoring } = await import('../services/conversationCentered/romanticRelationshipScoring');
    const result = await romanticRelationshipScoring.scoreAllForUser(userId);

    res.json({
      success: true,
      message: 'Relationships scored and rankings calculated',
      scored: result.scored,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/dates
 * Get dates and milestones for a relationship
 */
router.get(
  '/romantic-relationships/:id/dates',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { data: dates, error } = await supabaseAdmin
      .from('romantic_dates')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('date_time', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      dates: dates || [],
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/calculate-affection
 * Recalculate affection scores
 */
router.post(
  '/romantic-relationships/calculate-affection',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const scores = await affectionCalculator.calculateAffectionScores(userId);

    res.json({
      success: true,
      scores,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/drift
 * Get relationship drift detection
 */
router.get(
  '/romantic-relationships/:id/drift',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { data: relationship } = await supabaseAdmin
      .from('romantic_relationships')
      .select('person_id, person_type')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    const drift = await relationshipDriftDetector.detectDrift(
      userId,
      id,
      relationship.person_id,
      relationship.person_type
    );

    // Get drift history
    const { data: driftHistory } = await supabaseAdmin
      .from('relationship_drift')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('detected_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      currentDrift: drift,
      driftHistory: driftHistory || [],
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/cycles
 * Get relationship cycles/loops
 */
router.get(
  '/romantic-relationships/:id/cycles',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { data: relationship } = await supabaseAdmin
      .from('romantic_relationships')
      .select('person_id, person_type')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    // Detect cycles
    const cycles = await relationshipCycleDetector.detectCycles(
      userId,
      id,
      relationship.person_id,
      relationship.person_type
    );

    // Get cycle history
    const { data: cycleHistory } = await supabaseAdmin
      .from('relationship_cycles')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('last_observed_at', { ascending: false });

    res.json({
      success: true,
      cycles,
      cycleHistory: cycleHistory || [],
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/breakup
 * Get breakup information
 */
router.get(
  '/romantic-relationships/:id/breakup',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { data: breakup } = await supabaseAdmin
      .from('relationship_breakups')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('breakup_date', { ascending: false })
      .limit(1)
      .single();

    if (!breakup) {
      return res.json({
        success: true,
        breakup: null,
      });
    }

    res.json({
      success: true,
      breakup,
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/detect-drift-all
 * Detect drift for all relationships
 */
router.post(
  '/romantic-relationships/detect-drift-all',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const detections = await relationshipDriftDetector.detectDriftForAll(userId);

    res.json({
      success: true,
      detections,
    });
  })
);

/**
 * GET /api/conversation/characters/:id/timelines
 * Get character timelines (shared experiences and lore)
 */
router.get(
  '/characters/:id/timelines',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const timelines = await characterTimelineBuilder.buildTimelines(userId, id);

    res.json({
      success: true,
      timelines,
    });
  })
);

/**
 * POST /api/conversation/characters/:id/rebuild-timelines
 * Rebuild timelines for a character
 */
router.post(
  '/characters/:id/rebuild-timelines',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    await characterTimelineBuilder.rebuildTimelinesForCharacter(userId, id);

    res.json({
      success: true,
      message: 'Timelines rebuilt',
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/:id/chat
 * Chat with relationship context - updates relationship through conversation
 */
router.post(
  '/romantic-relationships/:id/chat',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify relationship belongs to user
    const { data: relationship } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    // Chat with relationship context
    const userName = req.user?.fullName ?? undefined;
    const response = await omegaChatService.chat(
      userId,
      message,
      conversationHistory,
      {
        type: 'ROMANTIC_RELATIONSHIP',
        id: id
      },
      undefined,
      undefined,
      userName
    );

    // Extract and apply updates from conversation (fire and forget)
    // This will be created in the next phase
    try {
      const { relationshipUpdateExtractor } = await import('../services/conversationCentered/relationshipUpdateExtractor');
      relationshipUpdateExtractor
        .extractAndApplyUpdates(userId, id, message, conversationHistory, response.answer)
        .then(updated => {
          if (updated) {
            logger.debug({ userId, relationshipId: id }, 'Relationship updated from chat');
          }
        })
        .catch(err => {
          logger.debug({ err, userId, relationshipId: id }, 'Failed to extract relationship updates');
        });
    } catch (error) {
      // Service not yet created, that's okay
      logger.debug({ error }, 'Relationship update extractor not yet available');
    }

    res.json({
      answer: response.answer,
      updated: true, // Indicates updates may have been applied
      metadata: response.metadata
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/influence
 *
 * Relationship influence view — the explainability endpoint.
 * Answers: "How did this relationship shape my life?"
 *
 * Returns:
 *   - Impact score (autobiographical weight)
 *   - Life arcs spawned or influenced by this relationship
 *   - Knowledge crystallized from this relationship
 *   - Social context (partner centrality, shared communities)
 *   - Aftermath / recovery data
 *   - Cross-relationship patterns this relationship contributed to
 */
router.get(
  '/romantic-relationships/:id/influence',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id: relationshipId } = req.params;

    // Load the relationship
    const { data: rel, error: relError } = await supabaseAdmin
      .from('romantic_relationships')
      .select('*')
      .eq('id', relationshipId)
      .eq('user_id', userId)
      .single();

    if (relError || !rel) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }

    // Resolve partner name
    let partnerName = rel.partner_name ?? 'Unknown';
    if (partnerName === 'Unknown' || !partnerName) {
      if (rel.person_type === 'character') {
        const { data: char } = await supabaseAdmin
          .from('characters').select('name').eq('id', rel.person_id).single();
        partnerName = char?.name ?? 'Unknown';
      } else {
        const { data: entity } = await supabaseAdmin
          .from('omega_entities').select('primary_name').eq('id', rel.person_id).single();
        partnerName = entity?.primary_name ?? 'Unknown';
      }
    }

    // Run all data fetches in parallel
    const [
      arcRelResult,
      knowledgeResult,
      breakupResult,
      patternsResult,
      socialResult,
    ] = await Promise.all([
      // Life arcs spawned or influenced (via relationship arc in life_arcs)
      supabaseAdmin
        .from('life_arcs')
        .select('id, title, arc_type, track, start_date, end_date, emotional_arc, confidence')
        .eq('user_id', userId)
        .contains('metadata', { romantic_relationship_id: relationshipId }),

      // Knowledge crystallized from this relationship
      supabaseAdmin
        .from('knowledge_evidence_links')
        .select(`
          knowledge_id,
          evidence_weight,
          crystallized_knowledge:knowledge_id (
            id, machine_claim, human_readable_claim, knowledge_type,
            status, confidence, created_at, last_reinforced_at
          )
        `)
        .eq('user_id', userId)
        .eq('evidence_type', 'romantic_relationship')
        .eq('evidence_id', relationshipId),

      // Breakup / aftermath data
      supabaseAdmin
        .from('relationship_breakups')
        .select('breakup_type, breakup_date, closure_level, recovery_status, time_to_move_on_days, reason')
        .eq('relationship_id', relationshipId)
        .eq('user_id', userId)
        .order('breakup_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Cross-relationship patterns this relationship contributed to
      supabaseAdmin
        .from('relationship_patterns')
        .select('pattern_type, description, pattern_value, occurrence_count, confidence')
        .eq('user_id', userId)
        .contains('relationship_ids', [relationshipId]),

      // Social context (partner in social graph by name)
      partnerName !== 'Unknown'
        ? supabaseAdmin
            .from('social_graph_nodes')
            .select('centrality, communities')
            .eq('user_id', userId)
            .ilike('person', `%${partnerName}%`)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Compute autobiographical impact score
    const durationMonths = (() => {
      if (!rel.start_date) return 0;
      const start = new Date(rel.start_date);
      const end   = rel.end_date ? new Date(rel.end_date) : new Date();
      return Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
    })();

    const arcsSpawnedCount     = arcRelResult.data?.length ?? 0;
    const knowledgeClaimsCount = knowledgeResult.data?.length ?? 0;
    const closureLevel         = breakupResult.data?.closure_level ?? 0.5;
    const recoveryMonths       = (breakupResult.data?.time_to_move_on_days ?? 0) / 30;
    const socialCentrality     = (socialResult.data as any)?.centrality ?? 0;

    const autobiographicalImpact = Math.min(1.0,
      (Math.min(knowledgeClaimsCount, 5) / 5) * 0.25
      + (Math.min(arcsSpawnedCount, 5) / 5) * 0.35
      + (Math.min(durationMonths / 24, 1)) * (rel.emotional_intensity ?? 0.5) * 0.15
      + (Math.min(recoveryMonths / 18, 1)) * 0.10
      + socialCentrality * 0.05
      + (1 - closureLevel) * 0.10
    );

    const impactLabel = autobiographicalImpact >= 0.70 ? 'High'
                      : autobiographicalImpact >= 0.40 ? 'Moderate'
                      : 'Low';

    // Check if active knowledge claims from this relationship are still reinforced
    const now = Date.now();
    const activeKnowledge = (knowledgeResult.data ?? [])
      .filter((link: any) => link.crystallized_knowledge?.status === 'ACTIVE')
      .map((link: any) => {
        const ck = link.crystallized_knowledge;
        const daysSince = ck?.last_reinforced_at
          ? Math.round((now - new Date(ck.last_reinforced_at).getTime()) / 86400000)
          : null;
        return {
          ...ck,
          still_active_days_since_reinforced: daysSince,
        };
      });

    return res.json({
      success: true,
      influence: {
        relationship: {
          id:               rel.id,
          partner_name:     partnerName,
          relationship_type: rel.relationship_type,
          status:           rel.status,
          start_date:       rel.start_date,
          end_date:         rel.end_date,
          duration_months:  durationMonths,
        },
        autobiographical_impact: {
          score: Math.round(autobiographicalImpact * 100) / 100,
          label: impactLabel,
        },
        life_arcs_connected:   arcRelResult.data ?? [],
        knowledge_crystallized: knowledgeResult.data?.map((link: any) => link.crystallized_knowledge).filter(Boolean) ?? [],
        active_knowledge:      activeKnowledge,
        aftermath:             breakupResult.data ?? null,
        cross_relationship_patterns: patternsResult.data ?? [],
        social_context: {
          partner_centrality: (socialResult.data as any)?.centrality ?? null,
          shared_communities: (socialResult.data as any)?.communities ?? [],
        },
      },
    });
  })
);

/**
 * POST /api/conversation/threads/:id/title
 * Auto-generate a semantic title from the first few messages.
 * Called once by the client after the first AI response completes.
 */
router.post(
  '/threads/:id/title',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const schema = z.object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
      entities: z.array(z.string()).optional(),
      modeDecision: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const { conversationTitleService } = await import('../services/chat/conversationTitleService');
    const result = await conversationTitleService.generateTitle({
      userId,
      threadId: id,
      messages: body.messages,
      entities: body.entities,
      modeDecision: body.modeDecision,
    });

    res.json({ success: true, title: result.title, subtitle: result.subtitle, dominantEntities: result.dominantEntities });
  })
);

/**
 * PATCH /api/conversation/threads/:id/title
 * Manual rename — marks titleSource: 'user' so auto-generation is suppressed forever.
 */
router.patch(
  '/threads/:id/title',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const { title } = z.object({ title: z.string().min(1).max(120) }).parse(req.body);

    const { conversationTitleService } = await import('../services/chat/conversationTitleService');
    try {
      await conversationTitleService.renameTitle(userId, id, title);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ success: false, error: msg });
    }

    res.json({ success: true, title });
  })
);

/**
 * PATCH /api/conversation/threads/:id
 * Update a thread's title and/or stored messages
 */
router.patch(
  '/threads/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const schema = z.object({
      title: z.string().optional(),
      messages: z.array(z.any()).optional(),
      /** When true, bumps updated_at so the thread rises in the sidebar (new message activity). */
      touchActivity: z.boolean().optional(),
    });
    const body = schema.parse(req.body);

    const updatePayload: Record<string, unknown> = {};
    if (body.touchActivity) {
      updatePayload.updated_at = new Date().toISOString();
    }
    if (body.title !== undefined) updatePayload.title = body.title;
    // messages in PATCH body are ignored — chat_messages is the canonical store (P2).
    // touchActivity still bumps sidebar ordering via updated_at.

    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  })
);

/**
 * DELETE /api/conversation/threads/:id
 * Delete a conversation session and its messages
 */
router.delete(
  '/threads/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const force = req.query.force === 'true';

    const { isThreadProtected } = await import('../services/conversationCentered/threadContentService');
    const { count: linkCount } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('session_id', id);

    if (!force && ((await isThreadProtected(userId, id)) || (linkCount ?? 0) > 0)) {
      return res.status(409).json({
        success: false,
        error: 'Thread is linked to remembered entity knowledge and cannot be deleted. Pass ?force=true to override.',
        protected: true,
        linkedEntityCount: linkCount ?? 0,
      });
    }

    if (force && (linkCount ?? 0) > 0) {
      await supabaseAdmin
        .from('entity_conversation_links')
        .delete()
        .eq('user_id', userId)
        .eq('session_id', id);
    }

    await supabaseAdmin
      .from('conversation_messages')
      .delete()
      .eq('session_id', id)
      .eq('user_id', userId);

    await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('session_id', id)
      .eq('user_id', userId);

    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  })
);

/**
 * POST /api/conversation/threads/:id/fork
 * Fork a conversation thread from a specific message.
 * Creates a new thread with all messages up to (and including) the given message_id.
 * If message_id is omitted, forks the full thread.
 */
router.post(
  '/threads/:id/fork',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const schema = z.object({
      message_id: z.string().optional(),
    });
    const body = schema.parse(req.body);

    // Load source thread
    const { data: source, error: srcErr } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (srcErr || !source) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const allMessages: unknown[] = (source.metadata as any)?.messages ?? [];

    // Slice up to fork point if a message_id was provided
    let messages = allMessages;
    if (body.message_id) {
      const idx = allMessages.findIndex((m: any) => m.id === body.message_id);
      if (idx !== -1) {
        messages = allMessages.slice(0, idx + 1);
      }
    }

    const now = new Date().toISOString();
    const forkTitle = `Fork: ${(source.title as string) || 'Untitled'}`;

    const { data: newThread, error: insertErr } = await supabaseAdmin
      .from('conversation_sessions')
      .insert({
        user_id: userId,
        title: forkTitle,
        started_at: now,
        metadata: { messages, forked_from: id, forked_at: now },
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertErr || !newThread) throw insertErr ?? new Error('Fork insert failed');

    res.json({ success: true, thread: newThread });
  })
);

/**
 * GET /api/conversation/event-candidates
 * Return recurring scene patterns detected across multiple events.
 * Filters to patterns with occurrence_count >= 2 and continuity_strength >= 0.35
 * (below 0.40 are still emerging and worth showing as "forming" scenes).
 */
router.get(
  '/event-candidates',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const minStrength = parseFloat((req.query.min_strength as string) ?? '0.35');

    const { data: candidates, error } = await supabaseAdmin
      .from('event_candidates')
      .select(
        'id, canonical_title, dominant_entity_names, recurring_activities, emotional_tone, ' +
        'occurrence_count, continuity_strength, first_seen_at, last_seen_at, ' +
        'source_event_ids, timeline_candidate'
      )
      .eq('user_id', userId)
      .gte('occurrence_count', 2)
      .gte('continuity_strength', minStrength)
      .order('continuity_strength', { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json({ success: true, scenes: candidates ?? [] });
  })
);

/**
 * GET /api/conversation/event-linkage-stats
 *
 * Instrumentation endpoint for the Event Intelligence Linkage Sprint.
 * Returns real database counts showing how many event_records have been
 * explicitly linked to resolved_events via the resolved_event_id FK,
 * and how many are still relying on the date-join fallback.
 *
 * Used to:
 *   - Measure pre/post backfill impact
 *   - Monitor ongoing linking progress (assembly + reflection mechanisms)
 *   - Determine when Phase C3 (retrieval switch) is safe to deploy
 *   - Detect whether the date-join fallback is still needed at scale
 *
 * Breakdowns:
 *   - link_method_breakdown: how many records have been linked via each mechanism
 *     (backfill sets resolved_event_id directly; assembly and reflection log to
 *     debug but do not yet tag the method — future enhancement)
 *   - coverage_by_user: per-user linkage stats (helps identify users with
 *     retroactive journaling patterns who would benefit most from Phase D)
 */
router.get(
  '/event-linkage-stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // ── Overall counts ───────────────────────────────────────────────────────
    const [totalResult, linkedResult, resolvedEventsResult, recordsWithNarrativesResult] =
      await Promise.all([
        // Total event_records for this user
        supabaseAdmin
          .from('event_records')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),

        // event_records that have an explicit resolved_event_id FK
        supabaseAdmin
          .from('event_records')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('resolved_event_id', 'is', null),

        // Total resolved_events for this user (for coverage ratio)
        supabaseAdmin
          .from('resolved_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),

        // event_records that have at least one narrative_account (Meaning Tab data exists)
        supabaseAdmin
          .from('narrative_accounts')
          .select('event_record_id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

    const totalEventRecords = totalResult.count ?? 0;
    const linkedEventRecords = linkedResult.count ?? 0;
    const unlinkedEventRecords = totalEventRecords - linkedEventRecords;
    const totalResolvedEvents = resolvedEventsResult.count ?? 0;
    const recordsWithNarratives = recordsWithNarrativesResult.count ?? 0;

    // ── Narrative account breakdown by type ──────────────────────────────────
    const [atTheTimeResult, laterInterpResult] = await Promise.all([
      supabaseAdmin
        .from('narrative_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('account_type', 'at_the_time'),
      supabaseAdmin
        .from('narrative_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('account_type', 'later_interpretation'),
    ]);

    // ── Meaning layer coverage ────────────────────────────────────────────────
    const [emotionsResult, cognitionsResult, identityResult] = await Promise.all([
      supabaseAdmin
        .from('event_emotions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('event_cognitions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('event_identity_impacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    // ── Resolved events that now have at least one linked event_record ────────
    // This tells us what % of events have Meaning Tab data accessible via FK path
    const linkedResolvedEventsResult = await supabaseAdmin
      .from('event_records')
      .select('resolved_event_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('resolved_event_id', 'is', null);

    const linkagePercent = totalEventRecords > 0
      ? Math.round((linkedEventRecords / totalEventRecords) * 100 * 10) / 10
      : 0;

    const resolvedEventsCoveragePercent = totalResolvedEvents > 0
      ? Math.round((Math.min(linkedResolvedEventsResult.count ?? 0, totalResolvedEvents) / totalResolvedEvents) * 100 * 10) / 10
      : 0;

    res.json({
      success: true,
      generated_at: new Date().toISOString(),
      user_id: userId,

      // ── event_records linkage ──────────────────────────────────────────────
      event_records: {
        total: totalEventRecords,
        linked: linkedEventRecords,
        unlinked: unlinkedEventRecords,
        linkage_percent: linkagePercent,
        interpretation: linkagePercent >= 80
          ? 'Good — majority linked, date-join fallback rarely needed'
          : linkagePercent >= 40
          ? 'Moderate — Phase B backfill ran, ongoing assembly/reflection adding more'
          : linkagePercent < 10
          ? 'Low — Phase B backfill may not have run yet, or user has mostly retroactive events'
          : 'Building — linkage accumulating via assembly and reflection mechanisms',
      },

      // ── resolved_events coverage ───────────────────────────────────────────
      resolved_events: {
        total: totalResolvedEvents,
        with_linked_event_records: linkedResolvedEventsResult.count ?? 0,
        coverage_percent: resolvedEventsCoveragePercent,
        interpretation: resolvedEventsCoveragePercent >= 60
          ? 'Good — most events can serve Meaning Tab data via FK path'
          : 'Building — events added going forward will link automatically via Phase C1',
      },

      // ── Meaning layer depth ────────────────────────────────────────────────
      meaning_layer: {
        narrative_accounts: {
          at_the_time: atTheTimeResult.count ?? 0,
          later_interpretation: laterInterpResult.count ?? 0,
          total: (atTheTimeResult.count ?? 0) + (laterInterpResult.count ?? 0),
          reflection_timeline_entries: laterInterpResult.count ?? 0,
        },
        event_emotions: emotionsResult.count ?? 0,
        event_cognitions: cognitionsResult.count ?? 0,
        event_identity_impacts: identityResult.count ?? 0,
        records_with_any_meaning_data: recordsWithNarratives,
      },

      // ── Linkage mechanism analysis ─────────────────────────────────────────
      // Phase C1 (assembly) and C2 (reflection) log to debug but don't yet tag
      // the mechanism in the database. Phase D will add proper tagging.
      // For now, infer: linked records not from backfill = from application layer.
      linkage_mechanisms: {
        backfill_note: 'Run Phase B migration to see backfill-attributed links',
        assembly_note: 'Phase C1 links new event_records as events are assembled going forward',
        reflection_note: 'Phase C2 links event_records as users revisit events in chat',
        phase_d_status: 'Not yet implemented — eventContext not threaded to EventExtractionService',
      },

      // ── Next bottleneck signals ────────────────────────────────────────────
      next_bottleneck: {
        retrieval_switch_ready: linkagePercent >= 70,
        retrieval_switch_note: 'Phase C3 (switch retrieval to prefer FK) is safe when linkage_percent >= 70%',
        mode_router_note: 'If meaning_layer counts are low despite high linkage, EXPERIENCE_INGESTION thresholds may be too strict',
        check_mode_router_if: (emotionsResult.count ?? 0) < (totalEventRecords * 0.3),
      },
    });
  })
);

/**
 * GET /api/conversation/greeting/:threadId
 * Return Greeting MVP (Phase 7B.1)
 *
 * Returns a specific, grounded greeting string when the user returns
 * after a qualifying gap, or null when suppressed.
 * The gap in hours is provided by the client (who owns the thread timestamps)
 * to avoid an extra DB round-trip for updated_at.
 *
 * Query param: gapHours (float) — hours since last message in this thread.
 */
router.get(
  '/greeting/:threadId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId    = req.user!.id;
    const threadId  = req.params.threadId;
    const gapHours  = parseFloat(req.query.gapHours as string);

    if (!threadId || isNaN(gapHours)) {
      return res.status(400).json({ success: false, error: 'threadId and gapHours are required' });
    }

    // Verify thread belongs to this user before any processing
    const { data: thread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single();

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    const greeting = await generateReturnGreeting(userId, threadId, gapHours);

    logger.debug(
      { userId, threadId, gapHours: Math.round(gapHours), suppressed: greeting === null },
      'ReturnGreeting: route served'
    );

    return res.json({
      success: true,
      greeting, // string | null — client checks for null before displaying
    });
  })
);

/**
 * GET /api/conversation/what-changed
 *
 * The primary continuity-proof surface (Sprint H). Returns a factual,
 * evidence-backed diff of what LoreBook recorded since the user's last
 * visit — new memories, new characters, new timeline events, the
 * strongest current theme, and people who kept showing up.
 *
 * Query param: since (ISO timestamp) — when the user was last here.
 * The client owns this (it knows the last thread's updatedAt), same
 * pattern as /greeting/:threadId.
 */
router.get(
  '/what-changed',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const since  = req.query.since as string;

    if (!since || isNaN(new Date(since).getTime())) {
      return res.status(400).json({ success: false, error: 'since (ISO timestamp) is required' });
    }

    const summary = await getWhatChangedSinceLastVisit(userId, since);
    const lines   = formatWhatChangedLines(summary);

    logger.debug(
      { userId, since, gapDays: Math.round(summary.gapDays), hasChanges: summary.hasChanges },
      'WhatChanged: route served'
    );

    return res.json({
      success: true,
      summary,
      lines, // pre-formatted, ready to render — keeps "no speculation" enforced server-side
    });
  })
);

/**
 * DELETE /api/conversation/events/:id
 * Remove a resolved event (user-scoped) and its unit links.
 */
router.delete(
  '/events/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const { data: existing } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    await supabaseAdmin
      .from('event_unit_links')
      .delete()
      .eq('event_id', id)
      .then(undefined, (err) => logger.debug({ err, id }, 'event unit link cleanup failed'));

    const { error } = await supabaseAdmin
      .from('resolved_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, id }, 'Failed to delete resolved event');
      return res.status(500).json({ success: false, error: 'Failed to delete event' });
    }
    res.json({ success: true });
  })
);

export default router;

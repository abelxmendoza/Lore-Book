/**
 * Threads API Router
 * Recurring threads/themes, memberships, and timeline node relations.
 */

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { timelineManager } from '../services/timelineManager';
import { threadService } from '../services/threads/threadService';
import { threadMembershipService } from '../services/threads/threadMembershipService';
import { threadTimelineService } from '../services/threads/threadTimelineService';
import { nodeRelationService } from '../services/threads/nodeRelationService';
import { supabaseAdmin } from '../services/supabaseClient';
import type { ThreadCategory, ThreadNodeType } from '../types/threads';

const router = Router();

const threadCategorySet = new Set<ThreadCategory>(['career', 'relationship', 'health', 'project', 'custom']);
const threadNodeTypeSet = new Set<ThreadNodeType>(['saga', 'arc']);

const createThreadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['career', 'relationship', 'health', 'project', 'custom']).optional()
});

const updateThreadSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.enum(['career', 'relationship', 'health', 'project', 'custom']).optional()
});

const addMemberSchema = z.object({
  node_id: z.string().uuid(),
  node_type: z.enum(['saga', 'arc']),
  role: z.enum(['primary', 'secondary']).optional()
});

const removeMemberSchema = z.object({
  node_id: z.string().uuid(),
  node_type: z.enum(['saga', 'arc'])
});

const addEntrySchema = z.object({
  entry_id: z.string().uuid()
});

const createRelationSchema = z.object({
  from_node_id: z.string().uuid(),
  from_node_type: z.enum(['saga', 'arc']),
  to_node_id: z.string().uuid(),
  to_node_type: z.enum(['saga', 'arc']),
  relation_type: z.enum(['parallel_to', 'paused_by', 'displaced_by', 'influenced_by']),
  description: z.string().optional()
});

// —— Thread CRUD ——

router.post('/', requireAuth, validateRequest(createThreadSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.create(req.user!.id, req.body);
    res.status(201).json(thread);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to create thread' });
  }
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const category = typeof req.query.category === 'string' && threadCategorySet.has(req.query.category as ThreadCategory)
      ? (req.query.category as ThreadCategory)
      : undefined;
    const threads = await threadService.listByUser(req.user!.id, category ? { category } : undefined);
    res.json(threads);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to list threads' });
  }
});

// Must be before /:id so "nodes" is not consumed as id. More specific /context first.
router.get('/nodes/:nodeType/:nodeId/context', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { nodeType, nodeId } = req.params;
    if (!threadNodeTypeSet.has(nodeType as ThreadNodeType)) {
      return res.status(400).json({ error: 'nodeType must be saga or arc' });
    }
    const uid = req.user!.id;
    const [threads, rel] = await Promise.all([
      threadMembershipService.getMembershipsForNode(uid, nodeId, nodeType as ThreadNodeType),
      nodeRelationService.listByNode(uid, nodeId, nodeType as ThreadNodeType)
    ]);
    type Enriched = { direction: 'incoming' | 'outgoing'; relation_type: string; other_node: { id: string; type: string; title: string } };
    const enrich = async (list: typeof rel.incoming, direction: 'incoming' | 'outgoing'): Promise<Enriched[]> => {
      const out: Enriched[] = [];
      for (const r of list) {
        const otherId = direction === 'incoming' ? r.from_node_id : r.to_node_id;
        const otherType = direction === 'incoming' ? r.from_node_type : r.to_node_type;
        let title = '';
        try {
          const node = await timelineManager.getNode(uid, otherType, otherId);
          title = node?.title ?? '';
        } catch {
          /* ignore */
        }
        out.push({ direction, relation_type: r.relation_type, other_node: { id: otherId, type: otherType, title } });
      }
      return out;
    };
    const [incomingEnriched, outgoingEnriched] = await Promise.all([
      enrich(rel.incoming, 'incoming'),
      enrich(rel.outgoing, 'outgoing')
    ]);
    res.json({
      threads,
      relations: [...incomingEnriched, ...outgoingEnriched]
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to get node context' });
  }
});

router.get('/nodes/:nodeType/:nodeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { nodeType, nodeId } = req.params;
    if (!threadNodeTypeSet.has(nodeType as ThreadNodeType)) {
      return res.status(400).json({ error: 'nodeType must be saga or arc' });
    }
    const threads = await threadMembershipService.getThreadsForNode(req.user!.id, nodeId, nodeType as ThreadNodeType);
    res.json(threads);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to get threads for node' });
  }
});

// Node relations — must be before /:id so "node-relations" is not captured as id
router.post('/node-relations', requireAuth, validateRequest(createRelationSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const rel = await nodeRelationService.create(
      req.user!.id,
      { nodeId: req.body.from_node_id, nodeType: req.body.from_node_type },
      { nodeId: req.body.to_node_id, nodeType: req.body.to_node_type },
      req.body.relation_type,
      req.body.description
    );
    res.status(201).json(rel);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to create relation' });
  }
});

router.get('/node-relations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const nodeId = req.query.node_id as string | undefined;
    const nodeType = req.query.node_type as string | undefined;
    if (nodeId && nodeType) {
      if (!threadNodeTypeSet.has(nodeType as ThreadNodeType)) {
        return res.status(400).json({ error: 'node_type must be saga or arc' });
      }
      const { incoming, outgoing } = await nodeRelationService.listByNode(req.user!.id, nodeId, nodeType as ThreadNodeType);
      return res.json({ incoming, outgoing });
    }
    const all = await nodeRelationService.listByUser(req.user!.id);
    return res.json(all);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to list relations' });
  }
});

router.delete('/node-relations/:relationId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await nodeRelationService.delete(req.user!.id, req.params.relationId);
    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to delete relation' });
  }
});

// —— Single thread by id ——
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.getById(req.user!.id, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    res.json(thread);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to get thread' });
  }
});

router.patch('/:id', requireAuth, validateRequest(updateThreadSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.update(req.user!.id, req.params.id, req.body);
    res.json(thread);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to update thread' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await threadService.delete(req.user!.id, req.params.id);
    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to delete thread' });
  }
});

// —— Thread timeline & interruptions ——

router.get('/:id/timeline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.getById(req.user!.id, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const nodes = await threadTimelineService.getThreadTimeline(req.user!.id, req.params.id);
    res.json(nodes);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to get thread timeline' });
  }
});

router.get('/:id/interruptions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.getById(req.user!.id, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const items = await threadTimelineService.getThreadInterruptions(req.user!.id, req.params.id);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Failed to get thread interruptions' });
  }
});

// —— Members ——

router.post('/:id/members', requireAuth, validateRequest(addMemberSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.getById(req.user!.id, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const m = await threadMembershipService.addMembership(
      req.user!.id,
      req.params.id,
      req.body.node_id,
      req.body.node_type,
      req.body.role
    );
    res.status(201).json(m);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to add member' });
  }
});

router.delete('/:id/members', requireAuth, validateRequest(removeMemberSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const thread = await threadService.getById(req.user!.id, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    await threadMembershipService.removeMembership(req.user!.id, req.params.id, req.body.node_id, req.body.node_type);
    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to remove member' });
  }
});

router.delete('/:id/members/:membershipId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: threadId, membershipId } = req.params;
    const thread = await threadService.getById(req.user!.id, threadId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    await threadMembershipService.removeMembershipById(req.user!.id, membershipId, threadId);
    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to remove membership' });
  }
});

router.post('/:id/entries', requireAuth, validateRequest(addEntrySchema), async (req: AuthenticatedRequest, res) => {
  try {
    const threadId = req.params.id;
    const { entry_id } = req.body as { entry_id: string };
    const userId = req.user!.id;
    const thread = await threadService.getById(userId, threadId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const { data: entry, error: entryErr } = await supabaseAdmin
      .from('journal_entries')
      .select('id, user_id')
      .eq('id', entry_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (entryErr || !entry) return res.status(404).json({ error: 'Entry not found' });
    const { error: linkErr } = await supabaseAdmin
      .from('entry_thread_links')
      .insert({ entry_id, thread_id: threadId });
    if (linkErr) return res.status(400).json({ error: linkErr.message });
    res.status(201).json({ entry_id, thread_id: threadId });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Failed to link entry to thread' });
  }
});

export const threadsRouter = router;

// =====================================================
// ORGANIZATIONS ROUTES
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { organizationService, type OrgRelationshipType } from '../services/organizationService';
import { organizationMergeService } from '../services/organizationMergeService';
import { organizationRelationshipInferenceService } from '../services/organizationRelationshipInferenceService';
import { organizationNetworkService } from '../services/organizationNetworkService';

const router = Router();

// Legacy type column values
const ORG_TYPES = ['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'affiliation', 'family', 'martial_arts', 'other'] as const;

// G1 canonical group types
const GROUP_TYPES = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit',
  'family', 'martial_arts', 'scene', 'community', 'crew', 'collective', 'institution',
  'public_entity', 'other',
] as const;

const MEMBERSHIP_MODELS = ['strict', 'fuzzy', 'none'] as const;

const USER_RELATIONSHIPS = [
  'founder', 'leader', 'member', 'former_member', 'collaborator',
  'adjacent', 'fan', 'aware_of', 'referenced', 'alumnus',
] as const;

const ORG_STATUSES = ['active', 'inactive', 'dissolved'] as const;

const ORG_REL_TYPES = [
  'part_of', 'affiliated_with', 'rival_of', 'spawned_from',
  'collaborated_with', 'succeeded_by', 'merged_with',
] as const;

// GET /api/organizations
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const organizations = await organizationService.listOrganizations(userId);
    res.json({ success: true, organizations });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to list organizations');
    res.status(500).json({ success: false, error: 'Failed to fetch organizations' });
  }
});

// GET /api/organizations/by-character?character_id=&character_name=
// Must be registered BEFORE /:id to avoid matching "by-character" as an ID
router.get('/by-character', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = req.query.character_id ? String(req.query.character_id) : undefined;
  const characterName = req.query.character_name ? String(req.query.character_name) : undefined;

  if (!characterId && !characterName) {
    res.status(400).json({ success: false, error: 'character_id or character_name required' });
    return;
  }
  try {
    const organizations = await organizationService.getOrganizationsByCharacter(userId, characterId, characterName);
    res.json({ success: true, organizations });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get organizations by character');
    res.status(500).json({ success: false, error: 'Failed to fetch organizations' });
  }
});

// GET /api/organizations/duplicates — clusters of likely-duplicate orgs
// Must be registered BEFORE /:id to avoid matching "duplicates" as an ID
router.get('/duplicates', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const clusters = await organizationMergeService.findDuplicates(userId);
    res.json({ success: true, clusters });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to find duplicate organizations');
    res.status(500).json({ success: false, error: 'Failed to find duplicates' });
  }
});

// POST /api/organizations/merge — consolidate duplicates into a primary
router.post('/merge', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const schema = z.object({
    primary_id: z.string().min(1),
    duplicate_ids: z.array(z.string().min(1)).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const report = await organizationMergeService.merge(userId, parsed.data.primary_id, parsed.data.duplicate_ids);
    res.json({ success: true, report });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to merge organizations');
    res.status(500).json({ success: false, error: 'Failed to merge organizations' });
  }
});

// GET /api/organizations/network — G1 group hierarchy / affiliation graph
router.get('/network', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rootOrgId = typeof req.query.rootOrgId === 'string' ? req.query.rootOrgId : undefined;
  const depth = parseInt(String(req.query.depth ?? '4'), 10) || 4;
  try {
    const network = await organizationNetworkService.buildNetwork(userId, rootOrgId, depth);
    res.json({ success: true, network });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build organization network');
    res.status(500).json({ success: false, error: 'Failed to load group network' });
  }
});

// POST /api/organizations/reconcile-relationships — re-scan all groups for hierarchy links
router.post('/reconcile-relationships', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const result = await organizationRelationshipInferenceService.reconcileUserOrganizations(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to reconcile organization relationships');
    res.status(500).json({ success: false, error: 'Failed to reconcile relationships' });
  }
});

// GET /api/organizations/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  try {
    const organization = await organizationService.getOrganization(userId, organizationId);
    if (!organization) {
      res.status(404).json({ success: false, error: 'Organization not found' });
      return;
    }
    res.json({ success: true, organization });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get organization');
    res.status(500).json({ success: false, error: 'Failed to fetch organization' });
  }
});

// POST /api/organizations
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const createSchema = z.object({
    name: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    type: z.enum(ORG_TYPES).optional(),
    group_type: z.enum(GROUP_TYPES).optional(),
    membership_model: z.enum(MEMBERSHIP_MODELS).optional(),
    user_relationship: z.enum(USER_RELATIONSHIPS).optional(),
    is_public_entity: z.boolean().optional(),
    founded_year: z.number().int().optional(),
    dissolved_year: z.number().int().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    founded_date: z.string().optional(),
    status: z.enum(ORG_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const organization = await organizationService.createOrganization(userId, parsed.data);
    res.json({ success: true, organization });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create organization');
    res.status(500).json({ success: false, error: 'Failed to create organization' });
  }
});

// PATCH /api/organizations/:id
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    aliases: z.array(z.string()).optional(),
    type: z.enum(ORG_TYPES).optional(),
    group_type: z.enum(GROUP_TYPES).optional(),
    membership_model: z.enum(MEMBERSHIP_MODELS).optional(),
    user_relationship: z.enum(USER_RELATIONSHIPS).optional(),
    is_public_entity: z.boolean().optional(),
    founded_year: z.number().int().optional(),
    dissolved_year: z.number().int().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    founded_date: z.string().optional(),
    status: z.enum(ORG_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const organization = await organizationService.updateOrganization(userId, organizationId, parsed.data);
    res.json({ success: true, organization });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to update organization');
    res.status(500).json({ success: false, error: 'Failed to update organization' });
  }
});

// DELETE /api/organizations/:id
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  try {
    await organizationService.deleteOrganization(userId, organizationId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to delete organization');
    res.status(500).json({ success: false, error: 'Failed to delete organization' });
  }
});

// ── Members ──────────────────────────────────────────

// POST /api/organizations/:id/members
router.post('/:id/members', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const memberSchema = z.object({
    character_name: z.string().min(1),
    character_id: z.string().optional(),
    role: z.string().optional(),
    joined_date: z.string().optional(),
    status: z.enum(['active', 'former', 'honorary']).default('active'),
    notes: z.string().optional(),
  });
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const member = await organizationService.addMember(userId, organizationId, {
      ...parsed.data,
      status: parsed.data.status ?? 'active',
    });
    res.json({ success: true, member });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add member');
    res.status(500).json({ success: false, error: 'Failed to add member' });
  }
});

// DELETE /api/organizations/:id/members/:memberId
router.delete('/:id/members/:memberId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const memberId = String(req.params.memberId);
  try {
    await organizationService.removeMember(userId, organizationId, memberId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove member');
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// ── Conversation-derived context ──────────────────────

// GET /api/organizations/:id/derived-context
// Events & locations inferred from this group's members appearing across the
// user's chat threads / journal entries. Read-only, recomputed per request.
router.get('/:id/derived-context', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  try {
    const context = await organizationService.getDerivedContext(userId, organizationId);
    res.json({ success: true, ...context });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get derived context');
    res.status(500).json({ success: false, error: 'Failed to get derived context' });
  }
});

// ── Events ───────────────────────────────────────────

// POST /api/organizations/:id/events
router.post('/:id/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const eventSchema = z.object({
    title: z.string().min(1),
    date: z.string().min(1),
    type: z.enum(['meeting', 'game', 'social', 'work', 'other']).optional(),
    event_id: z.string().optional(),
  });
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const event = await organizationService.addEvent(userId, organizationId, parsed.data);
    res.json({ success: true, event });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add event');
    res.status(500).json({ success: false, error: 'Failed to add event' });
  }
});

// DELETE /api/organizations/:id/events/:eventId
router.delete('/:id/events/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const eventId = String(req.params.eventId);
  try {
    await organizationService.removeEvent(userId, organizationId, eventId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove event');
    res.status(500).json({ success: false, error: 'Failed to remove event' });
  }
});

// ── Stories ──────────────────────────────────────────

// POST /api/organizations/:id/stories
router.post('/:id/stories', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const storySchema = z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    date: z.string().min(1),
    memory_id: z.string().optional(),
  });
  const parsed = storySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const story = await organizationService.addStory(userId, organizationId, parsed.data);
    res.json({ success: true, story });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add story');
    res.status(500).json({ success: false, error: 'Failed to add story' });
  }
});

// DELETE /api/organizations/:id/stories/:storyId
router.delete('/:id/stories/:storyId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const storyId = String(req.params.storyId);
  try {
    await organizationService.removeStory(userId, organizationId, storyId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove story');
    res.status(500).json({ success: false, error: 'Failed to remove story' });
  }
});

// ── Locations ────────────────────────────────────────

// POST /api/organizations/:id/locations
router.post('/:id/locations', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const locationSchema = z.object({
    location_name: z.string().min(1),
    location_id: z.string().optional(),
    visit_count: z.number().int().min(1).optional(),
    last_visited: z.string().optional(),
  });
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const location = await organizationService.addLocation(userId, organizationId, parsed.data);
    res.json({ success: true, location });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add location');
    res.status(500).json({ success: false, error: 'Failed to add location' });
  }
});

// DELETE /api/organizations/:id/locations/:locationId
router.delete('/:id/locations/:locationId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  const locationId = String(req.params.locationId);
  try {
    await organizationService.removeLocation(userId, organizationId, locationId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove location');
    res.status(500).json({ success: false, error: 'Failed to remove location' });
  }
});

// ── Organization Relationships ────────────────────────────────────────

// POST /api/organizations/:id/relationships
router.post('/:id/relationships', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const fromOrgId = String(req.params.id);
  const relSchema = z.object({
    to_org_id: z.string().uuid(),
    relationship_type: z.enum(ORG_REL_TYPES),
    notes: z.string().optional(),
  });
  const parsed = relSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  try {
    const relationship = await organizationService.addRelationship(
      userId,
      fromOrgId,
      parsed.data.to_org_id,
      parsed.data.relationship_type as OrgRelationshipType,
      parsed.data.notes
    );
    res.json({ success: true, relationship });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to add organization relationship');
    res.status(500).json({ success: false, error: 'Failed to add relationship' });
  }
});

// GET /api/organizations/:id/relationships
router.get('/:id/relationships', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const orgId = String(req.params.id);
  try {
    const relationships = await organizationService.getRelationships(userId, orgId);
    res.json({ success: true, relationships });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get organization relationships');
    res.status(500).json({ success: false, error: 'Failed to get relationships' });
  }
});

// DELETE /api/organizations/:id/relationships/:relationshipId
router.delete('/:id/relationships/:relationshipId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const relationshipId = String(req.params.relationshipId);
  try {
    await organizationService.removeRelationship(userId, relationshipId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove organization relationship');
    res.status(500).json({ success: false, error: 'Failed to remove relationship' });
  }
});

// GET /api/organizations/:id/facts
// Returns entity facts for this organization extracted from conversations.
router.get('/:id/facts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const orgId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const facts = await entityFactsService.getEntityFacts(userId, orgId, 'organization');
    res.json({ success: true, facts });
  } catch (error) {
    logger.error({ error, orgId }, 'Failed to get organization facts');
    res.status(500).json({ error: 'Failed to get organization facts' });
  }
});

export default router;

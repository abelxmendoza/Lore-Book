// =====================================================
// ORGANIZATIONS ROUTES
// Purpose: API endpoints for organization management
// =====================================================

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { organizationService } from '../services/organizationService';
import { logger } from '../logger';

const router = Router();

/**
 * GET /api/organizations
 * List all organizations for the authenticated user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const organizations = await organizationService.listOrganizations(userId);
      res.json({ success: true, organizations });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list organizations');
      res.status(500).json({ success: false, error: 'Failed to fetch organizations' });
    }
  })
);

/**
 * GET /api/organizations/:id
 * Get a specific organization with all related data
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const organizationId = req.params.id;

    try {
      const organization = await organizationService.getOrganization(userId, organizationId);
      
      if (!organization) {
        return res.status(404).json({ success: false, error: 'Organization not found' });
      }

      res.json({ success: true, organization });
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get organization');
      res.status(500).json({ success: false, error: 'Failed to fetch organization' });
    }
  })
);

/**
 * POST /api/organizations
 * Create a new organization
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const createSchema = z.object({
      name: z.string().min(1),
      aliases: z.array(z.string()).optional(),
      type: z.enum(['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'affiliation', 'other']).optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      founded_date: z.string().optional(),
      status: z.enum(['active', 'inactive', 'dissolved']).optional(),
      metadata: z.record(z.any()).optional(),
    });

    try {
      const data = createSchema.parse(req.body);
      const organization = await organizationService.createOrganization(userId, data);
      res.json({ success: true, organization });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.errors });
      }
      logger.error({ error, userId }, 'Failed to create organization');
      res.status(500).json({ success: false, error: 'Failed to create organization' });
    }
  })
);

/**
 * PATCH /api/organizations/:id
 * Update an organization
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const organizationId = req.params.id;

    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      aliases: z.array(z.string()).optional(),
      type: z.enum(['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'affiliation', 'other']).optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      founded_date: z.string().optional(),
      status: z.enum(['active', 'inactive', 'dissolved']).optional(),
      metadata: z.record(z.any()).optional(),
    });

    try {
      const updates = updateSchema.parse(req.body);
      const organization = await organizationService.updateOrganization(userId, organizationId, updates);
      res.json({ success: true, organization });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.errors });
      }
      logger.error({ error, userId, organizationId }, 'Failed to update organization');
      res.status(500).json({ success: false, error: 'Failed to update organization' });
    }
  })
);

/**
 * POST /api/organizations/:id/members
 * Add a member to an organization
 */
router.post(
  '/:id/members',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const organizationId = req.params.id;

    const memberSchema = z.object({
      character_name: z.string().min(1),
      character_id: z.string().optional(),
      role: z.string().optional(),
      joined_date: z.string().optional(),
      status: z.enum(['active', 'former', 'honorary']).optional(),
      notes: z.string().optional(),
    });

    try {
      const memberData = memberSchema.parse(req.body);
      const member = await organizationService.addMember(userId, organizationId, memberData);
      res.json({ success: true, member });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.errors });
      }
      logger.error({ error, userId, organizationId }, 'Failed to add member');
      res.status(500).json({ success: false, error: 'Failed to add member' });
    }
  })
);

/**
 * DELETE /api/organizations/:id/members/:memberId
 * Remove a member from an organization
 */
router.delete(
  '/:id/members/:memberId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const organizationId = req.params.id;
    const memberId = req.params.memberId;

    try {
      await organizationService.removeMember(userId, organizationId, memberId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error, userId, organizationId, memberId }, 'Failed to remove member');
      res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
  })
);

/**
 * POST /api/organizations/:id/chat
 * Chat endpoint for organization editing
 */
router.post(
  '/:id/chat',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const organizationId = req.params.id;

    const chatSchema = z.object({
      message: z.string().min(1),
      conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })).optional(),
    });

    try {
      const { message, conversationHistory = [] } = chatSchema.parse(req.body);
      const result = await organizationService.chat(userId, organizationId, message, conversationHistory);
      res.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.errors });
      }
      logger.error({ error, userId, organizationId }, 'Failed to process chat');
      res.status(500).json({ success: false, error: 'Failed to process chat' });
    }
  })
);

export default router;


// =====================================================
// ORGANIZATIONS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import organizationsRouter from '../../src/routes/organizations';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/organizationService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/organizations', organizationsRouter);

describe('Organizations Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/organizations', () => {
    it('should list all organizations', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockOrganizations = [
        { id: 'org-1', name: 'Tech Company', type: 'company' },
        { id: 'org-2', name: 'Basketball Team', type: 'sports_team' },
      ];

      vi.mocked(organizationService.listOrganizations).mockResolvedValue(mockOrganizations as any);

      const response = await request(app)
        .get('/api/organizations')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organizations');
      expect(response.body.organizations).toHaveLength(2);
    });
  });

  describe('GET /api/organizations/:id', () => {
    it('should get a specific organization', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockOrganization = {
        id: 'org-1',
        name: 'Tech Company',
        type: 'company',
        members: [],
      };

      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any);

      const response = await request(app)
        .get('/api/organizations/org-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organization');
      expect(response.body.organization.name).toBe('Tech Company');
      expect(organizationService.getOrganization).toHaveBeenCalledWith('test-user-id', 'org-1');
    });

    it('should return 404 if organization not found', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      vi.mocked(organizationService.getOrganization).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/organizations/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/organizations', () => {
    it('should create a new organization', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockOrganization = {
        id: 'org-1',
        name: 'New Organization',
        type: 'company',
      };

      vi.mocked(organizationService.createOrganization).mockResolvedValue(mockOrganization as any);

      const response = await request(app)
        .post('/api/organizations')
        .send({
          name: 'New Organization',
          type: 'company',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organization');
      expect(organizationService.createOrganization).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'New Organization' })
      );
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/organizations')
        .send({})
        .expect(400);
    });

    it('should validate type enum', async () => {
      await request(app)
        .post('/api/organizations')
        .send({
          name: 'Test',
          type: 'invalid',
        })
        .expect(400);
    });
  });

  describe('PATCH /api/organizations/:id', () => {
    it('should update an organization', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockOrganization = {
        id: 'org-1',
        name: 'Updated Organization',
        type: 'company',
      };

      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockOrganization as any);

      const response = await request(app)
        .patch('/api/organizations/org-1')
        .send({
          name: 'Updated Organization',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organization');
      expect(organizationService.updateOrganization).toHaveBeenCalledWith(
        'test-user-id',
        'org-1',
        expect.objectContaining({ name: 'Updated Organization' })
      );
    });
  });

  describe('POST /api/organizations/:id/members', () => {
    it('should add a member to an organization', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockMember = {
        id: 'member-1',
        character_name: 'John Doe',
        role: 'Developer',
      };

      vi.mocked(organizationService.addMember).mockResolvedValue(mockMember as any);

      const response = await request(app)
        .post('/api/organizations/org-1/members')
        .send({
          character_name: 'John Doe',
          role: 'Developer',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('member');
      expect(organizationService.addMember).toHaveBeenCalledWith(
        'test-user-id',
        'org-1',
        expect.objectContaining({ character_name: 'John Doe' })
      );
    });

    it('should validate member data', async () => {
      await request(app)
        .post('/api/organizations/org-1/members')
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /api/organizations/:id/members/:memberId', () => {
    it('should remove a member from an organization', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      vi.mocked(organizationService.removeMember).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/organizations/org-1/members/member-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(organizationService.removeMember).toHaveBeenCalledWith(
        'test-user-id',
        'org-1',
        'member-1'
      );
    });
  });

  describe('POST /api/organizations/:id/chat', () => {
    it('should process chat for organization editing', async () => {
      const { organizationService } = await import('../../src/services/organizationService');
      const mockResult = {
        response: 'Updated organization',
        changes: ['name'],
      };

      vi.mocked(organizationService.chat).mockResolvedValue(mockResult as any);

      const response = await request(app)
        .post('/api/organizations/org-1/chat')
        .send({
          message: 'Change the name to Tech Corp',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('response');
      expect(organizationService.chat).toHaveBeenCalledWith(
        'test-user-id',
        'org-1',
        'Change the name to Tech Corp',
        []
      );
    });

    it('should validate message is provided', async () => {
      await request(app)
        .post('/api/organizations/org-1/chat')
        .send({})
        .expect(400);
    });
  });
});

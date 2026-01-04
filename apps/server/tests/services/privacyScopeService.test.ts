import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privacyScopeService } from '../../src/services/privacyScopeService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { continuityService } from '../../src/services/continuityService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    emitEvent: vi.fn(),
  }
}));
vi.mock('../../src/services/insightReflectionService', () => ({
  insightReflectionService: {
    getInsights: vi.fn().mockResolvedValue([]),
  }
}));
vi.mock('../../src/services/predictiveContinuityService', () => ({
  predictiveContinuityService: {
    getPredictions: vi.fn().mockResolvedValue([]),
  }
}));
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('PrivacyScopeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateScope', () => {
    it('should create scope for resource', async () => {
      const mockScope = {
        id: 'scope-1',
        scope_type: 'PRIVATE',
      };

      const mockScopedResource = {
        id: 'scoped-1',
        resource_type: 'CLAIM',
        resource_id: 'claim-1',
        scope_id: 'scope-1',
        owner_user_id: 'user-123',
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockScope, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockScopedResource, error: null })
            })
          })
        } as any);

      const scopedResource = await privacyScopeService.getOrCreateScope(
        'user-123',
        'CLAIM',
        'claim-1',
        'PRIVATE'
      );

      expect(scopedResource).toBeDefined();
      expect(scopedResource.resource_type).toBe('CLAIM');
    });
  });

  describe('canAccess', () => {
    it('should allow owner to access PRIVATE resource', async () => {
      const mockScope = {
        id: 'scope-1',
        scope_type: 'PRIVATE',
      };

      const mockScopedResource = {
        resource_type: 'CLAIM',
        resource_id: 'claim-1',
        owner_user_id: 'user-123',
        memory_scopes: mockScope,
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockScopedResource, error: null })
            })
          })
        })
      } as any);

      const access = await privacyScopeService.canAccess(
        'CLAIM',
        'claim-1',
        { user_id: 'user-123' }
      );

      expect(access.allowed).toBe(true);
      expect(access.reason).toBe('User is the owner');
    });

    it('should deny access to DELETED resource', async () => {
      const mockScope = {
        id: 'scope-1',
        scope_type: 'DELETED',
      };

      const mockScopedResource = {
        resource_type: 'CLAIM',
        resource_id: 'claim-1',
        owner_user_id: 'user-123',
        memory_scopes: mockScope,
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockScopedResource, error: null })
            })
          })
        })
      } as any);

      const access = await privacyScopeService.canAccess(
        'CLAIM',
        'claim-1',
        { user_id: 'user-123' }
      );

      expect(access.allowed).toBe(false);
      expect(access.reason).toBe('Resource has been deleted');
    });
  });

  describe('deleteResource', () => {
    it('should delete resource and propagate deletion', async () => {
      const mockScope = {
        id: 'scope-1',
        scope_type: 'PRIVATE',
      };

      const mockDeletedScope = {
        id: 'scope-deleted',
        scope_type: 'DELETED',
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDeletedScope, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: 'scoped-1' }, error: null })
                  })
                })
              })
            })
          })
        } as any);

      await privacyScopeService.deleteResource('user-123', 'CLAIM', 'claim-1');

      expect(continuityService.emitEvent).toHaveBeenCalled();
    });
  });

  describe('getChatVisibleState', () => {
    it('should return chat-visible state with scoped resources', async () => {
      const mockPrivateScope = { id: 'scope-private' };
      const mockSharedScope = { id: 'scope-shared' };

      const mockScopedResources = [
        { resource_type: 'CLAIM', resource_id: 'claim-1', scope_id: 'scope-private' },
        { resource_type: 'INSIGHT', resource_id: 'insight-1', scope_id: 'scope-shared' },
      ];

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockPrivateScope, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockSharedScope, error: null })
            })
          })
        } as any)
        .mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mockScopedResources, error: null })
              })
            })
          })
        } as any);

      const visibleState = await privacyScopeService.getChatVisibleState('user-123');

      expect(visibleState).toBeDefined();
      expect(visibleState.claims).toBeDefined();
      expect(visibleState.insights).toBeDefined();
    });
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from '../../src/middleware/auth';
import { charactersRouter } from '../../src/routes/characters';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { scoreAndPersistCharacter } from '../../src/services/characters/characterImportanceService';

vi.mock('../../src/services/peoplePlacesService', () => ({
  peoplePlacesService: {
    listCharacters: vi.fn(),
    createCharacter: vi.fn(),
  },
}));

vi.mock('../../src/services/characterAuthorityService', () => ({
  characterAuthorityService: {
    resolveByName: vi.fn().mockResolvedValue({ characterId: null, confidence: 0, method: 'none' }),
    registerCharacterAuthority: vi.fn().mockResolvedValue(undefined),
    linkSourceRecord: vi.fn().mockResolvedValue(undefined),
    registerAliasLink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/characters/characterImportanceService', () => ({
  scoreAndPersistCharacter: vi.fn().mockResolvedValue({
    importanceScore: 30,
    importanceLevel: 'minor',
    inputs: {},
  }),
  isImportancePinned: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/services/characterIdentityIndexService', () => ({
  characterIdentityIndexService: {
    rebuild: vi.fn().mockResolvedValue({ indexed: 0 }),
  },
}));

vi.mock('../../src/services/supabaseClient', () => {
  const orderResolved = vi.fn().mockResolvedValue({ data: [], error: null });
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: orderResolved,
    in: vi.fn().mockReturnValue({ order: orderResolved }),
    or: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(chain),
    },
  };
});

vi.mock('../../src/middleware/auth');
vi.mock('../../src/utils/avatar');
vi.mock('../../src/utils/cacheAvatar');

const app = express();
app.use(express.json());
app.use('/api/characters', charactersRouter);

describe('Characters API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockCharacter = {
    id: 'char-1',
    name: 'Tía Maria',
    user_id: 'user-123',
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(async (req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/characters', () => {
    it('should return characters list', async () => {
      // Mock supabase to return characters; chain must include .in() for character_memories/relationships queries
      const mockFrom = vi.mocked(supabaseAdmin.from);
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [mockCharacter],
        error: null,
      });
      const mockInOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockIn = vi.fn().mockReturnValue({ order: mockInOrder });
      const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
      const chain = {
        select: mockSelect.mockReturnValue({
          eq: mockEq.mockReturnValue({ order: mockOrder }),
          in: mockIn,
          order: mockOrder,
          or: mockOr,
        }),
      };

      mockFrom.mockReturnValue(chain as any);

      const response = await request(app)
        .get('/api/characters/list')
        .expect(200);

      expect(response.body).toHaveProperty('characters');
      expect(Array.isArray(response.body.characters)).toBe(true);
    });
  });

  describe('POST /api/characters', () => {
    it('should create a new character', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: mockCharacter, error: null });
        chain.insert = vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockCharacter, error: null }),
          }),
        }));
        Object.assign(chain, {
          then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            const data = table === 'characters' ? [] : [];
            return Promise.resolve(onFulfilled({ data, error: null }));
          },
        });
        return chain as never;
      });

      // Mock avatar and cache functions
      const { characterAvatarUrl, avatarStyleFor } = await import('../../src/utils/avatar');
      const { cacheAvatar } = await import('../../src/utils/cacheAvatar');
      vi.mocked(characterAvatarUrl).mockReturnValue('https://avatar.url');
      vi.mocked(avatarStyleFor).mockReturnValue('adventurer');
      vi.mocked(cacheAvatar).mockResolvedValue('https://cached.avatar.url');

      const response = await request(app)
        .post('/api/characters')
        .send({
          name: 'Tía Maria',
          firstName: 'Maria',
          lastName: undefined,
        })
        .expect(201);

      expect(response.body).toHaveProperty('character');
      expect(response.body.character.name).toBe('Tía Maria');
    });

    it('should validate character schema', async () => {
      const response = await request(app)
        .post('/api/characters')
        .send({
          name: '' // Empty name should fail
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });

    it('should persist species on a pet character', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      let insertedPayload: Record<string, unknown> | undefined;
      const petCharacter = { ...mockCharacter, name: 'Max', species: 'dog' };

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: petCharacter, error: null });
        chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: petCharacter, error: null }),
            }),
          };
        });
        Object.assign(chain, {
          then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            const data = table === 'characters' ? [] : [];
            return Promise.resolve(onFulfilled({ data, error: null }));
          },
        });
        return chain as never;
      });

      const { characterAvatarUrl, avatarStyleFor } = await import('../../src/utils/avatar');
      const { cacheAvatar } = await import('../../src/utils/cacheAvatar');
      vi.mocked(characterAvatarUrl).mockReturnValue('https://avatar.url');
      vi.mocked(avatarStyleFor).mockReturnValue('adventurer');
      vi.mocked(cacheAvatar).mockResolvedValue('https://cached.avatar.url');

      const response = await request(app)
        .post('/api/characters')
        .send({ name: 'Max', species: 'dog' })
        .expect(201);

      expect(insertedPayload?.species).toBe('dog');
      expect(response.body.character.species).toBe('dog');
    });

    it('should reject a robot designation without companion species', async () => {
      const response = await request(app)
        .post('/api/characters')
        .send({ name: 'Omega1' })
        .expect(400);

      expect(response.body.reason).toBe('non_person_name');
    });

    it('should persist a robot companion when species is robot', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      let insertedPayload: Record<string, unknown> | undefined;
      const robotCharacter = { ...mockCharacter, name: 'Omega1', species: 'robot' };

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: robotCharacter, error: null });
        chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: robotCharacter, error: null }),
            }),
          };
        });
        Object.assign(chain, {
          then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            const data = table === 'characters' ? [] : [];
            return Promise.resolve(onFulfilled({ data, error: null }));
          },
        });
        return chain as never;
      });

      const { characterAvatarUrl, avatarStyleFor } = await import('../../src/utils/avatar');
      const { cacheAvatar } = await import('../../src/utils/cacheAvatar');
      vi.mocked(characterAvatarUrl).mockReturnValue('https://avatar.url');
      vi.mocked(avatarStyleFor).mockReturnValue('adventurer');
      vi.mocked(cacheAvatar).mockResolvedValue('https://cached.avatar.url');

      const response = await request(app)
        .post('/api/characters')
        .send({ name: 'Omega1', species: 'robot' })
        .expect(201);

      expect(insertedPayload?.species).toBe('robot');
      expect(response.body.character.species).toBe('robot');
    });

    it('should infer robot species from suggestion context', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      let insertedPayload: Record<string, unknown> | undefined;
      const robotCharacter = { ...mockCharacter, name: 'Omega1', species: 'robot' };

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: robotCharacter, error: null });
        chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { ...robotCharacter, species: payload.species }, error: null }),
            }),
          };
        });
        Object.assign(chain, {
          then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
            const data = table === 'characters' ? [] : [];
            return Promise.resolve(onFulfilled({ data, error: null }));
          },
        });
        return chain as never;
      });

      const { characterAvatarUrl, avatarStyleFor } = await import('../../src/utils/avatar');
      const { cacheAvatar } = await import('../../src/utils/cacheAvatar');
      vi.mocked(characterAvatarUrl).mockReturnValue('https://avatar.url');
      vi.mocked(avatarStyleFor).mockReturnValue('adventurer');
      vi.mocked(cacheAvatar).mockResolvedValue('https://cached.avatar.url');

      const response = await request(app)
        .post('/api/characters')
        .send({ name: 'Omega1', context: 'my robot Omega1 needs a charge', kind: 'pet' })
        .expect(201);

      expect(insertedPayload?.species).toBe('robot');
      expect(response.body.character.species).toBe('robot');
    });
  });

  describe('PATCH /api/characters/:id — rename auto-alias', () => {
    function mockRenamePatch(existingRow: Record<string, unknown>, renamedRow: Record<string, unknown>) {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      let updatePayload: Record<string, unknown> | undefined;

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: existingRow, error: null });
        chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          if (table === 'characters') updatePayload = payload;
          return {
            ...chain,
            eq: vi.fn().mockReturnValue({
              ...chain,
              eq: vi.fn().mockReturnValue({
                ...chain,
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: renamedRow, error: null }),
                }),
                // Fire-and-forget organization_members propagation chain.
                then: (resolve: (v: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
              }),
            }),
          };
        });
        return chain as never;
      });

      return () => updatePayload;
    }

    it('adds the previous name to alias when renaming, if not already present', async () => {
      const existingRow = { id: 'char-1', name: 'Amazon', alias: [], status: 'active' };
      const renamedRow = { ...existingRow, name: 'Amazon Ring', alias: ['Amazon'] };
      const getUpdatePayload = mockRenamePatch(existingRow, renamedRow);

      const response = await request(app)
        .patch('/api/characters/char-1')
        .send({ name: 'Amazon Ring' })
        .expect(200);

      const updatePayload = getUpdatePayload();
      expect(updatePayload?.name).toBe('Amazon Ring');
      expect(updatePayload?.alias).toEqual(['Amazon']);
      expect(response.body.character?.name ?? response.body.name).toBe('Amazon Ring');
    });

    it('does not duplicate the previous name if it is already an alias', async () => {
      const existingRow = { id: 'char-1', name: 'Amazon', alias: ['amazon'], status: 'active' };
      const renamedRow = { ...existingRow, name: 'Amazon Ring', alias: ['amazon'] };
      const getUpdatePayload = mockRenamePatch(existingRow, renamedRow);

      await request(app)
        .patch('/api/characters/char-1')
        .send({ name: 'Amazon Ring' })
        .expect(200);

      const alias = (getUpdatePayload()?.alias as string[]) ?? [];
      expect(alias.filter((a) => a.toLowerCase() === 'amazon')).toHaveLength(1);
    });

    // Regression: fixing an accidental possessive ("Tio Ralph's" -> "Tio
    // Ralph") is a typo correction, not a rename to a real alternate name —
    // the old, misspelled form must never be preserved as an alias.
    it('does not add the old name as an alias when the rename only fixes a possessive typo', async () => {
      const existingRow = { id: 'char-1', name: "Tio Ralph's", alias: [], status: 'active' };
      const renamedRow = { ...existingRow, name: 'Tio Ralph', alias: [] };
      const getUpdatePayload = mockRenamePatch(existingRow, renamedRow);

      await request(app)
        .patch('/api/characters/char-1')
        .send({ name: 'Tio Ralph' })
        .expect(200);

      const alias = (getUpdatePayload()?.alias as string[]) ?? [];
      expect(alias).toEqual([]);
    });

    it('scrubs a previously-saved possessive-typo alias the next time the character is saved', async () => {
      // Simulates data left over from before this guard existed: an earlier
      // rename already pushed "Tio Ralph's" into alias. Any future save
      // (even one unrelated to the name) must clean it up.
      const existingRow = { id: 'char-1', name: 'Tio Ralph', alias: ["Tio Ralph's", 'Uncle Ralph'], status: 'active' };
      const renamedRow = { ...existingRow, alias: ['Uncle Ralph'] };
      const getUpdatePayload = mockRenamePatch(existingRow, renamedRow);

      await request(app)
        .patch('/api/characters/char-1')
        .send({ name: 'Tio Ralph' }) // re-saving the same (already correct) name
        .expect(200);

      const alias = (getUpdatePayload()?.alias as string[]) ?? [];
      expect(alias).toEqual(['Uncle Ralph']);
    });
  });

  describe('PATCH /api/characters/:id — importance pin', () => {
    function mockImportancePatch(existingRow: Record<string, unknown>) {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      let updatePayload: Record<string, unknown> | undefined;

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockReturnValue(chain);
        chain.or = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.single = vi.fn().mockResolvedValue({ data: existingRow, error: null });
        chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          if (table === 'characters') updatePayload = payload;
          return {
            ...chain,
            eq: vi.fn().mockReturnValue({
              ...chain,
              eq: vi.fn().mockReturnValue({
                ...chain,
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { ...existingRow, ...payload }, error: null }),
                }),
                then: (resolve: (v: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
              }),
            }),
          };
        });
        return chain as never;
      });

      return () => updatePayload;
    }

    it('setting a level pins it via metadata.importance_level_source', async () => {
      const existingRow = { id: 'char-1', name: 'Jordan', alias: [], status: 'active', metadata: {} };
      const getUpdatePayload = mockImportancePatch(existingRow);

      await request(app)
        .patch('/api/characters/char-1')
        .send({ importanceLevel: 'major' })
        .expect(200);

      const payload = getUpdatePayload();
      expect(payload?.importance_level).toBe('major');
      expect((payload?.metadata as Record<string, unknown>)?.importance_level_source).toBe('user_confirmed');
    });

    it('clearing the level (null) removes the pin and re-triggers scoring', async () => {
      const existingRow = {
        id: 'char-1',
        name: 'Jordan',
        alias: [],
        status: 'active',
        metadata: { importance_level_source: 'user_confirmed' },
      };
      const getUpdatePayload = mockImportancePatch(existingRow);
      vi.mocked(scoreAndPersistCharacter).mockClear();

      await request(app)
        .patch('/api/characters/char-1')
        .send({ importanceLevel: null })
        .expect(200);

      const payload = getUpdatePayload();
      expect(payload?.importance_level).toBeUndefined();
      expect((payload?.metadata as Record<string, unknown>)?.importance_level_source).toBeUndefined();
      expect(scoreAndPersistCharacter).toHaveBeenCalledWith('user-123', 'char-1');
    });
  });
});


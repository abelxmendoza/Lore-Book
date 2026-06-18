import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockIn = vi.fn(() => ({ limit: mockLimit }));
const mockSelect = vi.fn(() => ({ in: mockIn, limit: mockLimit }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  FALLBACK_SELF_MODEL,
  loadSelfModel,
  resolveMetaProductContext,
} from '../../../src/services/chat/lorebookSelfModelService';

describe('lorebookSelfModelService — DB integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({ data: [], error: null });
  });

  it('queries system_knowledge for scoped concepts', async () => {
    await loadSelfModel(['product_identity', 'surfaces']);

    expect(mockFrom).toHaveBeenCalledWith('system_knowledge');
    expect(mockSelect).toHaveBeenCalledWith('concept, description');
    expect(mockIn).toHaveBeenCalledWith('concept', ['product_identity', 'surfaces']);
  });

  it('prefers DB descriptions over fallback for known product concepts', async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          concept: 'product_identity',
          description: 'DB override: LoreBook is the autobiographical memory OS.',
        },
      ],
      error: null,
    });

    const facts = await loadSelfModel(['product_identity']);
    expect(facts[0].description).toContain('DB override');
    expect(facts[0].description).not.toBe(FALLBACK_SELF_MODEL.product_identity.description);
  });

  it('ignores unknown concepts from DB rows', async () => {
    mockLimit.mockResolvedValue({
      data: [
        { concept: 'memory_ingestion_pipeline', description: 'Technical pipeline fact.' },
        { concept: 'product_identity', description: 'Valid product fact from DB.' },
      ],
      error: null,
    });

    const facts = await loadSelfModel(['product_identity']);
    expect(facts).toHaveLength(1);
    expect(facts[0].concept).toBe('product_identity');
  });

  it('falls back cleanly when DB errors', async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: 'relation missing' } });

    const facts = await loadSelfModel(['limitations']);
    expect(facts[0].description).toBe(FALLBACK_SELF_MODEL.limitations.description);
  });

  it('truncates overly long DB descriptions', async () => {
    const long = 'x'.repeat(200);
    mockLimit.mockResolvedValue({
      data: [{ concept: 'limitations', description: long }],
      error: null,
    });

    const facts = await loadSelfModel(['limitations']);
    expect(facts[0].description.length).toBeLessThanOrEqual(150);
    expect(facts[0].description.endsWith('…')).toBe(true);
  });

  it('uses DB facts in short-circuit answers', async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          concept: 'product_identity',
          description: 'From DB: LoreBook stores your life graph.',
        },
      ],
      error: null,
    });

    const result = await resolveMetaProductContext('What is LoreBook?');
    expect(result.shortCircuit?.content).toContain('From DB: LoreBook stores your life graph.');
  });
});

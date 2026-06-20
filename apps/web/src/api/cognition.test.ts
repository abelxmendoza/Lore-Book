import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api';
import { cognitionApi } from './cognition';

describe('cognitionApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listGraphNodes builds query string for kind and limit', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ success: true, nodes: [] });
    await cognitionApi.listGraphNodes({ kind: 'event', limit: 25 });
    expect(fetchJson).toHaveBeenCalledWith('/api/cognition/graph/nodes?kind=event&limit=25');
  });

  it('getCausalChain calls event-scoped endpoint', async () => {
    const eventId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffffffff';
    vi.mocked(fetchJson).mockResolvedValue({ success: true, eventId, causalLinks: [] });
    await cognitionApi.getCausalChain(eventId);
    expect(fetchJson).toHaveBeenCalledWith(`/api/cognition/causal-chain/${eventId}`);
  });

  it('recomputeSalience POSTs to recompute endpoint', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ success: true, count: 10 });
    await cognitionApi.recomputeSalience();
    expect(fetchJson).toHaveBeenCalledWith('/api/cognition/salience/recompute', { method: 'POST' });
  });

  it('getAutobiographyOutline fetches outline payload', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      outline: { mode: 'autobiography', themes: ['career'] },
    });
    const res = await cognitionApi.getAutobiographyOutline();
    expect(res.outline.themes).toContain('career');
  });
});

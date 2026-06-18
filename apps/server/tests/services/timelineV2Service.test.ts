import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/continuityRuntime/arcs/arcService', () => ({
  arcService: {
    listForUser: vi.fn(),
    upsert: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/services/continuityRuntime/arcs/arcMembershipService', () => ({
  arcMembershipService: { getMembershipsForArc: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/services/continuityRuntime/arcs/arcRelationshipService', () => ({
  arcRelationshipService: { getRelationshipsForArc: vi.fn().mockResolvedValue([]) },
}));

import { arcService } from '../../src/services/continuityRuntime/arcs/arcService';
import {
  mapArcToTimelineV2,
  normalizeTimelineArcType,
  timelineService,
  timelineSearchService,
} from '../../src/services/timelineV2';

const SAMPLE_ARC = {
  id: 'arc-1',
  user_id: 'user-1',
  title: 'College Years',
  arc_type: 'life_era' as const,
  track: null,
  dominant_emotion: null,
  emotional_arc: null,
  parent_id: null,
  start_date: '2018-01-01',
  end_date: '2022-06-01',
  is_active: false,
  summary: 'Undergrad era',
  confidence: 0.9,
  source: 'user_created' as const,
  tags: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

describe('timelineV2 service — life_arcs redirect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizeTimelineArcType accepts valid arc types', () => {
    expect(normalizeTimelineArcType('life_era')).toBe('life_era');
    expect(normalizeTimelineArcType('work')).toBe('work');
  });

  it('normalizeTimelineArcType falls back to custom for unknown types', () => {
    expect(normalizeTimelineArcType('sub_timeline')).toBe('custom');
    expect(normalizeTimelineArcType(undefined)).toBe('custom');
  });

  it('mapArcToTimelineV2 maps arc fields to timeline API shape', () => {
    const mapped = mapArcToTimelineV2(SAMPLE_ARC);
    expect(mapped).toMatchObject({
      id: 'arc-1',
      title: 'College Years',
      timeline_type: 'life_era',
      description: 'Undergrad era',
    });
  });

  it('listTimelines reads life_arcs via arcService', async () => {
    vi.mocked(arcService.listForUser).mockResolvedValue([
      { ...SAMPLE_ARC, created_at: '2026-01-02T00:00:00Z' },
      { ...SAMPLE_ARC, id: 'arc-2', title: 'Earlier', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const timelines = await timelineService.listTimelines('user-1');
    expect(arcService.listForUser).toHaveBeenCalledWith('user-1');
    expect(timelines[0]?.id).toBe('arc-1');
  });

  it('createTimeline upserts a user-created arc', async () => {
    vi.mocked(arcService.upsert).mockResolvedValue(SAMPLE_ARC);
    const created = await timelineService.createTimeline('user-1', {
      title: 'College Years',
      timeline_type: 'life_era',
    });
    expect(arcService.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'College Years', arc_type: 'life_era', source: 'user_created' })
    );
    expect(created.timeline_type).toBe('life_era');
  });

  it('createTimeline rejects empty title', async () => {
    await expect(timelineService.createTimeline('user-1', { title: '  ' })).rejects.toThrow(/Title is required/);
  });

  it('updateTimeline throws when arc missing', async () => {
    vi.mocked(arcService.getById).mockResolvedValue(null);
    await expect(timelineService.updateTimeline('user-1', 'missing', { title: 'X' })).rejects.toThrow(/not found/i);
  });

  it('deleteTimeline throws when arc missing', async () => {
    vi.mocked(arcService.getById).mockResolvedValue(null);
    await expect(timelineService.deleteTimeline('user-1', 'missing')).rejects.toThrow(/not found/i);
  });

  it('timelineSearchService filters arcs by title', async () => {
    vi.mocked(arcService.listForUser).mockResolvedValue([
      SAMPLE_ARC,
      { ...SAMPLE_ARC, id: 'arc-2', title: 'Career Track' },
    ]);
    const hits = await timelineSearchService.search('user-1', 'college');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('College Years');
  });
});

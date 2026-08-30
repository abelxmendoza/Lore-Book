import { beforeEach, describe, expect, it, vi } from 'vitest';

const narrativeMocks = vi.hoisted(() => ({
  listEras: vi.fn(),
  listLifeChapters: vi.fn(),
  listStorylines: vi.fn(),
  compile: vi.fn(),
}));

vi.mock('./narrativeLifeEraService', () => ({
  narrativeLifeEraService: { listEras: narrativeMocks.listEras },
}));
vi.mock('./narrativeLifeChapterService', () => ({
  narrativeLifeChapterService: { listChapters: narrativeMocks.listLifeChapters },
}));
vi.mock('./narrativeStoryChapterService', () => ({
  narrativeStoryChapterService: { listChapters: narrativeMocks.listStorylines },
}));
vi.mock('./narrativeCompilerService', () => ({
  narrativeCompilerService: { compile: narrativeMocks.compile },
}));

import { buildLifeSaga } from './lifeSagaService';

const base = {
  user_id: 'user-a',
  time_start: '2099-01-01T00:00:00.000Z',
  time_end: '2099-01-31T00:00:00.000Z',
  participants: [],
  scene_ids: ['scene-a'],
  event_ids: ['event-a'],
  confidence: 0.8,
  significance_score: 80,
  metadata: { ownership: { domain: 'creative' } },
};

describe('buildLifeSaga', () => {
  beforeEach(() => {
    narrativeMocks.listEras.mockReset();
    narrativeMocks.listLifeChapters.mockReset();
    narrativeMocks.listStorylines.mockReset();
    narrativeMocks.compile.mockReset();
    narrativeMocks.compile.mockResolvedValue({ turningPoints: [] });
  });

  it('defensively collapses repeated storylines before building current highlights', async () => {
    const duplicate = {
      ...base,
      id: 'storyline-b',
      title: 'Building a product',
      summary: 'Same product season, later duplicate projection.',
  updated_at: '2099-02-03T00:00:00.000Z',
      significance_score: 40,
      life_chapter_id: 'life-chapter-a',
    };
    narrativeMocks.listStorylines.mockResolvedValue([
      {
        ...base,
        id: 'storyline-a',
        title: 'Building a product',
        summary: 'A product season.',
        updated_at: '2099-02-02T00:00:00.000Z',
        life_chapter_id: 'life-chapter-a',
      },
      duplicate,
    ]);
    narrativeMocks.listLifeChapters.mockResolvedValue([{
      id: 'life-chapter-a',
      user_id: 'user-a',
      domain: 'creative',
      title: 'Product work',
      summary: 'Product work.',
      time_start: base.time_start,
      time_end: base.time_end,
      storyline_ids: ['storyline-a', 'storyline-b'],
      scene_ids: ['scene-a'],
      event_ids: ['event-a'],
      confidence: 0.8,
      era_id: 'era-a',
    }]);
    narrativeMocks.listEras.mockResolvedValue([{
      id: 'era-a',
      user_id: 'user-a',
      title: 'A season of building',
      summary: 'A season of building.',
      is_current: true,
      time_start: base.time_start,
      time_end: base.time_end,
      chapter_ids: ['life-chapter-a'],
    }]);

    const result = await buildLifeSaga('user-a');

    expect(result.currentStorylines).toHaveLength(1);
    expect(result.eras[0].chapters[0].storylines).toHaveLength(1);
    expect(result.eras[0].chapters[0].storylines[0].id).toBe('storyline-a');
  });

  it('reconnects merged memberships when duplicate rows have different evidence IDs', async () => {
    narrativeMocks.listStorylines.mockResolvedValue([
      {
        ...base,
        id: 'storyline-a',
        title: 'Social evenings',
        summary: 'A recurring season of social evenings and music.',
        scene_ids: ['scene-a'],
        event_ids: ['event-a'],
        life_chapter_id: 'life-chapter-a',
      },
      {
        ...base,
        id: 'storyline-b',
        title: 'Social evenings',
        summary: 'A recurring season of social evenings and music.',
        time_start: '2099-02-01T00:00:00.000Z',
        time_end: '2099-02-28T00:00:00.000Z',
        scene_ids: ['scene-b'],
        event_ids: ['event-b'],
        life_chapter_id: 'life-chapter-b',
      },
    ]);
    narrativeMocks.listLifeChapters.mockResolvedValue([
      {
        ...base,
        id: 'life-chapter-a',
        domain: 'social',
        title: 'Social evenings',
        summary: 'A recurring season of social evenings and music.',
        storyline_ids: ['storyline-a'],
        scene_ids: ['scene-a'],
        event_ids: ['event-a'],
        era_id: 'era-a',
      },
      {
        ...base,
        id: 'life-chapter-b',
        domain: 'social',
        title: 'Social evenings',
        summary: 'A recurring season of social evenings and music.',
        time_start: '2099-02-01T00:00:00.000Z',
        time_end: '2099-02-28T00:00:00.000Z',
        storyline_ids: ['storyline-b'],
        scene_ids: ['scene-b'],
        event_ids: ['event-b'],
        era_id: 'era-a',
      },
    ]);
    narrativeMocks.listEras.mockResolvedValue([{
      ...base,
      id: 'era-a',
      title: 'A season of connection',
      summary: 'A season of connection.',
      is_current: true,
      chapter_ids: ['life-chapter-a', 'life-chapter-b'],
    }]);

    const result = await buildLifeSaga('user-a');

    expect(result.eras[0].chapters).toHaveLength(1);
    expect(result.eras[0].chapters[0].storylines).toHaveLength(1);
    expect(result.eras[0].chapters[0].storylines[0].sceneIds).toEqual(['scene-a', 'scene-b']);
  });
});

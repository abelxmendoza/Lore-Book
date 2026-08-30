import { describe, expect, it, vi } from 'vitest';

const fetchJson = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({ fetchJson }));

import { fetchSaga } from './saga';

describe('fetchSaga', () => {
  it('preserves evidence metadata needed by the reader', async () => {
    fetchJson.mockResolvedValue({
      success: true,
      saga: {
        projectionGeneration: 'generation-a',
        currentStorylines: [],
        turningPoints: [],
        eras: [{
          id: 'era-a',
          title: 'A season',
          summary: 'A season.',
          isCurrent: true,
          chapters: [{
            id: 'chapter-a',
            title: 'Product work',
            domain: 'creative',
            summary: 'Product work.',
            storylines: [{
              id: 'story-a',
              title: 'Building a product',
              summary: 'A product season.',
              domain: 'creative',
              status: 'active',
              momentum: 'steady',
              intensityScore: 80,
              eventIds: ['event-a'],
              sceneIds: ['scene-a'],
              participants: ['Alex'],
              timeStart: '2026-01-01',
              timeEnd: '2026-01-31',
              location: 'Northwind Depot',
              confidence: 0.9,
              primarySubject: 'MemoVault',
            }],
          }],
        }],
      },
    });

    const result = await fetchSaga();
    const storyline = result.saga.eras[0].chapters[0].storylines[0];

    expect(result.saga.projectionGeneration).toBe('generation-a');
    expect(storyline).toMatchObject({
      sceneIds: ['scene-a'],
      eventIds: ['event-a'],
      participants: ['Alex'],
      location: 'Northwind Depot',
      confidence: 0.9,
      primarySubject: 'MemoVault',
    });
  });

  it('lets API errors reach the hook instead of becoming an empty Saga', async () => {
    fetchJson.mockRejectedValue(new Error('Saga unavailable'));
    await expect(fetchSaga()).rejects.toThrow('Saga unavailable');
  });
});

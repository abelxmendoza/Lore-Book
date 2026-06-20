import { describe, expect, it } from 'vitest';

import { classifyLifeEventText, computeEventSignificance } from './lifeEventTaxonomy';
import { classifyResolvedEventRow } from './lifeEventClassificationService';
import { compileLifeChapters } from './lifeChapterCompilerService';

describe('lifeEventTaxonomy', () => {
  it('classifies career events from text', () => {
    const result = classifyLifeEventText('Started at Amazon', 'Onboarding week was intense', 'career_event');
    expect(result.category).toBe('career');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('classifies relationship separation', () => {
    const result = classifyLifeEventText('We broke up', 'Blocked on Instagram', null);
    expect(result.category).toBe('relationship');
    expect(result.relationshipSubtype).toBe('separation');
  });

  it('scores high-significance events higher', () => {
    const low = computeEventSignificance({
      confidence: 0.6,
      category: 'social',
      relationshipSubtype: null,
      peopleCount: 0,
      evidenceCount: 1,
    });
    const high = computeEventSignificance({
      confidence: 0.9,
      category: 'career',
      relationshipSubtype: null,
      peopleCount: 3,
      evidenceCount: 4,
      emotionalIntensity: 0.8,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe('lifeChapterCompilerService', () => {
  it('clusters events into era chapters', () => {
    const events = [
      classifyResolvedEventRow({
        id: 'e1',
        title: 'Started at Amazon',
        summary: 'New job onboarding',
        type: 'career_event',
        start_time: '2024-01-15T00:00:00Z',
        end_time: null,
        confidence: 0.9,
        people: [],
        metadata: {},
      }, 2),
      classifyResolvedEventRow({
        id: 'e2',
        title: 'Promoted to senior',
        summary: 'Team lead role',
        type: 'career_event',
        start_time: '2024-03-01T00:00:00Z',
        end_time: null,
        confidence: 0.85,
        people: ['p1'],
        metadata: {},
      }, 1),
      classifyResolvedEventRow({
        id: 'e3',
        title: 'Moved to Seattle',
        summary: 'Relocated for work',
        type: 'living_situation',
        start_time: '2025-02-01T00:00:00Z',
        end_time: null,
        confidence: 0.8,
        people: [],
        metadata: {},
      }, 1),
    ];

    const chapters = compileLifeChapters(events);
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chapters[0].eventCount).toBeGreaterThan(0);
    expect(chapters[0].title).toMatch(/Career|Move/);
  });
});

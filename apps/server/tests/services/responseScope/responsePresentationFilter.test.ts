import { describe, expect, it } from 'vitest';

import {
  filterCitationsForPresentation,
  filterEntitiesForPresentation,
  filterSourcesForPresentation,
  isPresentableEntityName,
} from '../../../src/services/responseScope/responsePresentationFilter';
import { planResponseScope } from '../../../src/services/responseScope/responseScopePlanner';

const WORK_PLAN = planResponseScope('Tell me about Jesse and Naveska on my Ring team.');

describe('response presentation filtering', () => {
  it('applies work scope to visible sources and removes junk sentence bleed', () => {
    const sources = filterSourcesForPresentation(
      [
        { type: 'character', id: 'jesse', title: 'Jesse', snippet: 'lab department head' },
        { type: 'character', id: 'naveska', title: 'Naveska', snippet: 'team lead engineer' },
        { type: 'character', id: 'ink', title: 'Ink', snippet: 'unrelated music contact' },
        { type: 'character', id: 'bleed', title: 'Also You', snippet: 'sentence fragment' },
        { type: 'entry', id: 'ring', title: 'Ring product testing', snippet: 'work lab testing shift' },
      ],
      WORK_PLAN,
    );

    expect(sources.map((source) => source.title)).toEqual([
      'Jesse',
      'Naveska',
      'Ring product testing',
    ]);
  });

  it('uses the same boundary for entity and citation chips', () => {
    const entities = filterEntitiesForPresentation(
      [
        { id: 'jesse', name: 'Jesse', type: 'character' },
        { id: 'ink', name: 'Ink', type: 'character' },
        { id: 'bleed', name: 'Also You', type: 'character' },
      ],
      WORK_PLAN,
    );
    expect(entities.map((entity) => entity.name)).toEqual(['Jesse']);

    const citations = filterCitationsForPresentation(
      [
        { text: 'Jesse', sourceId: 'jesse' },
        { text: 'Ink', sourceId: 'ink' },
      ],
      [{ type: 'character', id: 'jesse', title: 'Jesse' }],
    );
    expect(citations).toEqual([{ text: 'Jesse', sourceId: 'jesse' }]);
  });

  it('rejects known sentence-fragment entity labels', () => {
    expect(isPresentableEntityName('Also You')).toBe(false);
    expect(isPresentableEntityName('Jowell')).toBe(true);
  });

  it('does not surface unmentioned crush characters on a vague night vent', () => {
    const plan = planResponseScope('I had the worst night last night');
    expect(plan.intent).toBe('event');

    const sources = filterSourcesForPresentation(
      [
        { type: 'character', id: 'crush', title: 'Jamie', snippet: 'crush contact' },
        { type: 'entry', id: 'e1', title: 'Late shift', snippet: 'tough evening at work' },
      ],
      plan,
      {
        intent: 'LIFE_REVIEW',
        entities: [],
        episodes: [],
        events: [],
        projects: [],
        goals: [],
        skills: [],
        communities: [],
        relationships: [
          {
            id: 'r1',
            type: 'relationship',
            title: 'crush — Jamie',
            content: 'crush',
            source: 'character_relationships',
            confidence: 0.9,
            score: 0.9,
            reasons: [],
            metadata: { domain: 'romance' },
          },
        ],
        preferences: [],
        timeline: [],
        confidence: 0.5,
        budget: { maxItems: 20, selected: 1, rejected: 0 },
        rejected: [],
      },
    );

    expect(sources.map((s) => s.title)).not.toContain('Jamie');
    expect(sources.every((s) => s.type !== 'character')).toBe(true);
  });

  it('drops unrelated character sources on person-focused questions (Ink must not ride along)', () => {
    const plan = planResponseScope('What do you know about Jesse?');
    const sources = filterSourcesForPresentation(
      [
        { type: 'character', id: 'jesse', title: 'Jesse', snippet: 'lab coworker' },
        { type: 'character', id: 'ink', title: 'Ink', snippet: 'ska promoter and music contact' },
        { type: 'entry', id: 'e1', title: 'Jesse on Ring testing', snippet: 'worked with Jesse on lab shift' },
        { type: 'entry', id: 'e2', title: 'Ink Fest night', snippet: 'saw Ink at the venue' },
      ],
      plan,
    );
    const titles = sources.map((s) => s.title);
    expect(titles).toContain('Jesse');
    expect(titles).toContain('Jesse on Ring testing');
    expect(titles).not.toContain('Ink');
    expect(titles).not.toContain('Ink Fest night');

    const entities = filterEntitiesForPresentation(
      [
        { id: 'jesse', name: 'Jesse', type: 'character' },
        { id: 'ink', name: 'Ink', type: 'character' },
      ],
      plan,
    );
    expect(entities.map((e) => e.name)).toEqual(['Jesse']);
  });
});

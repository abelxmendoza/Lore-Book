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
});

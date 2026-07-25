import { describe, expect, it } from 'vitest';
import { generateCitations, sourceTitleCitedInAnswer } from './chatAnalysisHelpers';

describe('generateCitations', () => {
  it('requires a real title mention instead of a weak date match', () => {
    const citations = generateCitations(
      [
        {
          type: 'entry',
          id: 'e1',
          title: 'Untitled night out',
          date: '2024-08-10T00:00:00Z',
        },
        {
          type: 'character',
          id: 'c1',
          title: 'Marcus',
          date: '2024-08-10T00:00:00Z',
        },
      ],
      'In Aug 2024 Marcus helped me finish the set.',
    );
    expect(citations.map((c) => c.sourceId)).toEqual(['c1']);
  });

  it('does not cite on a short title prefix alone', () => {
    expect(sourceTitleCitedInAnswer('Night', 'I had a night out after the show')).toBe(false);
    expect(sourceTitleCitedInAnswer('Marcus', 'Marcus helped at the show')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  composeRomanceChronology,
  INTERACTION_TO_DATE_TYPE,
} from './romanceChronologyService';

describe('composeRomanceChronology', () => {
  it('returns canonical dates when present', () => {
    const result = composeRomanceChronology(
      [
        {
          id: 'd1',
          date_type: 'first_date',
          date_time: '2024-02-01T00:00:00Z',
          description: 'Coffee',
          source_message_id: 'm1',
        },
      ],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('date');
    expect(result[0].date_type).toBe('first_date');
  });

  it('projects interactions when dates are empty', () => {
    const result = composeRomanceChronology(
      [],
      [
        {
          id: 'i1',
          interaction_type: 'date',
          interaction_date: '2024-03-01T00:00:00Z',
          description: 'Went out',
          was_positive: true,
          sentiment: 0.8,
        },
        {
          id: 'i2',
          interaction_type: 'conflict',
          interaction_date: '2024-03-10T00:00:00Z',
          description: 'Argues',
          was_positive: false,
        },
      ],
      { id: 'rel-1', person_name: 'Alex' },
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('interaction:i2');
    expect(result[0].date_type).toBe(INTERACTION_TO_DATE_TYPE.conflict);
    expect(result[1].date_type).toBe('special_date');
    expect(result[1].source).toBe('interaction');
  });

  it('dedupes interactions that already have a matching date by source_message_id', () => {
    const result = composeRomanceChronology(
      [
        {
          id: 'd1',
          date_type: 'first_date',
          date_time: '2024-02-01T00:00:00Z',
          source_message_id: 'msg-shared',
        },
      ],
      [
        {
          id: 'i1',
          interaction_type: 'date',
          interaction_date: '2024-02-01T00:00:00Z',
          source_message_id: 'msg-shared',
        },
        {
          id: 'i2',
          interaction_type: 'meetup',
          interaction_date: '2024-02-08T00:00:00Z',
          source_message_id: 'msg-other',
        },
      ],
    );
    expect(result.map((r) => r.id)).toEqual(['interaction:i2', 'd1']);
  });

  it('falls back to bond start as first_meeting when everything else is empty', () => {
    const result = composeRomanceChronology([], [], {
      id: 'rel-dolly',
      start_date: '2024-01-15T12:00:00Z',
      person_name: 'Jamie',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'bond-start:rel-dolly',
      date_type: 'first_meeting',
      source: 'relationship',
      description: 'Connection with Jamie began',
    });
  });

  it('returns empty when there is no evidence at all', () => {
    expect(composeRomanceChronology([], [], { id: 'rel-x' })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { parseEventWriteRequest } from './eventWriteService';

describe('parseEventWriteRequest', () => {
  it('parses “we played … at …”', () => {
    expect(parseEventWriteRequest('we played a backyard show at Northwind Depot')).toEqual({
      title: 'backyard show',
      locationName: 'Northwind Depot',
      dateIso: null,
      story: 'we played a backyard show at Northwind Depot',
    });
  });

  it('parses explicit post-event phrasing', () => {
    expect(
      parseEventWriteRequest('post an event: House Show at Ritual Coffee on 2024-06-01'),
    ).toMatchObject({
      title: 'House Show',
      locationName: 'Ritual Coffee',
      dateIso: '2024-06-01',
    });
  });

  it('does not treat ordinary dinner as an event write', () => {
    expect(parseEventWriteRequest('we had dinner at Northwind Depot')).toBeNull();
  });
});

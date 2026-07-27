import { describe, expect, it } from 'vitest';

import type { LocationQueryRequest } from '@lorebook/api-contracts';
import type { LocationProfile } from '../../types';
import { compileLocationQuery, deriveLocationQueryHints } from './locationQueryService';

function location(overrides: Partial<LocationProfile> & Pick<LocationProfile, 'id' | 'name'>): LocationProfile {
  return {
    visitCount: 0,
    mentionCount: 0,
    relatedPeople: [],
    tagCounts: [],
    chapters: [],
    moods: [],
    entries: [],
    sources: ['registry'],
    ...overrides,
  };
}

function request(query: string, filters: LocationQueryRequest['filters'] = {}): LocationQueryRequest {
  return { query, filters, sort: 'relevance', limit: 30, offset: 0, includeFacets: true };
}

const places = [
  location({
    id: 'studio',
    name: 'Vanguard Studio',
    type: 'studio',
    city: 'Portland',
    visitCount: 4,
    mentionCount: 7,
    coordinates: { lat: 45.5, lng: -122.6 },
    relatedPeople: [{ id: 'marcus', name: 'Marcus', total_mentions: 4, entryCount: 3, link_kind: 'participated' }],
  }),
  location({ id: 'cafe', name: 'Northstar Cafe', type: 'cafe', city: 'Portland', mentionCount: 2 }),
  location({
    id: 'park',
    name: 'Signal Park',
    type: 'park',
    visitCount: 1,
    mentionCount: 1,
    metadata: { needs_review: true },
  }),
  location({
    id: 'control-room',
    name: 'Studio Control Room',
    type: 'room',
    parent_location_id: 'studio',
  }),
];

const organizations = new Map([['studio', ['Vanguard Robotics']]]);

describe('locationQueryService', () => {
  it('derives people, activity, and quality intent without treating mentions as visits', () => {
    expect(deriveLocationQueryHints('Which places did I visit with Marcus?')).toMatchObject({
      intent: 'person',
      personNames: ['Marcus'],
      visitStates: ['visited'],
    });
    expect(deriveLocationQueryHints('Show locations missing coordinates')).toMatchObject({
      intent: 'quality',
      hasCoordinates: false,
    });
  });

  it('finds places visited with a linked person', () => {
    const result = compileLocationQuery(places, organizations, request('Which places did I visit with Marcus?'));
    expect(result.results.map((item) => item.name)).toEqual(['Vanguard Studio']);
    expect(result.results[0].visitState).toBe('visited');
  });

  it('queries linked organizations', () => {
    const result = compileLocationQuery(
      places,
      organizations,
      request('', { organizationNames: ['Vanguard Robotics'] }),
    );
    expect(result.results.map((item) => item.name)).toEqual(['Vanguard Studio']);
  });

  it('separates mentioned-only places from visited places', () => {
    const result = compileLocationQuery(places, organizations, request('Show places mentioned only'));
    expect(result.results.map((item) => item.name)).toEqual(['Northstar Cafe']);
  });

  it('finds quality problems and preserves facets', () => {
    const result = compileLocationQuery(places, organizations, request('Which locations need review?'));
    expect(result.results.map((item) => item.name)).toEqual(['Signal Park']);
    expect(result.facets.types).toEqual([{ value: 'park', count: 1 }]);
  });

  it('resolves natural hierarchy queries through canonical parent ids', () => {
    const result = compileLocationQuery(places, organizations, request('Show places inside Vanguard Studio'));
    expect(result.results.map((item) => item.name)).toEqual(['Studio Control Room']);
    expect(result.results[0].matchedReasons).toContain('inside Vanguard Studio');
  });
});

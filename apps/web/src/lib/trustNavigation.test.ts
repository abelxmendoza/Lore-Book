import { describe, expect, it } from 'vitest';
import { resolveTrustItemRoute, resolveUnknownGapRoute, trustDomainBookPath } from './trustNavigation';

describe('trustNavigation', () => {
  it('routes contradictions to discovery contradictions panel', () => {
    expect(
      resolveTrustItemRoute({
        action: 'review_contradiction',
        kind: 'contradiction',
        domain: 'characters',
        reason: 'Stated vs revealed',
      })
    ).toBe('/discovery/contradictions');
  });

  it('routes entity authority to memory review queue', () => {
    expect(
      resolveTrustItemRoute({
        action: 'entity_authority',
        kind: 'merge',
        domain: 'characters',
        reason: 'Pending merge',
      })
    ).toBe('/discovery/memory-review');
  });

  it('routes fill_gap to chat with encoded prompt', () => {
    expect(
      resolveTrustItemRoute({
        action: 'fill_gap',
        kind: 'mentioned_person_no_profile',
        domain: 'characters',
        reason: 'Who is Alex?',
      })
    ).toBe('/chat?prompt=Who%20is%20Alex%3F');
  });

  it('routes unknown gaps to chat or gaps surface', () => {
    expect(
      resolveUnknownGapRoute({
        kind: 'timeline_void',
        domain: 'events',
        prompt: 'Fill timeline gap',
      })
    ).toBe('/gaps');

    expect(
      resolveUnknownGapRoute({
        kind: 'mentioned_place_no_location',
        domain: 'locations',
        prompt: 'Where is the studio?',
      })
    ).toBe('/chat?prompt=Where%20is%20the%20studio%3F');
  });

  it('maps domains to book paths', () => {
    expect(trustDomainBookPath('relationships')).toBe('/love');
    expect(trustDomainBookPath('projects')).toBe('/projects');
  });
});

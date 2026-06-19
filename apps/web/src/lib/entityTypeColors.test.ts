import { describe, it, expect } from 'vitest';
import {
  chipColorForEntity,
  ENTITY_CHIP_COLORS,
  highlightVisualClass,
  visualKindForEntity,
} from './entityTypeColors';

describe('entityTypeColors', () => {
  it('assigns a distinct known color per visual kind', () => {
    const known = Object.values(ENTITY_CHIP_COLORS).map((c) => c.known);
    expect(new Set(known).size).toBe(known.length);
  });

  it('maps entity types to the requested visual buckets', () => {
    expect(visualKindForEntity({ type: 'character' })).toBe('character');
    expect(visualKindForEntity({ type: 'character', characterVariant: 'romantic' })).toBe('romantic');
    expect(visualKindForEntity({ type: 'organization' })).toBe('group');
    expect(visualKindForEntity({ type: 'location' })).toBe('location');
    expect(visualKindForEntity({ type: 'skill' })).toBe('skill');
  });

  it('uses rose for romantic interests and indigo for skills', () => {
    expect(chipColorForEntity({ type: 'character', characterVariant: 'romantic', status: 'confirmed' })).toContain('rose');
    expect(chipColorForEntity({ type: 'skill', status: 'confirmed' })).toContain('indigo');
    expect(chipColorForEntity({ type: 'organization', status: 'confirmed' })).toContain('emerald');
  });

  it('emits highlight classes per visual kind', () => {
    expect(highlightVisualClass({ type: 'character', characterVariant: 'romantic', status: 'confirmed' })).toContain(
      'entity-hl-romantic'
    );
    expect(highlightVisualClass({ type: 'organization', status: 'confirmed' })).toContain('entity-hl-group');
  });
});

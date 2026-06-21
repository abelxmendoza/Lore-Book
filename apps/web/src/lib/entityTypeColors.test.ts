import { describe, it, expect } from 'vitest';
import {
  chipColorForEntity,
  ENTITY_CHIP_COLORS,
  highlightVisualClass,
  inlineMarkClassForEntity,
  loreKindForVisual,
  visualKindForEntity,
} from './entityTypeColors';
import { ENTITY_COLOR_MAP, previewChipClass } from './entityColorMap';
import { getLoreEntity, MAIN_LORE_ENTITIES } from './loreEntities';

describe('entityTypeColors', () => {
  it('assigns a distinct known color per visual kind', () => {
    const known = Object.values(ENTITY_CHIP_COLORS).map((c) => c.known);
    expect(new Set(known).size).toBe(known.length);
  });

  it('maps entity types to the requested visual buckets', () => {
    expect(visualKindForEntity({ type: 'character' })).toBe('character');
    expect(visualKindForEntity({ type: 'character', characterVariant: 'romantic' })).toBe('romantic');
    expect(visualKindForEntity({ type: 'organization' })).toBe('organization');
    expect(visualKindForEntity({ type: 'location' })).toBe('location');
    expect(visualKindForEntity({ type: 'skill' })).toBe('skill');
  });

  it('uses loreEntities palette: blue people, rose love, cyan skills, green orgs', () => {
    expect(chipColorForEntity({ type: 'character', status: 'confirmed' })).toContain('blue');
    expect(chipColorForEntity({ type: 'character', characterVariant: 'romantic', status: 'confirmed' })).toContain('rose');
    expect(chipColorForEntity({ type: 'skill', status: 'confirmed' })).toContain('cyan');
    expect(chipColorForEntity({ type: 'organization', status: 'confirmed' })).toContain('green');
    expect(chipColorForEntity({ type: 'location', status: 'confirmed' })).toContain('emerald');
  });

  it('emits highlight classes per visual kind', () => {
    expect(highlightVisualClass({ type: 'character', characterVariant: 'romantic', status: 'confirmed' })).toContain(
      'entity-hl-romantic'
    );
    expect(highlightVisualClass({ type: 'organization', status: 'confirmed' })).toContain('entity-hl-organization');
  });

  it('keeps composer chips aligned with loreEntities SSOT', () => {
    for (const [visual, kind] of Object.entries({
      character: 'person',
      romantic: 'relationship',
      location: 'place',
      group: 'group',
      organization: 'organization',
      skill: 'skill',
      event: 'event',
      project: 'project',
    } as const)) {
      expect(ENTITY_CHIP_COLORS[visual as keyof typeof ENTITY_CHIP_COLORS].known).toBe(
        getLoreEntity(kind).chip,
      );
      expect(loreKindForVisual(visual as keyof typeof ENTITY_CHIP_COLORS)).toBe(kind);
    }
  });

  it('uses the same palette for inline marks and composer chips', () => {
    const entity = { type: 'character' as const, status: 'confirmed' as const };
    expect(inlineMarkClassForEntity(entity)).toContain(chipColorForEntity(entity));
    expect(previewChipClass('person', false, 'known')).toContain(ENTITY_COLOR_MAP.person.chip);
  });
});

describe('entityColorMap lore sync', () => {
  const syncedKeys = [
    ['person', 'person'],
    ['place', 'place'],
    ['group', 'group'],
    ['organization', 'organization'],
    ['skill', 'skill'],
    ['project', 'project'],
    ['event', 'event'],
    ['relationship', 'relationship'],
  ] as const;

  it('derives preview chip classes from loreEntities for book entity types', () => {
    for (const [mapKey, loreKind] of syncedKeys) {
      expect(ENTITY_COLOR_MAP[mapKey].chip).toBe(getLoreEntity(loreKind).chip);
    }
  });

  it('covers every main lore entity kind in the palette', () => {
    expect(MAIN_LORE_ENTITIES.length).toBeGreaterThanOrEqual(9);
  });
});

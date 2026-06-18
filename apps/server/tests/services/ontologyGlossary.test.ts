import { describe, expect, it } from 'vitest';

import { GLOSSARY, lookupKeyword } from '../../src/services/ontology/glossary';
import {
  classifyDiscoverySurface,
  classifyQueryType,
  discoverEntities,
  discoverEntityAuthoritySignals,
  discoverInsightSignals,
} from '../../src/services/ontology/lexicalIntelligence';
import { DISCOVERY_SURFACES, ONTOLOGY_LAYER_LABELS, ontology } from '../../src/services/ontology/ontology';

describe('ontology glossary — Discovery Hub sprint', () => {
  it('has expanded glossary with Discovery Hub nav entries', () => {
    expect(GLOSSARY.length).toBeGreaterThan(80);
    expect(lookupKeyword('open_discovery')).not.toBeNull();
    expect(lookupKeyword('open_soul_profile')?.surfaceTarget).toBe('discovery/soul-profile');
    expect(lookupKeyword('open_life_arc')?.surfaceTarget).toBe('discovery/life-arc');
  });

  it('maps Discovery Hub panel phrases to surface targets', () => {
    expect(classifyDiscoverySurface('open my soul profile')?.surface).toBe('discovery/soul-profile');
    expect(classifyDiscoverySurface('show relationship analytics')?.surface).toBe('discovery/relationships');
    expect(classifyDiscoverySurface('open location book')?.surface).toBe('locations');
    expect(classifyDiscoverySurface('random chat message')).toBeNull();
  });

  it('classifies essence and contradiction query types', () => {
    expect(classifyQueryType('what are my hopes and dreams').queryHint).toBe('ESSENCE_QUERY');
    expect(classifyQueryType('i contradict myself sometimes').queryHint).toBe('CONTRADICTION_QUERY');
    expect(classifyQueryType('decisions i made last year').queryHint).toBe('TEMPORAL_QUERY');
    expect(classifyQueryType('what has been going on lately').queryHint).toBe('TEMPORAL_QUERY');
  });

  it('detects insight signals without creating fake entities', () => {
    const text = 'my inner critic keeps saying i am not good enough and i notice a recurring pattern';
    const signals = discoverInsightSignals(text);
    expect(signals.some((s) => s.category === 'SHADOW_SIGNAL')).toBe(true);
    expect(signals.some((s) => s.category === 'INSIGHT_SIGNAL')).toBe(true);
    const entities = discoverEntities(text);
    expect(entities.every((e) => e.category !== 'SHADOW_SIGNAL')).toBe(true);
  });

  it('detects entity authority merge/alias cues', () => {
    const merge = discoverEntityAuthoritySignals('those are the same person, merge them');
    expect(merge.some((h) => h.subcategory === 'MERGE')).toBe(true);
    const alias = discoverEntityAuthoritySignals('she also goes by Maya');
    expect(alias.some((h) => h.subcategory === 'ALIAS')).toBe(true);
  });

  it('exports Discovery surface registry aligned with DiscoveryHub routes', () => {
    expect(DISCOVERY_SURFACES.soulProfile).toBe('discovery/soul-profile');
    expect(DISCOVERY_SURFACES.lifeArc).toBe('discovery/life-arc');
    expect(DISCOVERY_SURFACES.memoryReview).toBe('discovery/memory-review');
    expect(ONTOLOGY_LAYER_LABELS.NAV_VERB).toBeTruthy();
    expect(ontology.DISCOVERY_SURFACES).toBe(DISCOVERY_SURFACES);
  });
});

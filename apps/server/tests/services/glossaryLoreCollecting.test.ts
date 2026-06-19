import { describe, expect, it } from 'vitest';

import { GLOSSARY, lookupKeyword } from '../../src/services/ontology/glossary';
import { LORE_COLLECTING_GLOSSARY_ENTRIES } from '../../src/services/ontology/glossaryLoreCollecting';

describe('glossaryLoreCollecting extension', () => {
  it('is merged into the main glossary', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(LORE_COLLECTING_GLOSSARY_ENTRIES.length + 100);
    for (const entry of LORE_COLLECTING_GLOSSARY_ENTRIES) {
      expect(GLOSSARY.some((g) => g.keyword === entry.keyword)).toBe(true);
    }
  });

  it('includes named skills for local lore collection', () => {
    expect(lookupKeyword('muay thai')).toMatchObject({ domain: 'SKILL', category: 'PHYSICAL' });
    expect(lookupKeyword('bjj')).toMatchObject({ domain: 'SKILL' });
    expect(lookupKeyword('ros2')).toMatchObject({ domain: 'SKILL', category: 'TECHNICAL' });
    expect(lookupKeyword('python')).toMatchObject({ domain: 'SKILL' });
  });

  it('includes extended kinship roles', () => {
    expect(lookupKeyword('niece')).toMatchObject({ category: 'FAMILY', kinshipForm: 'TITLED' });
    expect(lookupKeyword('stepmother')).toMatchObject({ category: 'FAMILY' });
    expect(lookupKeyword('mother-in-law')).toMatchObject({ category: 'FAMILY' });
  });

  it('includes employment and journal capture cues', () => {
    expect(lookupKeyword('got hired')).toMatchObject({ relationshipHint: 'WORK_RELATIONSHIP' });
    expect(lookupKeyword('save to lorebook')).toMatchObject({ queryHint: 'MEMORY_QUERY' });
  });
});

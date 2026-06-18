import { describe, expect, it } from 'vitest';

import { ARCHIVIST_CONTRACT } from '../../src/contracts/sensemakingContract';
import {
  applyPersonaRetrievalContract,
  passesRetrievalContract,
  truthStateWeight,
} from '../../src/services/chat/epistemicRetrievalFilter';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../../src/services/chat/workingMemoryAssembler';

function item(overrides: Partial<WorkingMemoryItem>): WorkingMemoryItem {
  return {
    id: 'test',
    type: 'episode',
    title: 'Test',
    content: 'body',
    source: 'journal_entries',
    confidence: 0.8,
    score: 0.5,
    reasons: [],
    ...overrides,
  };
}

function assembly(items: WorkingMemoryItem[]): WorkingMemoryAssembly {
  return {
    intent: 'LIFE_REVIEW',
    entities: [],
    episodes: items,
    events: [],
    projects: [],
    goals: [],
    skills: [],
    communities: [],
    relationships: [],
    preferences: [],
    timeline: [],
    confidence: 0.8,
    budget: { maxItems: 10, selected: items.length, rejected: 0 },
    rejected: [],
  };
}

describe('epistemicRetrievalFilter', () => {
  it('archivist contract rejects BELIEF preferences', () => {
    const belief = item({ type: 'preference', metadata: { knowledge_type: 'BELIEF' } });
    expect(passesRetrievalContract(belief, ARCHIVIST_CONTRACT)).toBe(false);
  });

  it('archivist contract accepts EXPERIENCE episodes', () => {
    const episode = item({ metadata: { knowledge_type: 'EXPERIENCE', truth_state: 'CANONICAL' } });
    expect(passesRetrievalContract(episode, ARCHIVIST_CONTRACT)).toBe(true);
  });

  it('weights DISPUTED below CANONICAL', () => {
    expect(truthStateWeight('DISPUTED')).toBeLessThan(truthStateWeight('CANONICAL'));
  });

  it('applyPersonaRetrievalContract filters working memory for archivist', () => {
    const packet = {
      workingMemory: assembly([
        item({ id: 'keep', metadata: { knowledge_type: 'EXPERIENCE', truth_state: 'CANONICAL' } }),
        item({ id: 'drop', type: 'preference', metadata: { knowledge_type: 'BELIEF' } }),
      ]),
      relatedEntries: [],
    };

    applyPersonaRetrievalContract(packet, 'archivist');

    expect(packet.workingMemory?.episodes).toHaveLength(1);
    expect(packet.workingMemory?.episodes[0].id).toBe('keep');
    expect(packet.sensemakingContract?.filteredItems).toBe(1);
  });
});

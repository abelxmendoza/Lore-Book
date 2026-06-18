import { describe, expect, it } from 'vitest';

import { buildAssistantPersistMetadata } from '../../src/services/chat/assistantPersistMetadata';

describe('buildAssistantPersistMetadata', () => {
  it('includes protocol fields when present', () => {
    const metadata = buildAssistantPersistMetadata({
      sources: [{ id: 'e1' }],
      mentionedEntities: [{ id: 'c1', name: 'Juan', type: 'character' }],
      creationOutcomes: [{ mention: 'Maria', action: 'defer' }],
      creationOutcomeSummary: 'needs clarification on Maria',
      staleProjectionHints: [{ id: 'bio-1', type: 'biography_snapshot' }],
      staleProjectionSummary: 'life summary outdated',
    });

    expect(metadata.creationOutcomes).toHaveLength(1);
    expect(metadata.creationOutcomeSummary).toBe('needs clarification on Maria');
    expect(metadata.staleProjectionHints).toHaveLength(1);
    expect(metadata.staleProjectionSummary).toBe('life summary outdated');
  });

  it('omits empty protocol fields', () => {
    const metadata = buildAssistantPersistMetadata({
      mentionedEntities: [],
      creationOutcomeSummary: null,
      staleProjectionSummary: null,
    });

    expect(metadata.creationOutcomes).toBeUndefined();
    expect(metadata.creationOutcomeSummary).toBeUndefined();
    expect(metadata.staleProjectionHints).toBeUndefined();
    expect(metadata.staleProjectionSummary).toBeUndefined();
  });
});

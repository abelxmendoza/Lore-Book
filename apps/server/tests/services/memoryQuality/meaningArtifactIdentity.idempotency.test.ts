import { describe, it, expect } from 'vitest';
import {
  buildMeaningFingerprint,
  normalizeMeaningValue,
} from '../../../src/services/memoryQuality/meaningArtifactIdentity';
import { extractMemoryQualityBundle } from '../../../src/services/memoryQuality/memoryQualityIntegrationService';

describe('meaning artifact idempotency model', () => {
  const text = `The situation with Jenna taught me that I need to respect people's boundaries. At the Catch One afterparty, one woman pulled away while we were dancing, so I stopped and gave her space.`;

  it('bundle extraction is pure and stable across two runs', () => {
    const a = extractMemoryQualityBundle(text);
    const b = extractMemoryQualityBundle(text);
    expect(a.meaning.lessons.map((l) => l.lesson)).toEqual(b.meaning.lessons.map((l) => l.lesson));
    expect(a.extractorVersion).toBe(b.extractorVersion);
  });

  it('fingerprints for replay map 1:1 without random ids', () => {
    const bundle = extractMemoryQualityBundle(text);
    const fps = bundle.meaning.nodes
      .filter((n) => n.kind === 'lesson' || n.kind === 'behavior_change')
      .map((n) =>
        buildMeaningFingerprint({
          userId: 'user-1',
          sourceMessageId: 'msg-1',
          meaningType: n.kind === 'lesson' ? 'lesson' : 'behavior_change',
          normalizedValue: normalizeMeaningValue(n.label),
        }),
      );
    const again = bundle.meaning.nodes
      .filter((n) => n.kind === 'lesson' || n.kind === 'behavior_change')
      .map((n) =>
        buildMeaningFingerprint({
          userId: 'user-1',
          sourceMessageId: 'msg-1',
          meaningType: n.kind === 'lesson' ? 'lesson' : 'behavior_change',
          normalizedValue: normalizeMeaningValue(n.label),
        }),
      );
    expect(fps).toEqual(again);
    // Logical uniqueness: set size is what the DB unique index enforces on upsert
    expect(new Set(fps).size).toBeGreaterThan(0);
    expect(new Set(fps).size).toBe(new Set(again).size);
  });
});

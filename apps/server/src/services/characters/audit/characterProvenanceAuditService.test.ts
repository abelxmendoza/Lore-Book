import { describe, expect, it } from 'vitest';
import type { CharacterCardAuditInput } from './characterCardAuditTypes';
import {
  applySourceMessageProvenance,
  extractProvenanceText,
  mergeProvenanceParts,
  summarizeProvenance,
} from './characterProvenanceAuditService';

function row(extra: Partial<CharacterCardAuditInput> = {}): CharacterCardAuditInput {
  return {
    id: '1',
    name: 'Jamie',
    alias: [],
    metadata: {},
    ...extra,
  };
}

describe('summarizeProvenance', () => {
  it('returns the full quote instead of slicing it', () => {
    const text =
      'Last night at Northwind Depot, Jamie the promoter and show host approached me with the other promoter Alex and asked if I could stay through the last set even though I had work in the morning at Vanguard Robotics.';
    expect(text.length).toBeGreaterThan(160);
    expect(summarizeProvenance(text)).toBe(text);
    expect(summarizeProvenance(text)).not.toMatch(/…$/);
  });

  it('still slices when a caller passes an explicit cap', () => {
    expect(summarizeProvenance('abcdefghij', 6)).toBe('abcde…');
  });
});

describe('mergeProvenanceParts', () => {
  it('drops a windowed snippet already covered by the full message', () => {
    const full =
      'Last night at Northwind Depot, Jamie the promoter approached me with Alex and asked me to host.';
    const windowed = '…Jamie the promoter approached me with Alex…';
    expect(mergeProvenanceParts([windowed, full])).toBe(full);
  });
});

describe('extractProvenanceText', () => {
  it('does not duplicate the same quote stored on the card twice', () => {
    const quote = 'I saw Jamie at the Northwind show.';
    expect(
      extractProvenanceText(
        row({
          contextOfMention: quote,
          metadata: { provenanceSummary: quote },
        }),
      ),
    ).toBe(quote);
  });

  it('prefers the hydrated full message over a stored windowed snippet', () => {
    const full =
      'Ink the promoter and show host approached me with the other promoter Alex after the Northwind set and asked if I could stay.';
    const windowed = '…Ink the promoter and show host approached me with the other promoter Alex…';
    const hydrated = applySourceMessageProvenance(
      row({
        contextOfMention: windowed,
        metadata: {
          provenanceSummary: windowed,
          sourceMessageIds: ['m1'],
        },
      }),
      new Map([['m1', full]]),
    );
    expect(extractProvenanceText(hydrated)).toBe(full);
  });
});

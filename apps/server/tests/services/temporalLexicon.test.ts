/**
 * Temporal lexicon — glossary SSOT + anchor resolution tests.
 */
import { describe, expect, it } from 'vitest';

import {
  detectTemporalSequenceMarkers,
  hasTemporalCue,
  resolveTextTemporalWindow,
  scanTemporalMentions,
  scanTemporalMentionsInTimezone,
} from '../../src/services/ontology/temporalLexicon';
import { temporalScanPhrases } from '../../src/services/ontology/glossary';

describe('temporalLexicon', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it('temporalScanPhrases includes glossary anchors', () => {
    const phrases = temporalScanPhrases().map((p) => p.phrase);
    expect(phrases).toContain('yesterday');
    expect(phrases).toContain('the other day');
    expect(phrases).toContain('last summer');
  });

  it('scanTemporalMentions resolves yesterday', () => {
    const mentions = scanTemporalMentions('I went to the gym yesterday.', now);
    expect(mentions.some((m) => m.phrase === 'yesterday' && m.window?.label === 'yesterday')).toBe(true);
  });

  it('resolveTextTemporalWindow picks last week', () => {
    const window = resolveTextTemporalWindow('What did I do last week?', now);
    expect(window?.label).toBe('last week');
    expect(window!.confidence).toBeGreaterThan(0.8);
  });

  it('detectTemporalSequenceMarkers finds narrative order cues', () => {
    const markers = detectTemporalSequenceMarkers('I left. Then I called her. Before that I had lunch.');
    expect(markers).toContain('then');
    expect(markers).toContain('before that');
  });

  it('hasTemporalCue is false for atemporal text', () => {
    expect(hasTemporalCue('I like sushi.')).toBe(false);
  });

  describe('scanTemporalMentionsInTimezone', () => {
    // 2026-06-18T04:00:00Z = June 17, 9pm in Los Angeles (PDT, UTC-7).
    const crossBoundaryNow = new Date('2026-06-18T04:00:00.000Z');
    const LA = 'America/Los_Angeles';

    function laDay(iso: string): string {
      return new Date(iso).toLocaleDateString('en-CA', { timeZone: LA });
    }

    it('resolves "yesterday" to the user\'s local calendar day', () => {
      const mentions = scanTemporalMentionsInTimezone('I went to the gym yesterday.', crossBoundaryNow, LA);
      const mention = mentions.find((m) => m.phrase === 'yesterday');
      expect(mention?.window).not.toBeNull();
      expect(laDay(mention!.window!.start.toISOString())).toBe('2026-06-16');
      expect(laDay(mention!.window!.end.toISOString())).toBe('2026-06-16');
    });

    it('matches the zone-naive scanner when timezone is UTC', () => {
      const withUtc = scanTemporalMentionsInTimezone('I went to the gym yesterday.', crossBoundaryNow, 'UTC');
      const naive = scanTemporalMentions('I went to the gym yesterday.', crossBoundaryNow);
      expect(withUtc.find((m) => m.phrase === 'yesterday')?.window?.start.toISOString()).toBe(
        naive.find((m) => m.phrase === 'yesterday')?.window?.start.toISOString(),
      );
    });

    it('matches the zone-naive scanner when timezone is null/undefined', () => {
      const withNull = scanTemporalMentionsInTimezone('I went to the gym yesterday.', crossBoundaryNow, null);
      const naive = scanTemporalMentions('I went to the gym yesterday.', crossBoundaryNow);
      expect(withNull.find((m) => m.phrase === 'yesterday')?.window?.start.toISOString()).toBe(
        naive.find((m) => m.phrase === 'yesterday')?.window?.start.toISOString(),
      );
    });

    it('preserves mentions with no resolvable window unchanged', () => {
      const mentions = scanTemporalMentionsInTimezone('I like sushi.', crossBoundaryNow, LA);
      expect(mentions).toEqual([]);
    });
  });
});

/**
 * Temporal lexicon — glossary SSOT + anchor resolution tests.
 */
import { describe, expect, it } from 'vitest';

import {
  detectTemporalSequenceMarkers,
  hasTemporalCue,
  resolveTextTemporalWindow,
  scanTemporalMentions,
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
});

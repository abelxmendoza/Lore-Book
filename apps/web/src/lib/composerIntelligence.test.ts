import { describe, expect, it, beforeEach } from 'vitest';
import {
  composerDraftIsAuthoritative,
  composerIntelligenceMetrics,
  composerPhaseAllowsEntityScan,
  composerPhaseAllowsRemoteCanon,
  getLatestRawComposerDraft,
  noteRawComposerDraft,
} from './composerIntelligence';

describe('composer intelligence authority', () => {
  beforeEach(() => {
    composerIntelligenceMetrics.reset();
    noteRawComposerDraft('');
  });

  it('treats keystroke and lightweight phases as non-canonical', () => {
    expect(composerDraftIsAuthoritative('keystroke')).toBe(false);
    expect(composerDraftIsAuthoritative('lightweight')).toBe(false);
    expect(composerPhaseAllowsRemoteCanon('keystroke')).toBe(false);
    expect(composerPhaseAllowsRemoteCanon('lightweight')).toBe(false);
    expect(composerPhaseAllowsRemoteCanon('authoritative')).toBe(true);
  });

  it('does not scan entities on the raw keystroke phase', () => {
    expect(composerPhaseAllowsEntityScan('keystroke')).toBe(false);
    expect(composerPhaseAllowsEntityScan('lightweight')).toBe(true);
  });

  it('keeps the latest raw draft off a render subscription', () => {
    noteRawComposerDraft('Maya met Priya at the show');
    expect(getLatestRawComposerDraft()).toBe('Maya met Priya at the show');
    expect(composerIntelligenceMetrics.snapshot().keystrokes).toBe(0);
  });
});

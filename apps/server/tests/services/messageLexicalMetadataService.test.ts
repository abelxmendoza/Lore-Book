import { describe, expect, it } from 'vitest';

import { buildMessageLexicalSignals } from '../../src/services/ontology/messageLexicalMetadataService';

describe('messageLexicalMetadataService', () => {
  it('returns null for empty text', () => {
    expect(buildMessageLexicalSignals('')).toBeNull();
  });

  it('captures social roles and discourse moves', () => {
    const signals = buildMessageLexicalSignals(
      'My bestie Maya has my back. Anyway, totally unrelated — I got ghosted last week.',
    );
    expect(signals).not.toBeNull();
    expect(signals!.social_roles.some((r) => r.role === 'close_friend')).toBe(true);
    expect(signals!.discourse_moves.some((d) => d.move === 'TANGENT' || d.move === 'SUBJECT_CHANGE')).toBe(true);
  });

  it('captures romantic ghosted and story stages', () => {
    const signals = buildMessageLexicalSignals(
      'It started when we matched. Then everything changed when he ghosted me. Looking back, I learned a lot.',
    );
    expect(signals).not.toBeNull();
    expect(signals!.romantic_signals.some((r) => r.status === 'ghosted')).toBe(true);
    expect(signals!.narrative_stages.length).toBeGreaterThanOrEqual(2);
    expect(signals!.is_story_block).toBe(true);
  });
});

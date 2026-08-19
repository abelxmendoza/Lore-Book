import { describe, expect, it } from 'vitest';

import type { CharacterCardAuditResult } from '../api/characterCardAudit';
import {
  buildCharacterCardAuditClipboardText,
  characterAuditSuggestedFix,
} from './characterCardAuditClipboard';

const jamie: CharacterCardAuditResult = {
  characterId: 'char-jamie',
  currentTitle: 'Jamie',
  status: 'valid_identity',
  reason: 'Person-shaped name with provenance',
  recommendedAction: 'keep',
  provenanceSummary: 'I saw Jamie at the Northwind show last weekend.',
};

const alex: CharacterCardAuditResult = {
  characterId: 'char-alex',
  currentTitle: 'Alex',
  status: 'contextual_character_needs_context',
  reason: "Contextual person — described as the other promoter Alex at an event.",
  recommendedAction: 'rename_with_context',
  suggestedTitle: 'Alex (promoter)',
  provenanceSummary: 'The other promoter Alex asked me to leave for safety.',
};

describe('characterCardAuditClipboard', () => {
  it('formats a suggested rename', () => {
    expect(characterAuditSuggestedFix(alex)).toBe('Alex (promoter)');
    expect(characterAuditSuggestedFix(jamie)).toBe('—');
  });

  it('copies the visible audit table as plain text', () => {
    const text = buildCharacterCardAuditClipboardText(
      {
        characterCount: 2,
        generatedAt: '2026-08-16T00:00:00.000Z',
        summary: {
          valid_identity: 1,
          valid_contextual_reference: 0,
          contextual_character_needs_context: 1,
          needs_context: 0,
          wrong_domain: 0,
          wrong_domain_tool: 0,
          wrong_domain_media: 0,
          wrong_domain_band: 0,
          wrong_domain_role: 0,
          wrong_domain_event: 0,
          wrong_domain_process: 0,
          wrong_domain_organization: 0,
          sentence_bleed: 0,
          pronoun_fragment: 0,
          broken_span: 0,
          duplicate_or_merge_candidate: 0,
          junk_test_data: 0,
          bare_title_invalid: 0,
          needs_identity_resolution: 0,
        },
      },
      [jamie, alex],
    );

    expect(text).toContain('Character card audit (2 items)');
    expect(text).toContain('Valid identity (1)');
    expect(text).toContain('Needs contextual rename (1)');
    expect(text).toContain('1. Jamie');
    expect(text).toContain('Status: Valid identity');
    expect(text).toContain('Provenance: I saw Jamie at the Northwind show last weekend.');
    expect(text).toContain('2. Alex');
    expect(text).toContain('Suggested fix: Alex (promoter)');
    expect(text).toContain('The other promoter Alex asked me to leave for safety.');
  });
});

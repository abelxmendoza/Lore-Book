/**
 * Identity gate for the character card audit.
 *
 * Hard rule under test: a phrase can have provenance and still not be a
 * character — provenance proves mention, not identity. These cases are the
 * exact false "Valid identity" results from the live audit.
 */
import { describe, it, expect } from 'vitest';

import { auditSingleCharacter } from './characterCardAuditService';
import {
  evaluateSentenceBleed,
  arbitrateDomainStrong,
  hasPersonNameShape,
} from './characterIdentityGate';
import type { CharacterCardAuditInput } from './characterCardAuditTypes';

function audit(name: string, provenance = '') {
  const input: CharacterCardAuditInput = {
    id: 'test-id',
    name,
    alias: [],
    metadata: {},
  };
  const provenanceById = new Map([['test-id', provenance]]);
  return auditSingleCharacter(input, [input], provenanceById);
}

describe('sentence bleed / pronoun fragments', () => {
  it('rejects "Also You" as sentence bleed', () => {
    const result = audit('Also You', 'Also you should come to the show.');
    expect(result.status).toBe('sentence_bleed');
    expect(result.recommendedAction).toBe('delete');
  });

  it('rejects a bare pronoun as pronoun fragment', () => {
    const result = audit('You');
    expect(result.status).toBe('pronoun_fragment');
    expect(result.recommendedAction).toBe('delete');
  });

  it('never flags first-person self cards ("Me")', () => {
    expect(evaluateSentenceBleed('Me').rejected).toBe(false);
    expect(evaluateSentenceBleed('I').rejected).toBe(false);
  });

  it('does not flag names that merely contain a connective-like token', () => {
    expect(evaluateSentenceBleed('Bill Skasby').rejected).toBe(false);
  });
});

describe('domain arbitration — Character loses to stronger domains', () => {
  it('routes "Background Check" to work process', () => {
    const result = audit('Background Check', 'My background check for the Ring job cleared.');
    expect(result.status).toBe('wrong_domain_process');
    expect(result.wrongDomainTarget).toBe('process');
  });

  it('routes "Claude Code" to tool/software', () => {
    const result = audit('Claude Code', 'I was using Claude Code to fix the parser.');
    expect(result.status).toBe('wrong_domain_tool');
    expect(result.wrongDomainTarget).toBe('tool');
  });

  it('routes "Los Skallejeros" to band/group', () => {
    const result = audit('Los Skallejeros', 'Los Skallejeros played the ska show.');
    expect(result.status).toBe('wrong_domain_band');
    expect(result.recommendedAction).toBe('move_to_group');
  });

  it('does not treat "Los Angeles" as a band', () => {
    expect(arbitrateDomainStrong('Los Angeles').domain).toBeNull();
  });

  it('routes "One Piece" to media/fandom', () => {
    const result = audit('One Piece', 'He has been watching One Piece for years.');
    expect(result.status).toBe('wrong_domain_media');
    expect(result.recommendedAction).toBe('move_to_interest');
  });

  it('routes "Quality Assurance Technician" to role even with first-person provenance', () => {
    const result = audit(
      'Quality Assurance Technician',
      'I work as a Quality Assurance Technician at Ring on the failure analysis team.',
    );
    expect(result.status).toBe('wrong_domain_role');
    expect(result.wrongDomainTarget).toBe('role');
  });

  it('keeps a role title only when provenance names a distinct person', () => {
    const result = arbitrateDomainStrong(
      'Quality Assurance Technician',
      'A guy named Marcus, his name came up as the technician on shift.',
    );
    expect(result.domain).toBeNull();
  });

  it('routes "Self Made" to event/show via provenance arbitration', () => {
    const result = audit('Self Made', 'Self Made was the show they performed at downtown.');
    expect(result.status).toBe('wrong_domain_event');
    expect(result.wrongDomainTarget).toBe('event');
  });

  it('name apposition beats other domain words in the same story (live provenance)', () => {
    const result = audit(
      'Self Made',
      'The other show was the “Self Made” show that the band Undisputed World Champions was throwing with Trinidad.',
    );
    expect(result.status).toBe('wrong_domain_event');
  });
});

describe('human-likeness gate', () => {
  it('keeps "Bill Skasby" as a valid person', () => {
    const result = audit('Bill Skasby', 'Bill Skasby is the ska artist whose print I bought.');
    expect(result.status).toBe('valid_identity');
    expect(result.recommendedAction).toBe('keep');
  });

  it('person-name shape accepts distinctive names and rejects title phrases', () => {
    expect(hasPersonNameShape('Bill Skasby')).toBe(true);
    expect(hasPersonNameShape('Shana')).toBe(true);
    expect(hasPersonNameShape('Tía Grace')).toBe(true);
    expect(hasPersonNameShape('Self Made')).toBe(false);
    expect(hasPersonNameShape('Background Check')).toBe(false);
    expect(hasPersonNameShape('One Piece')).toBe(false);
  });

  it('provenance alone is never enough — mention is not identity', () => {
    const result = audit('Good Times', 'It came up in the planning notes yesterday.');
    expect(result.status).toBe('needs_identity_resolution');
    expect(result.recommendedAction).toBe('needs_review');
    expect(result.status).not.toBe('valid_identity');
  });
});

describe('contextual people require contextual titles', () => {
  it('"potential investor" is valid only with the Antler context rename', () => {
    const withContext = audit(
      'potential investor',
      'Met a potential investor from Antler at the pitch event.',
    );
    expect(withContext.status).toBe('contextual_character_needs_context');
    expect(withContext.recommendedAction).toBe('rename_with_context');
    expect(withContext.suggestedTitle).toBe('Potential Investor from Antler');

    const withoutContext = audit('potential investor', 'Talked to a potential investor.');
    expect(withoutContext.status).toBe('needs_context');
    expect(withoutContext.status).not.toBe('valid_identity');
  });

  it('"friend of Shana" requires a contextual rename', () => {
    const result = audit('friend of Shana', 'Met a friend of Shana at the ska prom.');
    expect(result.status).toBe('contextual_character_needs_context');
    expect(result.recommendedAction).toBe('rename_with_context');
    expect(result.suggestedTitle).toContain("Shana's Friend");
    expect(result.status).not.toBe('valid_identity');
  });
});

import { describe, it, expect } from 'vitest';
import { parseComposerLexical, composerLexicalToMatches } from './lexicalComposerParse';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  {
    id: 'uuid-abel',
    name: 'Abel',
    type: 'character',
    aliases: [],
    mentionKeys: ['abel'],
    status: 'confirmed',
  },
];

const SAMPLE =
  'Abel Mendoza is my friend we grew up together in Anaheim and he went to the same school as me';

describe('parseComposerLexical', () => {
  it('splits Abel Mendoza friendship sentence into expected chips', () => {
    const parsed = parseComposerLexical(SAMPLE);
    expect(parsed.entities.some((e) => e.type === 'PERSON' && e.value === 'Abel Mendoza')).toBe(true);
    expect(parsed.entities.some((e) => e.type === 'PLACE' && e.value === 'Anaheim')).toBe(true);
    expect(parsed.entities.some((e) => e.type === 'SCHOOL' && e.value === 'same school')).toBe(true);
    expect(parsed.relationships).toContainEqual({
      subject: 'Abel Mendoza',
      relationship: 'friend',
      object: 'self',
    });
    expect(parsed.events.some((e) => e.type === 'shared_upbringing')).toBe(true);
    expect(parsed.ambiguities.some((a) => /same school/i.test(a))).toBe(true);
    expect(parsed.actionChips).toContain('Add person: Abel Mendoza');
    expect(parsed.actionChips).toContain('Set relationship: friend');
    expect(parsed.actionChips).toContain('Add shared place: Anaheim');
    expect(parsed.actionChips).toContain('Review school details');
    expect(parsed.actionChips.some((c) => /grew up together/i.test(c))).toBe(true);
  });

  it('maps to composer matches without creating a school entity chip', () => {
    const matches = composerLexicalToMatches(parseComposerLexical(SAMPLE), INDEX, []);
    const names = matches.map((m) => `${m.type}:${m.name}`);
    expect(names).toContain('character:Abel Mendoza');
    expect(names).toContain('location:Anaheim');
    expect(names.some((n) => n.startsWith('event:') && /friend/i.test(n))).toBe(true);
    expect(names.some((n) => n.startsWith('event:') && /grew up/i.test(n))).toBe(true);
    expect(names.some((n) => /school/i.test(n) && n.startsWith('location:'))).toBe(false);
    expect(matches.some((m) => m.composerChipKind === 'needs_clarification')).toBe(true);
  });
});

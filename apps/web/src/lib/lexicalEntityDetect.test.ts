import { describe, it, expect } from 'vitest';
import {
  analyzeLexicalOntology,
  detectLexicalDraftEntities,
  discoverLexicalRelationshipHints,
} from './lexicalEntityDetect';
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

describe('lexicalEntityDetect', () => {
  it('detects possessive dwelling locations from ontology', () => {
    const hits = analyzeLexicalOntology("We stayed at Abuela's house for the weekend");
    expect(hits.some((h) => h.type === 'location' && /Abuela's House/i.test(h.name))).toBe(true);
  });

  it('detects titled kinship names as character drafts', () => {
    const drafts = detectLexicalDraftEntities('My aunt Maribel brought tamales', INDEX, []);
    expect(drafts.some((d) => d.name === 'Maribel' && d.type === 'character')).toBe(true);
  });

  it('detects org cues from employment language', () => {
    const drafts = detectLexicalDraftEntities('I started working at Summit Staffing last month', INDEX, []);
    expect(drafts.some((d) => d.type === 'organization' && d.name.includes('Summit'))).toBe(true);
  });

  it('detects skill cues without LLM', () => {
    const drafts = detectLexicalDraftEntities('I have been learning muay thai twice a week', INDEX, []);
    expect(drafts.some((d) => d.type === 'skill' && /Muay Thai/i.test(d.name))).toBe(true);
  });

  it('emits relationship hints from glossary verbs', () => {
    const hints = discoverLexicalRelationshipHints('She is my girlfriend and we dated last night');
    expect(hints.some((h) => h.includes('ROMANTIC'))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildContextualReferenceTitle,
  extractContextSources,
  formatContextualTitle,
} from '../../../src/services/identity/contextualPersonReferenceService';

describe('contextualPersonReferenceService', () => {
  it('rejects bare Professor', () => {
    const result = buildContextualReferenceTitle({
      rolePhrase: 'Professor',
      text: 'The professor gave us homework.',
    });
    expect(result.rejected).toBe(true);
  });

  it('builds Professor from Japanese Class', () => {
    const result = buildContextualReferenceTitle({
      rolePhrase: 'professor',
      text: 'the professor from my Japanese Class assigned reading',
      contextSources: [{ kind: 'group', label: 'Japanese Class', rank: 3 }],
    });
    expect(result.rejected).toBe(false);
    expect(result.primaryTitle).toBe('Professor from Japanese Class');
  });

  it('extracts Antler organization context', () => {
    const sources = extractContextSources('potential investor from Antler saw my deck');
    expect(sources.some((s) => /antler/i.test(s.label))).toBe(true);
  });

  it('formats Amazon Recruiter org-first', () => {
    const title = formatContextualTitle('recruiter', {
      kind: 'organization',
      label: 'Amazon',
      rank: 1,
    });
    expect(title).toBe('Amazon Recruiter');
  });

  it('builds Leslie\'s Friend from relationship cluster', () => {
    const result = buildContextualReferenceTitle({
      rolePhrase: 'friend',
      text: "one of Leslie's friends came to the party",
      contextSources: [{ kind: 'relationship_cluster', label: "Leslie's Friend", rank: 5 }],
    });
    expect(result.rejected).toBe(false);
    expect(result.primaryTitle).toMatch(/Friend from Leslie/i);
  });

  it('rejects bare Guy without context', () => {
    const result = buildContextualReferenceTitle({
      rolePhrase: 'guy',
      text: 'some guy was there',
    });
    expect(result.rejected).toBe(true);
  });

  it('accepts Guy from Bad Dogg Compound with place context', () => {
    const result = buildContextualReferenceTitle({
      rolePhrase: 'guy',
      text: 'the guy from Bad Dogg Compound started the fight',
      contextSources: [{ kind: 'place', label: 'Bad Dogg Compound', rank: 4 }],
    });
    expect(result.rejected).toBe(false);
    expect(result.primaryTitle).toBe('Guy from Bad Dogg Compound');
  });
});

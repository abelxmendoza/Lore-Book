/**
 * Shared named-chat-subject helpers.
 */
import { describe, expect, it } from 'vitest';
import { parseNamedChatSubject, subjectNamesMatch } from './namedChatSubject';

describe('parseNamedChatSubject', () => {
  it('extracts a single-word name after "who is"', () => {
    expect(parseNamedChatSubject('Who is Maria?')).toBe('Maria');
  });

  it('extracts a multi-word name after "who\'s"', () => {
    expect(parseNamedChatSubject("Who's Maria Garcia?")).toBe('Maria Garcia');
  });

  it('returns null when there is no who-is/who\'s phrasing', () => {
    expect(parseNamedChatSubject('What happened yesterday?')).toBeNull();
  });

  it('does not match generic "about X" phrasing (that carries its own, more specific intent)', () => {
    expect(parseNamedChatSubject('What do you remember about Sam Chen?')).toBeNull();
    expect(parseNamedChatSubject('What do you know about Alex?')).toBeNull();
  });

  it('returns null for sentence-initial capitalization false positives', () => {
    expect(parseNamedChatSubject("Who's To blame here?")).toBeNull();
  });

  it('returns null for empty/whitespace input', () => {
    expect(parseNamedChatSubject('   ')).toBeNull();
    expect(parseNamedChatSubject('')).toBeNull();
  });
});

describe('subjectNamesMatch', () => {
  it('matches identical names case-insensitively', () => {
    expect(subjectNamesMatch('Maria', 'maria')).toBe(true);
  });

  it('matches on shared first name', () => {
    expect(subjectNamesMatch('Maria', 'Maria Garcia')).toBe(true);
  });

  it('matches via substring containment', () => {
    expect(subjectNamesMatch('Maria Garcia', 'Garcia')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(subjectNamesMatch('Maria', 'John')).toBe(false);
  });

  it('does not match empty strings', () => {
    expect(subjectNamesMatch('', 'Maria')).toBe(false);
    expect(subjectNamesMatch('Maria', '')).toBe(false);
  });
});

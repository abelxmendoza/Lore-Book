import { describe, expect, it } from 'vitest';
import {
  inferMentionLifecycleStatus,
  isTranscriptMentionWorthy,
} from './mentionLifecycle';

describe('mentionLifecycle — discourse markers', () => {
  it('ignores sentence-initial "Also" so it cannot become a composer chip', () => {
    expect(inferMentionLifecycleStatus('Also')).toBe('IGNORE');
    expect(isTranscriptMentionWorthy('Also')).toBe(false);
  });

  it('treats her friend as an unresolved mention, not a person chip', () => {
    expect(inferMentionLifecycleStatus('her friend')).toBe('UNRESOLVED');
    expect(isTranscriptMentionWorthy('her friend')).toBe(true);
  });

  it('ignores truncated kinship, tools, dates, and personas', () => {
    for (const name of [
      'Cousin in',
      'Sibling those',
      'Claude Code',
      'Codex',
      'Cursor',
      'therapist',
      'June 3rd 2026',
      'Memorial Day weekend',
      'her house',
      'Uncle',
      'current event',
      'Ex Lover',
      "Tío Ralph's",
    ]) {
      expect(inferMentionLifecycleStatus(name), name).toBe('IGNORE');
      expect(isTranscriptMentionWorthy(name), name).toBe(false);
    }
  });

  it('treats indefinite new-person refs as generic, not cast-worthy', () => {
    expect(inferMentionLifecycleStatus('new guy')).toBe('GENERIC');
    expect(isTranscriptMentionWorthy('new guy')).toBe(false);
  });
});

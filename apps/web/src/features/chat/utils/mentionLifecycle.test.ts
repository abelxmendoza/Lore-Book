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

  it('still treats real people as worthy', () => {
    expect(inferMentionLifecycleStatus('Marcus')).toBe('RESOLVED');
    expect(isTranscriptMentionWorthy('Marcus')).toBe(true);
  });
});

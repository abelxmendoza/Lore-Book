import { describe, expect, it } from 'vitest';

import { isPureReadOnlyKnowledgeQuery } from './readOnlyQueryPolicy';

describe('isPureReadOnlyKnowledgeQuery', () => {
  it('keeps explicit cognition and project-state questions out of memory ingestion', () => {
    expect(isPureReadOnlyKnowledgeQuery('Who has become more relevant in my life recently, and why?')).toBe(true);
    expect(isPureReadOnlyKnowledgeQuery('What is the current state of MemoVault, and what should I do next?')).toBe(true);
    expect(isPureReadOnlyKnowledgeQuery('What do you remember about me?')).toBe(true);
  });

  it('keeps mixed questions ingestible when they contain new autobiographical information', () => {
    expect(isPureReadOnlyKnowledgeQuery('I started a new job. What has changed recently?')).toBe(false);
    expect(isPureReadOnlyKnowledgeQuery('I met Jamie yesterday. Who is becoming more important?')).toBe(false);
  });

  it('does not suppress ordinary storytelling', () => {
    expect(isPureReadOnlyKnowledgeQuery('I went climbing with Jamie yesterday.')).toBe(false);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('./suggestionAttachApply', async () => {
  const actual = await vi.importActual<typeof import('./suggestionAttachApply')>('./suggestionAttachApply');
  return {
    ...actual,
    applyAttachPlan: vi.fn().mockResolvedValue(undefined),
  };
});

import { decideSuggestionCandidate } from './applySuggestionCandidate';
import {
  resetSuggestionWriteContextForTests,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function skill(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'skills', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

function project(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'projects', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

describe('skill vs project identity', () => {
  beforeEach(() => {
    resetSuggestionWriteContextForTests();
  });

  it('I learned Python attaches the skill, not a project', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'skills',
          name: 'Python',
          evidence: 'I learned Python',
          extractor: 'eval',
        }),
      { index: { skills: [skill({ id: 'sk-1', name: 'Python' })] }, status: 'ok' },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('sk-1');
  });

  it('explicit project called Python may create a project beside the skill', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'projects',
          name: 'Python',
          evidence: 'I built a project called Python',
          extractor: 'project_suggestion',
          writePolicy: 'user',
        }),
      { index: { skills: [skill({ id: 'sk-1', name: 'Python' })], projects: [] }, status: 'ok' },
    );
    expect(result.outcome).toBe('CREATED');
    expect(result.canonicalCreated).toBe(false);
  });

  it('user-created Project Python keeps project authority', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'projects',
          name: 'Python',
          evidence: 'Working on Python this weekend',
          extractor: 'project_suggestion',
        }),
      {
        index: {
          skills: [skill({ id: 'sk-1', name: 'Python' })],
          projects: [project({ id: 'p-1', name: 'Python' })],
        },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('p-1');
    expect(result.canonical?.domain).toBe('projects');
  });

});

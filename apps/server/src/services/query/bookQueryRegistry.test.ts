import { describe, expect, it } from 'vitest';

import type { UniversalBookQueryRequest, UniversalBookQueryResult } from '@lorebook/api-contracts';

import {
  buildBookQueryConnections,
  inferBookQueryIntent,
  selectBookQueryDomains,
} from './bookQueryRegistry';

const request = (query: string, domains?: UniversalBookQueryRequest['domains']): UniversalBookQueryRequest => ({
  query,
  domains,
  limit: 50,
  perDomainLimit: 12,
  includeEvidence: true,
});

describe('book query registry', () => {
  it('selects multiple relevant books for a cross-book question', () => {
    expect(selectBookQueryDomains(request('What skills support my active quests?'))).toEqual([
      'skill',
      'quest',
    ]);
  });

  it('honors an explicit domain scope', () => {
    expect(selectBookQueryDomains(request('show active records', ['project']))).toEqual(['project']);
  });

  it('classifies multi-book requests as cross-book queries', () => {
    expect(inferBookQueryIntent('What skills support my quests?', ['skill', 'quest'])).toBe('cross_book');
  });

  it('connects normalized results through stable ids or canonical names', () => {
    const rows: UniversalBookQueryResult[] = [
      {
        id: 'skill-1',
        domain: 'skill',
        title: 'TypeScript',
        score: 10,
        matchedReasons: ['match'],
        evidence: [],
        relatedEntities: [{ domain: 'project', name: 'MemoVault', relation: 'used by project' }],
      },
      {
        id: 'project-1',
        domain: 'project',
        title: 'MemoVault',
        score: 10,
        matchedReasons: ['match'],
        evidence: [],
        relatedEntities: [],
      },
    ];

    expect(buildBookQueryConnections(rows)).toEqual([
      {
        fromId: 'skill-1',
        toId: 'project-1',
        relation: 'used by project',
        reason: 'TypeScript is connected to MemoVault',
      },
    ]);
  });
});

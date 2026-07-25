import { describe, expect, it } from 'vitest';

import {
  buildRetellingRecallBlock,
  isRetellingRecallMessage,
  rankPriorRetellings,
  scoreRetellingSimilarity,
} from '../../src/services/chat/retellingRecallService';

const current =
  'I bought a microphone and an audio interface to record music. My new stage name is Night Signal. ' +
  'I made the songs Glass Harbor and Static Rooms and posted them online. This is a repeated story, do you remember?';

describe('retellingRecallService', () => {
  it('detects a substantive story followed by a memory check', () => {
    expect(isRetellingRecallMessage(current)).toBe(true);
    expect(isRetellingRecallMessage('Do you remember?')).toBe(false);
  });

  it('ranks a prior telling above unrelated autobiographical text', () => {
    const matches = rankPriorRetellings(current, [
      {
        id: 'prior-story',
        content:
          'I bought my microphone and audio interface for recording. I started using Night Signal as my stage name and posted Glass Harbor and Static Rooms online.',
        created_at: '2026-07-01T00:00:00.000Z',
        session_id: 'older-thread',
      },
      {
        id: 'unrelated',
        content:
          'I worked on a robotics investigation and wrote a report about a battery test at the lab.',
        created_at: '2026-06-01T00:00:00.000Z',
        session_id: 'work-thread',
      },
    ]);
    expect(matches.map((match) => match.id)).toEqual(['prior-story']);
    expect(matches[0]?.similarity).toBeGreaterThan(0.5);
  });

  it('requires evidence before telling the model to claim recognition', () => {
    const noMatch = buildRetellingRecallBlock(current, []);
    expect(noMatch).toContain('Do not claim you remember');

    const { score, sharedTerms } = scoreRetellingSimilarity(
      current,
      'I bought a microphone and audio interface and recorded music as Night Signal.',
    );
    const matched = buildRetellingRecallBlock(current, [
      {
        id: 'prior-story',
        content: 'I bought a microphone and audio interface and recorded music as Night Signal.',
        createdAt: '2026-07-01T00:00:00.000Z',
        sessionId: 'older-thread',
        similarity: score,
        sharedTerms,
      },
    ]);
    expect(matched).toContain('MATCHED PRIOR USER RECORDS');
    expect(matched).toContain('message=prior-story');
  });
});

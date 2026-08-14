import { describe, expect, it } from 'vitest';

import { isCanonicalLifeEpisode } from '../../../src/services/conversationCentered/episodeProjectionPolicy';
import { extractNarrativeRelations } from '../../../src/services/timeline/narrativeRelationExtractor';
import { extractTemporalRelations } from '../../../src/services/timeline/temporalRelationExtractor';
import { mergeRelationProvenance } from '../../../src/services/timeline/relationProvenance';
import { stitchTimelineFromMessage } from '../../../src/services/timeline/timelineStitchingService';
import type { StitchAttachmentTarget } from '../../../src/services/timeline/timelineStitchingTypes';

const USER = 'synthetic-user';
const candidates: StitchAttachmentTarget[] = [
  { attachedToType: 'skill', attachedToId: 'karate', attachedToLabel: 'Karate', confidence: 0.95 },
  { attachedToType: 'skill', attachedToId: 'muay-thai', attachedToLabel: 'Muay Thai', confidence: 0.95 },
  { attachedToType: 'project', attachedToId: 'memovault', attachedToLabel: 'MemoVault', confidence: 0.95 },
];

describe('cross-thread canonical chronology', () => {
  it('reuses one temporal edge identity across separate chat threads', () => {
    const first = extractTemporalRelations({
      text: 'Karate was before Muay Thai.', userId: USER, sourceMessageId: 'message-a',
      sourceThreadId: 'thread-a', conversationTime: '2026-08-12T10:00:00.000Z', candidates,
    });
    const second = extractTemporalRelations({
      text: 'Karate came before Muay Thai.', userId: USER, sourceMessageId: 'message-b',
      sourceThreadId: 'thread-b', conversationTime: '2026-08-13T10:00:00.000Z', candidates,
    });

    expect(first[0].id).toBe(second[0].id);
    expect(first[0].sourceMessageIds).toEqual(['message-a']);
    expect(second[0].sourceThreadIds).toEqual(['thread-b']);
  });

  it('accumulates provenance from both threads without duplicating the edge', () => {
    const merged = mergeRelationProvenance(
      {
        source_message_id: 'message-a', source_message_ids: ['message-a'],
        source_thread_ids: ['thread-a'], evidence_phrase: 'Karate was before Muay Thai.',
      },
      {
        sourceMessageIds: ['message-b'], sourceThreadIds: ['thread-b'], sourceAssertionIds: [],
        evidencePhrase: 'Karate came before Muay Thai.',
      },
    );
    expect(merged.sourceMessageIds).toEqual(['message-a', 'message-b']);
    expect(merged.sourceThreadIds).toEqual(['thread-a', 'thread-b']);
    expect(merged.evidencePhrase).toContain('Karate was before Muay Thai.');
    expect(merged.evidencePhrase).toContain('Karate came before Muay Thai.');
  });

  it('keeps conversation, life, and knowledge clocks separate', () => {
    const result = stitchTimelineFromMessage({
      text: 'I started MemoVault in 2019.', userId: USER, sourceMessageId: 'message-2026',
      sourceThreadId: 'thread-2026', messageTimestamp: '2026-08-13T10:00:00.000Z',
      knowledgeTimestamp: '2026-08-13T10:00:02.000Z', attachmentCandidates: candidates,
    });
    const anchor = result.anchors.find((item) => item.attachedToLabel === 'MemoVault');

    expect(anchor?.normalizedTime?.startDate).toBe('2019-01-01T00:00:00.000Z');
    expect(anchor?.conversationTime).toBe('2026-08-13T10:00:00.000Z');
    expect(anchor?.knowledgeTime).toBe('2026-08-13T10:00:02.000Z');
  });

  it('stores autobiographical beginning separately from objective order', () => {
    const narrative = extractNarrativeRelations({
      text: 'I consider Muay Thai the real beginning of my martial arts journey.',
      userId: USER, sourceMessageId: 'message-a', sourceThreadId: 'thread-a', candidates,
    });
    expect(narrative[0]).toMatchObject({
      relation: 'CONSIDERED_BEGINNING_OF',
      source: { attachedToLabel: 'Muay Thai' },
      target: { attachedToLabel: 'my martial arts journey' },
    });
  });

  it('does not create a narrative edge from a later recall question', () => {
    expect(extractNarrativeRelations({
      text: 'Why do I consider Muay Thai the real beginning of my martial arts journey?',
      userId: USER, sourceMessageId: 'message-b', sourceThreadId: 'thread-b', candidates,
    })).toEqual([]);
  });

  it('keeps a generic thread-start marker out of life chronology', () => {
    expect(isCanonicalLifeEpisode({ title: 'Thread start', boundary_reason: 'thread-start', source_event_ids: [] })).toBe(false);
    expect(isCanonicalLifeEpisode({ title: 'MemoVault launch', boundary_reason: 'thread-start', source_event_ids: ['event-1'] })).toBe(true);
  });
});

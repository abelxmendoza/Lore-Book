import { describe, it, expect } from 'vitest';

import { retrieveMemories } from '../../../src/services/retrieval/memoryRetrievalService';
import { importantCanonBeatsRecentWeak } from '../../../src/services/retrieval/retrievalRankingService';
import { allResultsHaveProvenance } from '../../../src/services/retrieval/retrievalProvenanceBinder';
import type {
  MemoryRetrievalCorpus,
  RetrievalMemoryRecord,
} from '../../../src/services/retrieval/retrievalTypes';

function mem(partial: Partial<RetrievalMemoryRecord> & Pick<RetrievalMemoryRecord, 'id' | 'text'>): RetrievalMemoryRecord {
  return {
    kind: 'journal_entry',
    entityIds: [],
    entityNames: [],
    anchorIds: [],
    anchorTitles: [],
    eraLabels: [],
    relationshipLabels: [],
    semanticScore: 0.5,
    emotionalWeight: 0.3,
    relationshipStrength: 0.3,
    narrativeGravity: 0.3,
    recencyScore: 0.5,
    frequency: 1,
    provenance: {
      sourceQuote: partial.text,
      truthState: 'candidate',
      confidence: 0.8,
    },
    sensitiveCategories: [],
    createdAt: '2024-01-01T00:00:00Z',
    ...partial,
  };
}

function buildFixtureCorpus(): MemoryRetrievalCorpus {
  const bryanId = 'ent-bryan';
  const oscarId = 'ent-oscar';
  const alexWorkId = 'ent-alex-work';
  const alexAliasId = 'ent-alex-alias';
  const anchorMiddleSchool = 'anchor-middle-school';
  const anchorBand = 'anchor-school-band';
  const anchorMeridian = 'anchor-meridian-work';

  return {
    entities: [
      { id: bryanId, name: 'Bryan Oconner', aliases: ['Bryan'], entityType: 'character' },
      { id: oscarId, name: 'Oscar', aliases: [], entityType: 'character' },
      { id: alexWorkId, name: 'Alex Kim', aliases: ['Alex from work'], entityType: 'character' },
      { id: alexAliasId, name: 'Alex Rivera', aliases: ['Alex', 'Rivera'], entityType: 'character' },
    ],
    anchors: [
      {
        id: anchorMiddleSchool,
        title: 'Middle School Era',
        anchorType: 'school_era',
        entityIds: [bryanId],
        activities: ['Northwind Middle School'],
      },
      {
        id: anchorBand,
        title: 'School Band',
        anchorType: 'recurring_activity',
        entityIds: [bryanId],
        activities: ['Wednesday Practice'],
      },
      {
        id: anchorMeridian,
        title: 'Meridian Robotics Era',
        anchorType: 'work_era',
        entityIds: [],
        activities: ['navigation stacks'],
      },
    ],
    records: [
      mem({
        id: 'mem-bryan-best-friend',
        text: 'Bryan Oconner is my best friend from middle school band.',
        entityIds: [bryanId],
        entityNames: ['Bryan Oconner'],
        anchorIds: [anchorMiddleSchool, anchorBand],
        anchorTitles: ['Middle School Era', 'School Band'],
        eraLabels: ['middle school'],
        relationshipLabels: ['best friend', 'bandmate'],
        relationshipStrength: 0.9,
        narrativeGravity: 0.85,
        emotionalWeight: 0.7,
        provenance: {
          sourceMessageId: 'msg-1',
          sourceQuote: 'Bryan Oconner is my best friend from middle school band.',
          truthState: 'user_confirmed',
          confidence: 0.95,
        },
      }),
      mem({
        id: 'mem-bryan-rejected',
        text: 'Bryan was my enemy in middle school.',
        entityIds: [bryanId],
        entityNames: ['Bryan Oconner'],
        provenance: {
          sourceMessageId: 'msg-x',
          sourceQuote: 'Bryan was my enemy in middle school.',
          truthState: 'rejected',
          confidence: 0.2,
        },
      }),
      mem({
        id: 'mem-bryan-old-name',
        text: 'Person name is Bryan Oconner',
        entityIds: [bryanId],
        entityNames: ['Bryan Oconner'],
        supersededById: 'mem-bryan-corrected-name',
        provenance: {
          sourceMessageId: 'msg-old',
          sourceQuote: 'Bryan Oconner is my best friend.',
          truthState: 'archived',
          confidence: 0.7,
        },
      }),
      mem({
        id: 'mem-bryan-corrected-name',
        text: "Person name is Bryan O'Connor",
        entityIds: [bryanId],
        entityNames: ["Bryan O'Connor"],
        correctedFromId: 'mem-bryan-old-name',
        provenance: {
          sourceMessageId: 'msg-correct',
          sourceQuote: "Actually his name is Bryan O'Connor.",
          truthState: 'user_confirmed',
          confidence: 0.98,
        },
      }),
      mem({
        id: 'mem-sensitive-fight',
        text: 'Jamie and I had a huge fight about money.',
        entityNames: ['Jamie'],
        sensitiveCategories: ['romantic', 'conflict', 'finance'],
        provenance: {
          sourceMessageId: 'msg-sens',
          sourceQuote: 'Jamie and I had a huge fight about money.',
          truthState: 'review_required',
          confidence: 0.72,
        },
      }),
      mem({
        id: 'mem-meridian-work',
        text: 'I worked at Meridian Robotics on navigation stacks.',
        anchorIds: [anchorMeridian],
        anchorTitles: ['Meridian Robotics Era'],
        eraLabels: ['Meridian Robotics era', 'work era'],
        narrativeGravity: 0.8,
        provenance: {
          sourceMessageId: 'msg-work',
          sourceQuote: 'I worked at Meridian Robotics on navigation stacks.',
          truthState: 'user_confirmed',
          confidence: 0.93,
        },
      }),
      mem({
        id: 'mem-oscar-dormant',
        text: "Oscar and I haven't talked since before covid — dormant friendship.",
        entityIds: [oscarId],
        entityNames: ['Oscar'],
        eraLabels: ['before covid'],
        relationshipLabels: ['dormant friendship'],
        relationshipStrength: 0.75,
        narrativeGravity: 0.7,
        provenance: {
          sourceMessageId: 'msg-oscar',
          sourceQuote: "Oscar and I haven't talked since before covid.",
          truthState: 'user_confirmed',
          confidence: 0.9,
        },
      }),
      mem({
        id: 'mem-canon-old-important',
        text: 'Bryan and I played trumpet at every school band concert.',
        entityIds: [bryanId],
        entityNames: ['Bryan Oconner'],
        anchorIds: [anchorBand],
        narrativeGravity: 0.92,
        emotionalWeight: 0.85,
        recencyScore: 0.2,
        frequency: 4,
        provenance: {
          sourceMessageId: 'msg-band',
          sourceQuote: 'Bryan and I played trumpet at every school band concert.',
          truthState: 'user_confirmed',
          confidence: 0.96,
        },
      }),
      mem({
        id: 'mem-recent-weak',
        text: 'I think I saw someone who looked like Bryan yesterday.',
        entityIds: [bryanId],
        entityNames: ['Bryan'],
        recencyScore: 0.95,
        narrativeGravity: 0.15,
        emotionalWeight: 0.1,
        frequency: 1,
        provenance: {
          sourceMessageId: 'msg-recent',
          sourceQuote: 'I think I saw someone who looked like Bryan yesterday.',
          truthState: 'inferred',
          confidence: 0.42,
        },
      }),
      mem({
        id: 'mem-alex-work',
        text: 'Alex Kim from work helped me ship the release.',
        entityIds: [alexWorkId],
        entityNames: ['Alex Kim'],
      }),
      mem({
        id: 'mem-alex-alias',
        text: 'Alex Rivera is my cousin from Riverside.',
        entityIds: [alexAliasId],
        entityNames: ['Alex Rivera'],
      }),
    ],
  };
}

describe('memory retrieval rules', () => {
  const corpus = buildFixtureCorpus();

  it('Bryan retrieves school/band anchor', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Tell me about Bryan' }, corpus);
    expect(result.entities.some((e) => e.name.includes('Bryan'))).toBe(true);
    expect(result.anchors.some((a) => a.title === 'Middle School Era')).toBe(true);
    expect(result.anchors.some((a) => a.title === 'School Band')).toBe(true);
    expect(result.memories.some((m) => m.retrievalReasons.includes('narrative_anchor'))).toBe(true);
  });

  it('rejected facts are filtered out', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Bryan middle school' }, corpus);
    expect(result.filteredRejected).toBeGreaterThan(0);
    expect(result.memories.every((m) => m.provenance.truthState !== 'rejected')).toBe(true);
    expect(result.memories.some((m) => m.record.text.includes('enemy'))).toBe(false);
  });

  it('corrected fact wins', () => {
    const result = retrieveMemories({ userId: 'u1', query: "Bryan O'Connor" }, corpus);
    const corrected = result.memories.find((m) => m.record.id === 'mem-bryan-corrected-name');
    expect(corrected).toBeDefined();
    expect(result.memories.some((m) => m.record.id === 'mem-bryan-old-name')).toBe(false);
    expect(result.filteredSuperseded).toBeGreaterThan(0);
  });

  it('sensitive facts are careful/review-aware', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Jamie fight money' }, corpus);
    const sensitive = result.memories.find((m) => m.record.id === 'mem-sensitive-fight');
    expect(sensitive).toBeDefined();
    expect(sensitive!.carefulPhrasing).toBe(true);
    expect(sensitive!.provenance.truthState).toBe('review_required');
  });

  it('ambiguous Alex returns multiple candidates', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'What about Alex?' }, corpus);
    expect(result.ambiguousEntities.length).toBeGreaterThan(1);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationPrompt).toMatch(/Alex/);
  });

  it('Meridian query retrieves work era', () => {
    const result = retrieveMemories(
      { userId: 'u1', query: 'when I worked at Meridian Robotics' },
      corpus,
    );
    expect(result.memories.some((m) => m.record.id === 'mem-meridian-work')).toBe(true);
    expect(result.memories.some((m) => m.retrievalReasons.includes('timeline_era'))).toBe(true);
  });

  it('before covid retrieves Oscar dormant friendship', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'before covid friendships' }, corpus);
    const oscar = result.memories.find((m) => m.record.id === 'mem-oscar-dormant');
    expect(oscar).toBeDefined();
    expect(oscar!.record.relationshipLabels).toContain('dormant friendship');
  });

  it('narrative gravity boosts important old memory', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Bryan trumpet school band concert' }, corpus);
    const canon = result.memories.find((m) => m.record.id === 'mem-canon-old-important');
    const recent = result.memories.find((m) => m.record.id === 'mem-recent-weak');
    expect(canon).toBeDefined();
    expect(recent).toBeDefined();
    expect(importantCanonBeatsRecentWeak(canon!, recent!)).toBe(true);
    expect(result.memories[0].record.id).toBe('mem-canon-old-important');
  });

  it('recent weak memory does not outrank important canon', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Bryan' }, corpus);
    const canonIdx = result.memories.findIndex((m) => m.record.id === 'mem-canon-old-important');
    const recentIdx = result.memories.findIndex((m) => m.record.id === 'mem-recent-weak');
    expect(canonIdx).toBeGreaterThan(-1);
    expect(recentIdx).toBeGreaterThan(-1);
    expect(canonIdx).toBeLessThan(recentIdx);
  });

  it('provenance included', () => {
    const result = retrieveMemories({ userId: 'u1', query: 'Bryan best friend' }, corpus);
    expect(result.memories.length).toBeGreaterThan(0);
    expect(allResultsHaveProvenance(result.memories)).toBe(true);
    expect(result.memories[0].provenance.sourceMessageId).toBeTruthy();
    expect(result.memories[0].provenance.sourceQuote).toBeTruthy();
  });
});

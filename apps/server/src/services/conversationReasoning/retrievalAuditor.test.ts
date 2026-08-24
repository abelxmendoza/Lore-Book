import { describe, it, expect } from 'vitest';
import { auditWorkingMemoryAssembly } from './retrievalAuditor';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';

function item(overrides: Partial<WorkingMemoryItem>): WorkingMemoryItem {
  return {
    id: overrides.id ?? 'item-1',
    type: overrides.type ?? 'episode',
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    source: 'test',
    confidence: 0.8,
    score: overrides.score ?? 50,
    reasons: overrides.reasons ?? [],
    ...overrides,
  };
}

function assembly(items: Partial<Record<'episodes' | 'events', WorkingMemoryItem[]>>): WorkingMemoryAssembly {
  return {
    intent: 'PERSON_QUERY',
    contextPlan: { version: 'context-assembly-v1', primary: 'general' as never, secondary: [], excluded: [], ranked: [], reason: 'test', strictBoundary: false },
    contextDiagnostics: {
      candidatesConsidered: 0,
      accepted: 0,
      prunedForDrift: 0,
      coverageEstimate: 0,
      confidenceEstimate: 0,
      completenessEstimate: 0,
      newestEvidenceAt: null,
    },
    entities: [],
    episodes: items.episodes ?? [],
    events: items.events ?? [],
    projects: [],
    goals: [],
    skills: [],
    communities: [],
    relationships: [],
    preferences: [],
    claims: [],
    timeline: [],
    confidence: 0.5,
    budget: { maxItems: 20, selected: (items.episodes?.length ?? 0) + (items.events?.length ?? 0), rejected: 0 },
    rejected: [],
    factsCoveredEntityIds: [],
  } as unknown as WorkingMemoryAssembly;
}

function scopePlan(overrides: Partial<ResponseScopePlan> = {}): ResponseScopePlan {
  return {
    intent: 'work',
    contextPlan: { version: 'context-assembly-v1', primary: 'general' as never, secondary: [], excluded: [], ranked: [], reason: 'test', strictBoundary: false },
    responseMode: 'chat',
    scopeSource: 'message',
    allowedDomains: [],
    blockedDomains: [],
    primaryEntities: [],
    isCorrection: false,
    correctionNames: [],
    maxEvidenceItems: 20,
    maxCharactersReturned: 4000,
    includeProvenanceSummary: false,
    includeUncertainty: false,
    closedScope: false,
    ...overrides,
  };
}

describe('auditWorkingMemoryAssembly', () => {
  it('discards an item whose content belongs to a forbidden domain for the question', () => {
    const a = assembly({
      events: [
        item({
          id: 'romance-1',
          type: 'event',
          title: 'Date night',
          content: 'Went on a romantic date night with my girlfriend downtown.',
        }),
      ],
    });
    const result = auditWorkingMemoryAssembly(a, 'what am i building lately', scopePlan());
    expect(result.discarded).toBe(1);
    expect(result.assembly.events).toHaveLength(0);
    const rejected = result.assembly.rejected.find((r) => r.id === 'romance-1');
    expect(rejected?.rejectedReason).toBe('retrieval_audit:forbidden_evidence_kind');
  });

  it('keeps a well-scored item that supports the question', () => {
    const a = assembly({
      events: [
        item({
          id: 'work-1',
          type: 'event',
          title: 'Promotion',
          content: 'Got promoted at work after the big project shipped.',
        }),
      ],
    });
    const result = auditWorkingMemoryAssembly(a, 'what is my job like these days', scopePlan());
    expect(result.discarded).toBe(0);
    expect(result.assembly.events).toHaveLength(1);
  });

  it('discards a closed-scope query item with no entity link', () => {
    const a = assembly({
      episodes: [item({ id: 'unlinked-1', title: 'Random note', content: 'Something unrelated happened once.' })],
    });
    const result = auditWorkingMemoryAssembly(
      a,
      'who is new and returning in this story?',
      scopePlan({ closedScope: true }),
    );
    expect(result.discarded).toBe(1);
    const rejected = result.assembly.rejected.find((r) => r.id === 'unlinked-1');
    expect(rejected?.rejectedReason).toContain('current_story_entity_mismatch');
  });

  it('passes everything through untouched in audit/debug_inspector response modes', () => {
    const a = assembly({
      episodes: [item({ id: 'raw-1', title: 'Anything', content: 'Anything at all.' })],
    });
    const result = auditWorkingMemoryAssembly(a, 'show me the debug inspector', scopePlan({ responseMode: 'audit' }));
    expect(result.discarded).toBe(0);
    expect(result.assembly.episodes).toHaveLength(1);
  });
});

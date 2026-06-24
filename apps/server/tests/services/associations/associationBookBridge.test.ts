/**
 * Association → Books bridge — verifies evidence-earned outputs are routed into
 * the confirm-before-truth pipelines, and that nothing routes when there's
 * nothing earned (no mention→group jump).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertFromInference = vi.fn().mockResolvedValue(true);
const ingestExternalDetections = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/services/organizations/organizationSuggestionService', () => ({
  organizationSuggestionService: { upsertFromInference },
}));
vi.mock('../../../src/services/groupCandidateService', () => ({
  groupCandidateService: { ingestExternalDetections },
}));
vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { associationBookBridge } from '../../../src/services/associations/associationBookBridge';
import type { IngestResult } from '../../../src/services/associations';

function emptyResult(): IngestResult {
  return { observations: [], rulesFired: [], promotions: [], groups: [] };
}

beforeEach(() => {
  upsertFromInference.mockClear();
  ingestExternalDetections.mockClear();
});

describe('associationBookBridge.route', () => {
  it('routes an explicit member_of edge to an organization suggestion', async () => {
    const result: IngestResult = {
      ...emptyResult(),
      observations: [
        {
          source: { id: 'self', name: 'Self', kind: 'person' },
          target: { id: 'org-vanguard', name: 'Vanguard Robotics', kind: 'organization' },
          associationType: 'member_of',
          explicit: true,
          evidence: { quote: 'I work at Vanguard Robotics', timestamp: new Date().toISOString(), rulesFired: ['semantic:works_at→member_of'], confidence: 0.95 },
        },
      ],
    };

    const out = await associationBookBridge.route('u1', result, 'm1');

    expect(out.organizationSuggestions).toBe(1);
    expect(upsertFromInference).toHaveBeenCalledTimes(1);
    const [, candidate] = upsertFromInference.mock.calls[0];
    expect(candidate.displayName).toBe('Vanguard Robotics');
    expect(candidate.organizationType).toBe('employer');
    expect(candidate.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('routes a community group candidate to the group review queue', async () => {
    const result: IngestResult = {
      ...emptyResult(),
      groups: [
        {
          kind: 'community',
          name: 'Ska Scene Community',
          memberIds: ['char-a', 'char-b', 'char-c'],
          memberNames: ['A', 'B', 'C'],
          sharedAnchors: ['Club Nova'],
          observations: 14,
          reason: '3 recurring people + 1 shared anchor + 14 observations',
        },
      ],
    };

    const out = await associationBookBridge.route('u1', result, 'm2');

    expect(out.groupCandidates).toBe(1);
    expect(ingestExternalDetections).toHaveBeenCalledTimes(1);
    const [, detected] = ingestExternalDetections.mock.calls[0];
    expect(detected).toHaveLength(1);
    expect(detected[0].group_type).toBe('community');
    expect(detected[0].member_ids).toEqual(['char-a', 'char-b', 'char-c']);
  });

  it('routes nothing when there are no earned memberships or groups', async () => {
    const out = await associationBookBridge.route('u1', emptyResult(), 'm3');
    expect(out).toEqual({ organizationSuggestions: 0, groupCandidates: 0 });
    expect(upsertFromInference).not.toHaveBeenCalled();
    expect(ingestExternalDetections).not.toHaveBeenCalled();
  });

  it('does NOT route a non-explicit member_of (provisional ids filtered)', async () => {
    const result: IngestResult = {
      ...emptyResult(),
      observations: [
        {
          source: { id: 'self', name: 'Self', kind: 'person' },
          target: { id: 'prov:group:maybe-club', name: 'Maybe Club', kind: 'group' },
          associationType: 'member_of',
          explicit: false,
          evidence: { quote: 'x', timestamp: new Date().toISOString(), rulesFired: [], confidence: 0.5 },
        },
      ],
    };
    const out = await associationBookBridge.route('u1', result, 'm4');
    expect(out.organizationSuggestions).toBe(0);
    expect(upsertFromInference).not.toHaveBeenCalled();
  });
});

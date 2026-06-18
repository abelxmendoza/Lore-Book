import { describe, expect, it } from 'vitest';

import { buildPersonaEvidenceBlock } from '../../../src/services/agents/loreAgentEvidenceBuilder';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'test',
    resolvedEntities: [],
    resolvedRelationships: [],
    resolvedSkills: [],
    resolvedPlaces: [],
    resolvedEvents: [],
    references: [],
    identityCollisions: [],
    contradictions: [],
    ambiguities: [],
    temporalContext: { defaultStatus: 'present', statements: [] },
    factuality: 'fact',
    confidence: 0.9,
    ontologyActionCandidates: [],
    memoryReviewCandidates: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePipeline(meaning: MeaningResolutionResult): LoreInterpretationResult {
  return {
    lexical: { messageId: meaning.messageId, userId: meaning.userId } as LoreInterpretationResult['lexical'],
    meaning,
  };
}

describe('buildPersonaEvidenceBlock', () => {
  it('returns null for personas with optional evidence policy', () => {
    const block = buildPersonaEvidenceBlock({
      personaId: 'therapist',
      pipelineResult: makePipeline(
        makeMeaning({
          memoryReviewCandidates: [{ claim: 'x', category: 'skill', confidence: 0.9, provenance: [] }],
        })
      ),
    });
    expect(block).toBeNull();
  });

  it('builds evidence for strategist with memory and contradiction signals', () => {
    const block = buildPersonaEvidenceBlock({
      personaId: 'strategist',
      pipelineResult: makePipeline(
        makeMeaning({
          memoryReviewCandidates: [{ claim: 'Started cello in 2019', category: 'skill', confidence: 0.88, provenance: [] }],
          contradictions: [
            {
              field: 'location',
              existingFact: 'Boston',
              newClaim: 'New York',
              severity: 'medium',
              entityId: 'e1',
            },
          ],
        })
      ),
    });

    expect(block).toContain('LOREBOOK EVIDENCE');
    expect(block).toContain('cello');
    expect(block).toContain('Contradiction');
    expect(block).toContain('Prefer citing');
  });

  it('requires citation language for must_cite personas', () => {
    const block = buildPersonaEvidenceBlock({
      personaId: 'archivist',
      pipelineResult: makePipeline(
        makeMeaning({
          memoryReviewCandidates: [{ claim: 'Moved to Austin in 2020', category: 'location', confidence: 0.95, provenance: [] }],
        })
      ),
    });

    expect(block).toContain('MUST cite');
    expect(block).toContain('Austin');
  });

  it('merges agent trace observations when provided', () => {
    const block = buildPersonaEvidenceBlock({
      personaId: 'strategist',
      pipelineResult: makePipeline(makeMeaning()),
      agentTrace: {
        runs: [],
        observations: [
          { agent_name: 'NarrativeAgent', kind: 'narrative_signal', summary: 'Significant career pivot detected' },
        ],
        proposedActions: [],
      },
    });

    expect(block).toContain('[NarrativeAgent]');
    expect(block).toContain('career pivot');
  });

  it('returns null when no evidence lines can be built', () => {
    const block = buildPersonaEvidenceBlock({
      personaId: 'strategist',
      pipelineResult: makePipeline(makeMeaning()),
    });
    expect(block).toBeNull();
  });
});

/**
 * Narrative structure bridge — stage/discourse → graph role mapping.
 */
import { describe, expect, it } from 'vitest';

import {
  analyzeNarrativeStructure,
  analyzeSegmentStructure,
  hasNarrativeStructureSignals,
  stageToArcMembershipRole,
  stageToNarrativeRole,
} from '../../src/services/narrative/narrativeStructureBridge';

describe('narrativeStructureBridge', () => {
  it('maps climax to turning_point roles', () => {
    expect(stageToNarrativeRole('CLIMAX')).toBe('turning_point');
    expect(stageToArcMembershipRole('CLIMAX')).toBe('turning_point');
  });

  it('maps setup to origin / defining_moment', () => {
    expect(stageToNarrativeRole('SETUP')).toBe('origin');
    expect(stageToArcMembershipRole('SETUP')).toBe('defining_moment');
  });

  it('analyzeNarrativeStructure picks primary roles from multi-stage story', () => {
    const analysis = analyzeNarrativeStructure(
      'It started when I moved to Austin. Then one day everything changed when I got laid off. Looking back, I learned a lot.',
    );
    expect(analysis.primaryNarrativeRole).toBe('turning_point');
    expect(analysis.primaryArcMembershipRole).toBe('turning_point');
    expect(analysis.isStoryBlock).toBe(true);
  });

  it('analyzeSegmentStructure enriches a single segment', () => {
    const seg = analyzeSegmentStructure('It hit rock bottom when I lost the job.');
    expect(seg.narrative_stages.some((s) => s.stage === 'CLIMAX')).toBe(true);
  });

  it('hasNarrativeStructureSignals is false for flat statements', () => {
    expect(hasNarrativeStructureSignals('I went to the store.')).toBe(false);
  });
});

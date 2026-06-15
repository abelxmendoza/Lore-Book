/**
 * Sprint AL-6 — Intelligence health coverage metrics
 */

import { getCharacterImportanceCoverage } from '../characters/characterImportanceService';
import { getEventSignificanceCoverage } from '../events/eventSignificanceService';
import { getRelationshipScoringCoverage } from '../relationships/relationshipScoringService';
import { getMeaningGenerationCoverage } from '../meaning/eventMeaningService';
import { getCharacterBiographyCoverage } from '../characters/characterBiographyService';

export type IntelligenceCoverageReport = {
  character_importance_coverage: Awaited<ReturnType<typeof getCharacterImportanceCoverage>>;
  event_significance_coverage: Awaited<ReturnType<typeof getEventSignificanceCoverage>>;
  relationship_scoring_coverage: Awaited<ReturnType<typeof getRelationshipScoringCoverage>>;
  meaning_generation_coverage: Awaited<ReturnType<typeof getMeaningGenerationCoverage>>;
  character_biography_coverage: Awaited<ReturnType<typeof getCharacterBiographyCoverage>>;
};

export async function buildIntelligenceCoverageReport(
  userId: string
): Promise<IntelligenceCoverageReport> {
  const [
    character_importance_coverage,
    event_significance_coverage,
    relationship_scoring_coverage,
    meaning_generation_coverage,
    character_biography_coverage,
  ] = await Promise.all([
    getCharacterImportanceCoverage(userId),
    getEventSignificanceCoverage(userId),
    getRelationshipScoringCoverage(userId),
    getMeaningGenerationCoverage(userId),
    getCharacterBiographyCoverage(userId),
  ]);

  return {
    character_importance_coverage,
    event_significance_coverage,
    relationship_scoring_coverage,
    meaning_generation_coverage,
    character_biography_coverage,
  };
}

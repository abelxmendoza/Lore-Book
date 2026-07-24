import type { NarrativeAnchorCognitionResult } from './narrativeAnchorCognitionTypes';

export function formatNarrativeAnchorDiagnostics(r: NarrativeAnchorCognitionResult): string {
  return [
    `Narrative anchor cognition: ${r.title}`,
    `  decision: ${r.decision}`,
    `  cluster: ${r.clusterType}`,
    `  status: ${r.status}`,
    `  confidence: ${(r.confidence * 100).toFixed(0)}%`,
    `  userCentrality: ${(r.userCentrality.finalScore * 100).toFixed(0)}%`,
    `  coherence: ${(r.narrativeCoherence.finalScore * 100).toFixed(0)}%`,
    `  impact: ${(r.impact.finalScore * 100).toFixed(0)}%`,
    `  titleQuality: ${(r.titleQuality.finalScore * 100).toFixed(0)}%`,
    r.eligibility.blockers.length ? `  blockers: ${r.eligibility.blockers.join(', ')}` : '',
    r.rejectionReason ? `  reason: ${r.rejectionReason}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

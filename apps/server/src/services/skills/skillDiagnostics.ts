/**
 * Diagnostic formatting for skill cognition audit traces.
 */

import type { SkillCognitionResult, SkillDiagnosticTrace } from './skillCognitionTypes';

export function buildSkillDiagnostics(result: Omit<SkillCognitionResult, 'diagnostics'>): SkillDiagnosticTrace {
  return {
    originalSpan: result.canonicalTitle,
    canonicalTitle: result.canonicalTitle,
    entityType: result.entityType,
    decision: result.decision,
    subject: result.subject,
    realityContext: result.realityContext,
    evidenceStrength: result.evidenceStrength,
    existenceConfidence: result.existenceConfidence,
    proficiency: result.proficiency,
    usageFrequency: result.usageFrequency,
    trajectory: result.trajectory,
    monetization: result.monetization,
    matchExistingName: result.matchExistingName,
    parentSkillName: result.parentSkillName,
    projectLinks: result.projectLinks,
    relationships: result.relationships,
    reasonsAccepted: result.reasonsAccepted,
    reasonsRejected: result.reasonsRejected,
    rulesFired: result.rulesFired,
  };
}

export function formatSkillDiagnostics(trace: SkillDiagnosticTrace): string {
  const lines = [
    `Skill cognition: ${trace.canonicalTitle}`,
    `  decision: ${trace.decision}`,
    `  entity: ${trace.entityType}`,
    `  subject: ${trace.subject.subjectType}${trace.subject.subjectName ? ` (${trace.subject.subjectName})` : ''}`,
    `  reality: ${trace.realityContext}`,
    `  evidence: ${trace.evidenceStrength}`,
    `  existence: ${(trace.existenceConfidence * 100).toFixed(0)}%`,
    `  proficiency: ${trace.proficiency.label}${trace.proficiency.score != null ? ` ~${trace.proficiency.score}` : ''}`,
    `  usage: ${trace.usageFrequency}`,
    `  trajectory: ${trace.trajectory}`,
    `  monetization: ${trace.monetization}`,
  ];
  if (trace.matchExistingName) lines.push(`  merge: ${trace.matchExistingName}`);
  if (trace.parentSkillName) lines.push(`  parent: ${trace.parentSkillName}`);
  if (trace.projectLinks.length) lines.push(`  projects: ${trace.projectLinks.join(', ')}`);
  if (trace.reasonsRejected.length) lines.push(`  rejected: ${trace.reasonsRejected.join(', ')}`);
  if (trace.reasonsAccepted.length) lines.push(`  accepted: ${trace.reasonsAccepted.join(', ')}`);
  return lines.join('\n');
}

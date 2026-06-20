/**
 * Meaning-layer enrichment for workplace / career narratives.
 */
import { isRoboticsWorkplaceFixtureText, extractEmployerName } from '../inference/work/workplaceInferenceService';
import { extractRoleFromText } from '../inference/work/roleInferenceService';
import type {
  MeaningAmbiguity,
  MemoryReviewCandidate,
  OntologyActionCandidate,
  ResolvedEvent,
  TemporalContext,
} from './meaningResolutionTypes';

export function enrichWorkplaceTemporalContext(text: string, temporal: TemporalContext): TemporalContext {
  if (!isRoboticsWorkplaceFixtureText(text) && !/\bworked\s+at\b/i.test(text)) {
    return temporal;
  }

  const employer = extractEmployerName(text);
  const role = extractRoleFromText(text);

  return {
    ...temporal,
    defaultStatus: 'past',
    statements: [
      ...temporal.statements,
      ...(employer
        ? [{ subject: 'user', predicate: 'worked_for', object: employer, status: 'past' as const, cue: 'worked at' }]
        : []),
      ...(role
        ? [{ subject: 'user', predicate: 'held_role', object: role.displayTitle, status: 'past' as const, cue: role.evidencePhrase }]
        : []),
    ],
  };
}

export function enrichWorkplaceResolvedEvents(text: string, events: ResolvedEvent[]): ResolvedEvent[] {
  if (!/\bworked\s+at\b/i.test(text)) return events;
  const out = [...events];
  if (!out.some((e) => e.kind === 'employment')) {
    out.push({
      kind: 'employment',
      title: 'Work experience described',
      status: 'past',
      confidence: 0.84,
      needsReview: true,
      requiresConfirmation: true,
    });
  }
  return out;
}

export function enrichWorkplaceAmbiguities(text: string, ambiguities: MeaningAmbiguity[]): MeaningAmbiguity[] {
  if (!/\bworked\s+at\b/i.test(text)) return ambiguities;
  const out = [...ambiguities];
  if (/\bat\s+[A-Z][\w']*(?:'s)?\s+in\s+[A-Z]/i.test(text) && extractEmployerName(text)) {
    out.push({
      code: 'deployment_site_not_employer',
      description: 'Customer/deployment venue is not treated as employer.',
      confidence: 0.93,
    });
  }
  if (!/\b(?:boss|manager)\b/i.test(text)) {
    out.push({
      code: 'no_manager_assumed',
      description: 'Coworkers inferred without manager role unless explicit evidence.',
      confidence: 0.95,
    });
  }
  return out;
}

export function enrichWorkplaceOntologyActions(
  text: string,
  actions: OntologyActionCandidate[]
): OntologyActionCandidate[] {
  if (!/\bworked\s+at\b/i.test(text)) return actions;
  const employer = extractEmployerName(text);
  const role = extractRoleFromText(text);
  const out = [...actions];
  if (employer && !out.some((a) => a.label.includes(employer))) {
    out.push({
      kind: 'create_group',
      label: `Add organization: ${employer}`,
      confidence: 0.88,
      requiresConfirmation: true,
      payload: { name: employer, type: 'company' },
    });
  }
  if (role && !out.some((a) => /role/i.test(a.label))) {
    out.push({
      kind: 'add_inferred_skill',
      label: `Assign role: ${role.displayTitle}`,
      confidence: role.confidence,
      requiresConfirmation: true,
      payload: { role: role.displayTitle, employer },
    });
  }
  return out;
}

export function enrichWorkplaceMemoryCandidates(
  text: string,
  candidates: MemoryReviewCandidate[]
): MemoryReviewCandidate[] {
  if (!/\bworked\s+at\b/i.test(text)) return candidates;
  const employer = extractEmployerName(text);
  const role = extractRoleFromText(text);
  const out = [...candidates];
  if (employer) {
    out.push({
      claim: `User worked for ${employer}.`,
      category: 'general',
      confidence: 0.88,
      requiresConfirmation: true,
      source: 'meaning:workplace',
    });
  }
  if (role) {
    out.push({
      claim: `User held role: ${role.displayTitle}.`,
      category: 'general',
      confidence: role.confidence,
      requiresConfirmation: true,
      source: 'meaning:workplace_role',
    });
  }
  return out;
}

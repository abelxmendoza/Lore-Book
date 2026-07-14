/**
 * Focused Recall Composer — turns a scope plan + filtered evidence (or a
 * WorkContext) into a short, grounded chat answer. No IDs, no layer status,
 * no inventories: just the facts that answer the question, with honest
 * uncertainty.
 */

import type { WorkContext, WorkPerson } from '../work/workContextTypes';
import type { ResponseScopePlan, ScopedEvidenceItem } from './responseScopeTypes';

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function leadSentence(person: WorkPerson): string | null {
  switch (person.relationship) {
    case 'manager':
      return `${person.displayName} is your manager`;
    case 'team_lead':
      return `${person.displayName} is ${person.attendancePattern ? `usually the ${person.attendancePattern}` : 'a team lead'}`;
    case 'lead_engineer':
      return `${person.displayName} is a lead engineer`;
    case 'lead_developer':
      return `${person.displayName} is the lead developer`;
    default:
      return null;
  }
}

/** The ideal work answer shape: roster sentence + role/attendance nuance. */
export function composeWorkAnswer(context: WorkContext, plan: ResponseScopePlan): string {
  const everyone = [...context.managers, ...context.leads, ...context.coworkers];
  const parts: string[] = [];

  if (plan.isCorrection && context.correctionsApplied.length > 0) {
    parts.push("You're right — I left people out. I've updated your team context.");
  }

  const teamLabel = [context.organization?.name, context.team?.name].filter(Boolean).join(' ');
  if (everyone.length > 0) {
    const names = everyone.slice(0, plan.maxCharactersReturned).map((p) => p.displayName);
    parts.push(
      `Based on what you've told me, your ${teamLabel || 'current'} team includes ${joinNames(names)}.`,
    );
  } else if (context.organization || context.currentRole) {
    parts.push(
      `I know you${context.currentRole ? ` work as a ${context.currentRole.title}` : ' work'}${
        context.organization ? ` at ${context.organization.name}` : ''
      }${context.parentOrganization ? ` (${context.parentOrganization.name})` : ''}, but I don't have teammates recorded yet — tell me who you work with and I'll remember them.`,
    );
  } else {
    parts.push("I don't have work details recorded yet — tell me about your job and team and I'll remember them.");
  }

  const nuances = everyone
    .map(leadSentence)
    .filter((s): s is string => !!s);
  const attendance = everyone
    .filter((p) => p.attendancePattern && !leadSentence(p))
    .map((p) => `${p.displayName} is ${p.attendancePattern}`);
  const nuanceLine = [...nuances, ...attendance].slice(0, 4);
  if (nuanceLine.length > 0) parts.push(`${nuanceLine.join('. ')}.`);

  if (context.tenure?.phrase && plan.includeUncertainty) {
    parts.push(`You're in your ${context.tenure.phrase.replace(/ — .*/, '')} there.`);
  }

  return parts.join(' ');
}

/** Generic focused context block for the LLM (non-work intents). */
export function composeFocusedContext(
  accepted: ScopedEvidenceItem[],
  plan: ResponseScopePlan,
): string {
  if (accepted.length === 0) return '';
  const lines = accepted.slice(0, plan.maxEvidenceItems).map((item) => {
    const provenance =
      plan.includeProvenanceSummary && item.evidenceIds?.length
        ? ` [evidence: ${item.evidenceIds.length}]`
        : '';
    return `- ${item.title}: ${item.content}${provenance}`;
  });
  return [`Relevant to this ${plan.intent} question:`, ...lines].join('\n');
}

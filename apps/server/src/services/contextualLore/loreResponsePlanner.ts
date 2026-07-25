/**
 * Lore response planner — turn a ContextualKnowledgeBundle into prompt constraints
 * so the chat reply demonstrates structured understanding (not generic encouragement).
 */

import type { ContextualKnowledgeBundle, LoreResponseMode, LoreResponsePlan } from './types';

function pickMode(bundle: Omit<ContextualKnowledgeBundle, 'responsePlan'>): LoreResponseMode {
  const hasIntro = bundle.introducedEntities.length > 0;
  const hasMilestones = bundle.eventProposals.some((e) => e.isMilestone);
  const hasReflection = bundle.reflectionProposals.length > 0;
  const multi = bundle.eventProposals.length >= 2 || bundle.threads.length >= 3;

  if (hasIntro && (hasMilestones || hasReflection || multi)) return 'MIXED';
  if (hasIntro) return 'PERSON_ONBOARDING';
  if (hasReflection && hasMilestones) return 'MIXED';
  if (hasReflection) return 'STORY_REFLECTION';
  if (hasMilestones) return 'MILESTONE_ACKNOWLEDGEMENT';
  if (multi) return 'MULTI_EVENT_SYNTHESIS';
  return 'MIXED';
}

export function planLoreResponse(
  bundle: Omit<ContextualKnowledgeBundle, 'responsePlan'>,
): LoreResponsePlan {
  const responseMode = pickMode(bundle);
  const acknowledgedIntroductions = bundle.introducedEntities.map((e) => {
    const role = e.rolePhrase
      ? ` role: ${e.rolePhrase}${e.supportsAnchor ? ` (supports ${e.supportsAnchor})` : ''}`
      : '';
    return `${e.canonicalName}${role}`;
  });

  const confirmedKnowledge = [
    ...bundle.groupProposals.map((g) => `Group: ${g.canonicalName}${g.groupType ? ` (${g.groupType})` : ''}`),
    ...bundle.eventProposals
      .filter((e) => !e.isMilestone)
      .map((e) => e.title),
  ];

  const highlightedMilestones = bundle.eventProposals
    .filter((e) => e.isMilestone)
    .map((e) => {
      const uncertainty = e.publicationUncertain
        ? ' (intended distribution — not confirmed live)'
        : '';
      return `${e.title}${uncertainty}`;
    });

  const reflectedInsights = bundle.reflectionProposals.map(
    (r) => `[${r.modality}] ${r.statement}`,
  );

  const unresolvedClarifications = bundle.unresolvedQuestions
    .filter((q) => q.priority === 'high' || q.priority === 'medium')
    .slice(0, 1)
    .map((q) => q.question);

  const avoidedClaims = [
    'Do not invent last names, employers, ages, or contact info.',
    'Do not create placeholder people for unnamed visitors.',
    'Do not claim a song is live on Spotify unless the user said it is live.',
    'Do not claim direct employment or a job offer from an agency-mediated interview.',
    'Do not assert that the user “needs therapy” as a diagnosis — preserve uncertainty/humor.',
    'Do not flatten ambition-vs-support tension into generic “balance” advice.',
    'Do not use a role phrase as a person’s canonical name.',
  ];

  const lines: string[] = [
    '**CONTEXTUAL LORE RESPONSE PLAN — HARD CONSTRAINTS:**',
    `Mode: ${responseMode}`,
    'Your reply must demonstrate structured understanding of this turn. Do NOT open with generic encouragement like “What a day of new beginnings!” unless you first name the concrete threads.',
  ];

  if (acknowledgedIntroductions.length) {
    lines.push('Person onboarding (state structured profile, not a sentence-fragment name):');
    for (const intro of acknowledgedIntroductions) lines.push(`- ${intro}`);
    lines.push('- If aliases are unknown, say so briefly.');
  }

  if (bundle.groupProposals.length) {
    lines.push('Groups (user-authored names are authoritative):');
    for (const g of bundle.groupProposals) {
      lines.push(
        `- ${g.canonicalName}${g.supportsAnchor ? ` — central person: ${g.supportsAnchor}` : ''}`,
      );
    }
  }

  if (highlightedMilestones.length || confirmedKnowledge.length) {
    lines.push('Distinct threads to keep separate (do not mash into one vague summary):');
    for (const m of highlightedMilestones) lines.push(`- Milestone: ${m}`);
    for (const k of confirmedKnowledge) lines.push(`- ${k}`);
  }

  if (bundle.dayMomentTitle) {
    lines.push(`Optional day theme (only if it helps coherence): ${bundle.dayMomentTitle}`);
  }

  if (reflectedInsights.length) {
    lines.push('Deeper reflection (preserve modality; do not resolve the conflict prematurely):');
    for (const r of reflectedInsights) lines.push(`- ${r}`);
  }

  lines.push('Avoided claims:');
  for (const a of avoidedClaims) lines.push(`- ${a}`);

  if (unresolvedClarifications.length) {
    lines.push('Ask at most ONE of these clarifications at the end (skip if already certain):');
    for (const q of unresolvedClarifications) lines.push(`- ${q}`);
  } else {
    lines.push('Do not ask a generic “how did that make you feel?” question.');
  }

  lines.push(
    'Only state facts that appear in this plan / the user message. Storage and speech must match.',
  );

  return {
    responseMode,
    acknowledgedIntroductions,
    confirmedKnowledge,
    highlightedMilestones,
    reflectedInsights,
    unresolvedClarifications,
    avoidedClaims,
    promptBlock: lines.join('\n'),
  };
}

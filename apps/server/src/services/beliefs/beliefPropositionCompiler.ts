import { createHash } from 'crypto';

import { renderBeliefDescription } from './beliefDescriptionRenderer';
import type {
  BeliefConfidenceBreakdown,
  BeliefModality,
  BeliefPolarity,
  BeliefSubjectResolution,
  CompiledProposition,
  PropositionAttribution,
  PropositionDomain,
  PropositionDurability,
  TemporalScope,
} from './beliefTypes';

export function compileBeliefProposition(input: {
  subject: BeliefSubjectResolution;
  domain: PropositionDomain;
  durability: PropositionDurability;
  modality: BeliefModality;
  polarity: BeliefPolarity;
  attribution: PropositionAttribution;
  temporalScope: TemporalScope;
  confidence: BeliefConfidenceBreakdown;
  evidenceIds: string[];
  sourceText: string;
  claimText: string;
  objectDisplay?: string;
  objectEntityId?: string;
}): CompiledProposition {
  const predicate = predicateForDomain(input.domain, input.claimText, input.polarity);
  const objectDisplay = input.objectDisplay || inferObject(input.claimText, input.domain);
  const renderedText = renderBeliefDescription({
    subject: input.subject,
    predicate,
    objectDisplay,
    polarity: input.polarity,
    modality: input.modality,
    domain: input.domain,
    attribution: input.attribution,
    sourceText: input.sourceText || input.claimText,
  });

  const propositionId = createHash('sha256')
    .update([
      input.subject.entityId || input.subject.displayName,
      predicate,
      objectDisplay || '',
      input.polarity,
      input.modality,
      input.temporalScope.referenceExpression || '',
    ].join('|'))
    .digest('hex')
    .slice(0, 24);

  return {
    propositionId: `belief-${propositionId}`,
    subject: {
      entityId: input.subject.subjectEntityId,
      displayName: input.subject.displayName,
      entityType: input.subject.entityType,
      confidence: input.subject.confidence,
    },
    predicate,
    object: objectDisplay
      ? {
          entityId: input.objectEntityId,
          displayName: objectDisplay,
          literalValue: objectDisplay,
          confidence: 0.7,
        }
      : undefined,
    polarity: input.polarity,
    modality: input.modality,
    domain: input.domain,
    durability: input.durability,
    temporalScope: input.temporalScope,
    attribution: input.attribution,
    evidenceIds: input.evidenceIds,
    confidenceBreakdown: input.confidence,
    renderedText,
    sourceQuote: (input.sourceText || input.claimText).trim(),
  };
}

export function isSemanticallyCompleteBelief(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (/^(?:try again|ok|yeah|bro)$/i.test(t)) return false;
  return /\b(?:is|are|was|were|am|'m|live|work|went|stayed|built|felt|feel|created|creat|blocked|dating|not|at|with)\b/i.test(t)
    || t.split(/\s+/).length >= 4;
}

function predicateForDomain(domain: PropositionDomain, text: string, polarity: BeliefPolarity): string {
  if (domain === 'CORRECTION' || polarity === 'NEGATIVE') return 'is_not';
  if (domain === 'OCCUPATION') return /\b(?:at|for)\b/i.test(text) ? 'works_for' : 'works_as';
  if (domain === 'RESIDENCE') return /live(?:s)?\s+with/i.test(text) ? 'lives_with' : 'lives_in';
  if (domain === 'RELATIONSHIP') return /\bblocked\b/i.test(text) ? 'blocked' : 'related_to';
  if (domain === 'EVENT') return 'experienced';
  if (domain === 'PLAN') return 'intends';
  if (domain === 'EMOTIONAL_STATE') return 'felt';
  if (domain === 'PHYSICAL_STATE') return 'located_at';
  if (domain === 'ENTITY_CLASSIFICATION') return 'is_a';
  if (domain === 'ALLEGATION') return 'accused_of';
  if (domain === 'IDENTITY' && /\bcreat/i.test(text)) return 'created';
  if (domain === 'PROJECT_GOAL') return 'wants';
  return 'has_fact';
}

function inferObject(text: string, domain: PropositionDomain): string | undefined {
  if (domain === 'EMOTIONAL_STATE') {
    if (/\bstoked\b/i.test(text)) return 'excited';
    if (/\bdepressed\b/i.test(text)) return 'depressed';
  }
  const creat = text.match(/\bcreat(?:ed|or of)\s+([A-Z][\w\s]+)/i);
  if (creat?.[1]) return creat[1].trim();
  const live = text.match(/\blive(?:s)?\s+(?:in|with)\s+(.+)$/i);
  if (live?.[1]) return live[1].replace(/[.:]+$/, '').trim();
  const club = text.match(/\bwent to\s+(.+)$/i);
  if (club?.[1]) return club[1].replace(/[.:]+$/, '').trim();
  return undefined;
}

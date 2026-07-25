import type { BeliefSensitivity, PropositionDomain } from './beliefTypes';

export function resolveBeliefSensitivity(input: {
  text: string;
  domain: PropositionDomain;
}): BeliefSensitivity[] {
  const t = input.text.toLowerCase();
  const labels = new Set<BeliefSensitivity>();

  if (/\b(?:sex|sexual|sexually|intimate|boundary|arm around|told me no)\b/.test(t)) {
    labels.add('SEXUAL');
    labels.add('HIGHLY_PRIVATE');
  }
  if (/\b(?:accused|allegation|aggressive|reputation|posting about)\b/.test(t) || input.domain === 'ALLEGATION') {
    labels.add('REPUTATIONAL');
    labels.add('HIGHLY_PRIVATE');
  }
  if (/\b(?:legal|lawsuit|crime|police)\b/.test(t)) labels.add('LEGAL');
  if (/\b(?:diagnos|health|medical|therapy|depressed)\b/.test(t)) labels.add('HEALTH');
  if (/\b(?:salary|income|debt|rent)\b/.test(t)) labels.add('FINANCIAL');
  if (input.domain === 'RELATIONSHIP' || /\b(?:blocked|dating|partner)\b/.test(t)) {
    labels.add('PRIVATE');
  }
  if (input.domain === 'RESIDENCE' || input.domain === 'IDENTITY') labels.add('PRIVATE');
  if (input.domain === 'CORRECTION' && /\b(?:name|identity|dj|occupation)\b/.test(t)) {
    labels.add('IDENTITY_CRITICAL');
  }

  if (labels.size === 0) labels.add('NORMAL');
  return [...labels];
}

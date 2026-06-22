import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate } from './contradictionTypes';
import {
  buildContradictionCandidate,
  knownCanonBeatsWeakExtraction,
} from './contradictionProvenanceService';

export type KnownCanonDomains = Record<string, 'character' | 'project' | 'organization' | 'location' | 'group'>;

function extractEntityName(text: string): string | null {
  const m = text.match(/^([A-Z][A-Za-z0-9\s'-]+?)\s+(?:is|was|exists|appeared)/i);
  return m?.[1]?.trim() ?? text.match(/^([A-Z][A-Za-z0-9\s'-]+)/)?.[1]?.trim() ?? null;
}

function inferDomainFromClaim(claim: EvidenceBundle): string | null {
  if (/\bproject\b/i.test(claim.claimText)) return 'project';
  if (/\bcharacter\b|\bperson\b|\bfriend\b/i.test(claim.claimText)) return 'character';
  if (/\borganization\b|\bcompany\b|\bemployer\b/i.test(claim.claimText)) return 'organization';
  if (claim.claimType === 'entity') return 'entity';
  return null;
}

export function detectDomainContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  knownCanon: KnownCanonDomains,
  seenAt?: string,
): ContradictionCandidate | null {
  const name = extractEntityName(incoming.claimText) ?? extractEntityName(existing.claimText);
  if (!name) return null;

  const canonDomain = knownCanon[name];
  const incomingDomain = inferDomainFromClaim(incoming);
  if (!canonDomain || !incomingDomain) return null;
  if (canonDomain === incomingDomain) return null;

  if (knownCanonBeatsWeakExtraction(existing, incoming)) {
    return buildContradictionCandidate(
      {
        contradictionType: 'domain',
        existingClaim: existing,
        newClaim: incoming,
        severity: 'high',
        suggestedResolution: 'keep_existing',
        reason: `Wrong-domain extraction: ${name} is known ${canonDomain}, not ${incomingDomain}`,
      },
      seenAt,
    );
  }

  return buildContradictionCandidate(
    {
      contradictionType: 'domain',
      existingClaim: existing,
      newClaim: incoming,
      severity: 'medium',
      suggestedResolution: 'needs_user_review',
      reason: `Domain conflict for ${name}: ${canonDomain} vs ${incomingDomain}`,
    },
    seenAt,
  );
}

export function shouldRejectWeakDomainExtraction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  knownCanon: KnownCanonDomains,
): boolean {
  const name = extractEntityName(incoming.claimText);
  if (!name) return false;
  const canonDomain = knownCanon[name];
  const incomingDomain = inferDomainFromClaim(incoming);
  return Boolean(canonDomain && incomingDomain && canonDomain !== incomingDomain && knownCanonBeatsWeakExtraction(existing, incoming));
}

export function detectAliasPossibleDuplicate(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const nameA = extractEntityName(existing.claimText) ?? existing.claimText.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/)?.[0];
  const nameB = extractEntityName(incoming.claimText) ?? incoming.claimText.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/)?.[0];
  if (!nameA || !nameB || nameA.toLowerCase() === nameB.toLowerCase()) return null;

  const sharedContext =
    existing.sourceThreadId &&
    incoming.sourceThreadId &&
    existing.sourceThreadId === incoming.sourceThreadId;

  const sharedEvent =
    existing.sourceQuote.toLowerCase().includes(nameB.toLowerCase()) ||
    incoming.sourceQuote.toLowerCase().includes(nameA.toLowerCase());

  const userHint = /\bsame person\b|\balso called\b|\baka\b|\bsame as\b/i.test(incoming.claimText);

  if (!((sharedContext && sharedEvent) || userHint)) return null;

  return buildContradictionCandidate(
    {
      contradictionType: 'alias',
      existingClaim: existing,
      newClaim: incoming,
      severity: 'medium',
      suggestedResolution: 'merge_entities',
      reason: `Possible alias/duplicate: ${nameA} ↔ ${nameB} (shared provenance/context)`,
    },
    seenAt,
  );
}

export function detectDomainContradictions(
  existingClaims: EvidenceBundle[],
  incoming: EvidenceBundle,
  knownCanon: KnownCanonDomains,
  seenAt?: string,
): { contradictions: ContradictionCandidate[]; rejected: EvidenceBundle[] } {
  const contradictions: ContradictionCandidate[] = [];
  const rejected: EvidenceBundle[] = [];

  for (const existing of existingClaims) {
    const domain = detectDomainContradiction(existing, incoming, knownCanon, seenAt);
    if (domain) contradictions.push(domain);
    if (shouldRejectWeakDomainExtraction(existing, incoming, knownCanon)) {
      rejected.push(incoming);
    }
    const alias = detectAliasPossibleDuplicate(existing, incoming, seenAt);
    if (alias) contradictions.push(alias);
  }

  return { contradictions, rejected };
}

import type { AssistantClaim, CanonFact, GroundedClaim, ResponseContradiction } from './responseCompilerTypes';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractEmployer(text: string): string | null {
  const m = text.match(/\b(?:works? at|worked at|employed (?:at|by)|you currently work at|you work at)\s+([A-Za-z0-9\s&'.-]{2,})/i);
  return m?.[1]?.trim() ?? null;
}

function extractSchool(text: string): string | null {
  const m = text.match(/\b(?:attended|went to|studied at)\s+([A-Za-z0-9\s'-]{3,})/i);
  if (m) return m[1].trim();
  const school = text.match(/\b([A-Za-z0-9\s'-]+(?:School|College|University|Middle School|High School))\b/i);
  return school?.[1]?.trim() ?? null;
}

export function detectContradictions(
  claims: AssistantClaim[],
  canonFacts: CanonFact[] = [],
): ResponseContradiction[] {
  const contradictions: ResponseContradiction[] = [];

  for (const claim of claims) {
    const claimNorm = normalize(claim.claim);

    for (const canon of canonFacts) {
      const canonNorm = normalize(canon.fact);

      if (canon.domain === 'work' || claim.type === 'work_claim') {
        const claimEmployer = extractEmployer(claim.claim) ?? extractEmployer(claim.sourceSentence);
        const canonEmployer =
          extractEmployer(canon.fact) ?? canon.entityName ?? (canonNorm.includes(' at ') ? canonNorm.split(' at ').pop() : null);

        if (claimEmployer && canonEmployer) {
          const c1 = normalize(claimEmployer);
          const c2 = normalize(canonEmployer);
          if (c1 !== c2 && !c1.includes(c2) && !c2.includes(c1)) {
            contradictions.push({
              claimId: claim.id,
              claim: claim.claim,
              severity: 'high',
              type: 'employment',
              canonFact: canon.fact,
              reason: `Assistant claims "${claimEmployer}" but canon says "${canonEmployer}"`,
            });
          }
        }
      }

      if (canon.domain === 'school' || claim.type === 'school_claim') {
        const claimSchool = extractSchool(claim.claim) ?? extractSchool(claim.sourceSentence);
        const canonSchool = extractSchool(canon.fact) ?? canon.entityName;
        if (claimSchool && canonSchool) {
          const s1 = normalize(claimSchool);
          const s2 = normalize(canonSchool);
          if (s1 !== s2 && !s1.includes(s2) && !s2.includes(s1)) {
            contradictions.push({
              claimId: claim.id,
              claim: claim.claim,
              severity: 'medium',
              type: 'school',
              canonFact: canon.fact,
              reason: `Assistant school claim conflicts with canon`,
            });
          }
        }
      }

      if (canonNorm.includes('not ') && tokenContains(claimNorm, canonNorm.replace(/\bnot\b/g, '').trim())) {
        contradictions.push({
          claimId: claim.id,
          claim: claim.claim,
          severity: 'high',
          type: canon.domain,
          canonFact: canon.fact,
          reason: 'Assistant claim conflicts with explicit negation in canon',
        });
      }
    }
  }

  return dedupeContradictions(contradictions);
}

function tokenContains(haystack: string, needle: string): boolean {
  const tokens = needle.split(/\W+/).filter((t) => t.length > 3);
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
}

function dedupeContradictions(items: ResponseContradiction[]): ResponseContradiction[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    const key = `${c.claimId}:${c.type}:${c.canonFact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyContradictionsToGrounding(
  grounded: GroundedClaim[],
  contradictions: ResponseContradiction[],
): GroundedClaim[] {
  const byClaim = new Map(contradictions.map((c) => [c.claimId, c]));
  return grounded.map((g) =>
    byClaim.has(g.id) ? { ...g, grounding: 'contradicted' as const } : g,
  );
}

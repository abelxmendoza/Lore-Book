import type {
  AssistantClaim,
  CanonFact,
  ClaimProvenance,
  GroundingStatus,
  GroundedClaim,
  ParserFrameRef,
  SourceMessageWitness,
} from './responseCompilerTypes';
import { classifyStatementKind } from './inferenceClassifier';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(/\W+/).filter((t) => t.length > 3));
  const tb = new Set(normalize(b).split(/\W+/).filter((t) => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

function findEvidenceQuotes(
  claim: AssistantClaim,
  witnesses: SourceMessageWitness[],
): { messageIds: string[]; quotes: string[]; entities: string[] } {
  const userMessages = witnesses.filter((m) => m.role === 'user');
  const claimNorm = normalize(claim.claim);
  const messageIds: string[] = [];
  const quotes: string[] = [];
  const entities = new Set<string>();

  const nameMatch = claim.claim.match(/\b([A-Z][a-z]{2,})\b/g) ?? [];
  for (const n of nameMatch) entities.add(n);

  for (const msg of userMessages) {
    const msgNorm = normalize(msg.content);
    if (claimIntroducesUnsupportedFact(claim, msg.content)) continue;

    const overlap = tokenOverlap(claim.claim, msg.content);
    const nameHit = nameMatch.some((n) => msgNorm.includes(n.toLowerCase()));

    const schoolHit =
      claim.type === 'school_claim' &&
      /\b(school|attended|went to|middle school|high school|college)\b/i.test(msg.content) &&
      nameHit;

    const relHit =
      claim.type === 'relationship_claim' &&
      /\b(friend|closest|best friend|childhood|middle school)\b/i.test(msg.content) &&
      nameHit;

    const workHit =
      claim.type === 'work_claim' &&
      /\b(work|works at|job|employer|robotics)\b/i.test(msg.content);

    if (
      overlap >= 0.35 ||
      schoolHit ||
      relHit ||
      workHit ||
      msgNorm.includes(claimNorm.slice(0, Math.min(claimNorm.length, 40)))
    ) {
      messageIds.push(msg.id);
      const snippet = msg.content.length > 160 ? `${msg.content.slice(0, 157)}…` : msg.content;
      quotes.push(snippet);
    }
  }

  return { messageIds: [...new Set(messageIds)], quotes, entities: [...entities] };
}

function claimIntroducesUnsupportedFact(claim: AssistantClaim, witnessText: string): boolean {
  const novelPatterns = [
    /\b(professional musician|became a|works at|employed at|married|divorced|died|moved to)\b/i,
  ];
  const witnessNorm = normalize(witnessText);
  for (const pattern of novelPatterns) {
    if (pattern.test(claim.claim) && !pattern.test(witnessText)) {
      const tokens = claim.claim.match(/\b[a-z]{4,}\b/gi) ?? [];
      const novel = tokens.filter((t) => !witnessNorm.includes(t.toLowerCase()));
      if (novel.length >= 2) return true;
    }
  }
  return false;
}

export function checkClaimGrounding(
  claim: AssistantClaim,
  witnesses: SourceMessageWitness[],
  canonFacts: CanonFact[] = [],
  parserFrames: ParserFrameRef[] = [],
): { status: GroundingStatus; provenance?: ClaimProvenance } {
  const evidence = findEvidenceQuotes(claim, witnesses);

  for (const canon of canonFacts) {
    const claimNorm = normalize(claim.claim);
    const canonNorm = normalize(canon.fact);
    if (
      claim.type === 'work_claim' &&
      claimNorm.includes('work') &&
      canon.domain === 'work' &&
      !claimNorm.includes(normalize(canon.entityName ?? canon.fact))
    ) {
      const overlap = tokenOverlap(claim.claim, canon.fact);
      if (overlap < 0.2 && /\bwork/i.test(claim.claim)) {
        // possible contradiction handled by contradictionChecker
      }
    }
  }

  const frameLabels = parserFrames
    .filter((f) => {
      const label = normalize(f.label);
      return tokenOverlap(claim.claim, f.label) >= 0.3 || label.split(/\W+/).some((t) => normalize(claim.claim).includes(t));
    })
    .map((f) => f.frameId);

  if (evidence.messageIds.length > 0) {
    const direct =
      claim.statementKind === 'FACT' ||
      (claim.certainty === 'certain' && !/\b(appears|seems|probably|likely|might|may)\b/i.test(claim.sourceSentence));

    const confidence = direct ? 0.92 : 0.78;
    return {
      status: direct ? 'grounded' : 'inferred',
      provenance: {
        sourceMessageIds: evidence.messageIds,
        sourceQuotes: evidence.quotes,
        sourceEntities: evidence.entities,
        parserFrames: frameLabels,
        confidence,
      },
    };
  }

  const introducesNovelFact = witnesses.some((w) => w.role === 'user' && claimIntroducesUnsupportedFact(claim, w.content))
    || /\b(became a|professional musician|works at|employed at)\b/i.test(claim.claim);

  if (introducesNovelFact && evidence.messageIds.length === 0) {
    return { status: 'unsupported' };
  }

  if (claim.statementKind === 'INFERENCE' || claim.statementKind === 'SPECULATION' || claim.certainty !== 'certain') {
    return { status: 'inferred' };
  }

  if (canonFacts.some((c) => tokenOverlap(claim.claim, c.fact) >= 0.5)) {
    return {
      status: 'grounded',
      provenance: {
        sourceMessageIds: canonFacts.map((c) => c.sourceMessageId).filter(Boolean) as string[],
        sourceQuotes: canonFacts.filter((c) => tokenOverlap(claim.claim, c.fact) >= 0.5).map((c) => c.fact),
        sourceEntities: canonFacts.map((c) => c.entityName).filter(Boolean) as string[],
        parserFrames: frameLabels,
        confidence: 0.8,
      },
    };
  }

  return { status: 'unsupported' };
}

export function groundClaims(
  claims: AssistantClaim[],
  witnesses: SourceMessageWitness[],
  canonFacts: CanonFact[] = [],
  parserFrames: ParserFrameRef[] = [],
): GroundedClaim[] {
  return claims.map((claim) => {
    const { status, provenance } = checkClaimGrounding(claim, witnesses, canonFacts, parserFrames);
    const statementKind = classifyStatementKind(claim.sourceSentence, {
      grounded: status === 'grounded',
    });
    return {
      ...claim,
      statementKind,
      grounding: status,
      provenance,
    };
  });
}

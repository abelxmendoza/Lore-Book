import { evaluateCharacterIdentity, evaluateProjectIdentity } from '../../identityIntegrityPolicy';
import { evaluateTitleOnlyPersonGuard } from '../../lexical/intelligence/titleOnlyEntityGuard';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { CanonIndex, LoreBookDomain, LoreBookOperation, OperationGate } from './loreBookParserTypes';
import { canonEntitiesForDomain } from './canonIndexBuilder';

export type GateContext = {
  domain: LoreBookDomain;
  name: string;
  text: string;
  spanType?: string;
  isPrivateResidence?: boolean;
  isIdentitySensitive?: boolean;
  isFamilyTitle?: boolean;
  isRomantic?: boolean;
  isConsumerApp?: boolean;
  isKnownExact?: boolean;
};

const REVIEW_DOMAINS = new Set<LoreBookDomain>(['family', 'relationships']);
const SENSITIVE_SPAN_TYPES = new Set(['RELATIONSHIP', 'EMOTIONAL_SIGNIFICANCE', 'CONFLICT']);

export function resolveSuggestAddGate(ctx: GateContext): OperationGate {
  if (ctx.isConsumerApp) return 'block';
  if (ctx.isIdentitySensitive) return 'review';
  if (ctx.isFamilyTitle || ctx.isRomantic || REVIEW_DOMAINS.has(ctx.domain)) return 'review';
  if (ctx.isPrivateResidence) return 'review';
  if (ctx.spanType && SENSITIVE_SPAN_TYPES.has(ctx.spanType)) return 'review';
  return 'suggest';
}

export function gateForLink(ctx: GateContext): 'suggest' | 'review' {
  if (ctx.isIdentitySensitive || ctx.isRomantic || ctx.isFamilyTitle) return 'review';
  if (REVIEW_DOMAINS.has(ctx.domain)) return 'review';
  return 'suggest';
}

export function evaluateMergeGate(
  name: string,
  domain: LoreBookDomain,
  canon: CanonIndex
): LoreBookOperation | null {
  const entities = canonEntitiesForDomain(canon, domain);
  if (domain === 'characters') {
    const { verdict, matched } = evaluateCharacterIdentity(name, entities.map(toIdentity));
    if (verdict.tier === 'similar' && matched) {
      return {
        kind: 'suggest_merge',
        domain,
        name,
        targetBookId: matched.id,
        targetName: matched.name,
        reason: verdict.reasons[0] ?? 'similar_name',
        confidence: verdict.confidence,
        gate: 'review',
      };
    }
    if (verdict.tier === 'identity_equivalent' && matched) {
      return {
        kind: 'attach_evidence',
        entityId: matched.id,
        domain,
        quote: name,
        confidence: 1,
      };
    }
  }

  if (domain === 'projects') {
    const { verdict, matched } = evaluateProjectIdentity(name, entities.map(toIdentity));
    if (verdict.tier === 'similar' && matched) {
      return {
        kind: 'suggest_merge',
        domain,
        name,
        targetBookId: matched.id,
        targetName: matched.name,
        reason: 'similar_project',
        confidence: verdict.confidence,
        gate: 'review',
      };
    }
    if (verdict.tier === 'identity_equivalent' && matched) {
      return {
        kind: 'attach_evidence',
        entityId: matched.id,
        domain,
        quote: name,
        confidence: 1,
      };
    }
  }

  return null;
}

function toIdentity(e: { id: string; displayName: string; aliases: string[] }) {
  return { id: e.id, name: e.displayName, aliases: e.aliases };
}

export function isBareKinshipTitle(name: string): boolean {
  return evaluateTitleOnlyPersonGuard(name).isTitleOnly;
}

export function isIdentityCollisionText(text: string): boolean {
  return /\bis me\b/i.test(text) && /\b(?:dad|father|estranged|also my)\b/i.test(text);
}

export function isRomanticContext(text: string): boolean {
  return /\b(?:girlfriend|boyfriend|partner|dating|romantic|love interest|crush)\b/i.test(text);
}

export function isPrivateResidenceContext(name: string, text: string): boolean {
  return /\b(?:house|home|residence)\b/i.test(name) || /\b(?:'s|’s)\s+(?:house|home)\b/i.test(text);
}

export function isGenericSchoolPhrase(name: string): boolean {
  const key = normalizeNameKey(name);
  return key === 'middle school' || key === 'high school' || key === 'elementary school';
}

export function shouldSuppressSpanType(type: string): boolean {
  return [
    'TIME_PERIOD',
    'DATE',
    'EMOTION',
    'WEATHER_CONTEXT',
    'PREFERENCE',
    'UNKNOWN',
    'TITLE_REFERENCE',
    'ROLE_REFERENCE',
    'FAMILY_REFERENCE',
    'UNRESOLVED_PERSON_REFERENCE',
  ].includes(type);
}

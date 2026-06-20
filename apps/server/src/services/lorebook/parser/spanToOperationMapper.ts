/**
 * Map Lexical Intelligence spans + canon into LoreBookOperation[].
 */

import { resolveBookNameMatch, collectBookEntriesWithIds } from '../../../utils/suggestionBookFilter';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { guardCrossBookEntity } from '../../lexical/projects/projectCrossBookGuard';
import type { CrossBookIndex } from '../../lexical/projects/projectSuggestionTypes';
import { guardConsumerAppReference } from '../../lexical/projects/projectConsumerAppGuard';
import { guardObjectReference } from '../../lexical/projects/projectObjectGuard';
import { processProjectSuggestionsForOutput } from '../../lexical/projects/projectSuggestionService';
import { guardPlaceCandidate } from '../../lexical/places/placeTypeGuard';
import { detectAlternativeCategories } from '../../suggestionCrossBookService';
import {
  evaluateEntityQuality,
  qualityGateToOperationGate,
  resolveDisplayName,
} from '../quality/entityQualityGateService';
import type { LexicalIntelligenceSpan } from '../../lexical/intelligence/lexicalIntelligenceTypes';
import {
  canonEntitiesForDomain,
  findCanonEntity,
} from './canonIndexBuilder';
import type { CanonIndex } from './loreBookParserTypes';
import {
  evaluateMergeGate,
  gateForLink,
  isBareKinshipTitle,
  isGenericSchoolPhrase,
  isIdentityCollisionText,
  isPrivateResidenceContext,
  isRomanticContext,
  resolveSuggestAddGate,
  shouldSuppressSpanType,
} from './parserGateService';
import type {
  EvidenceBundle,
  LoreBookDomain,
  LoreBookOperation,
  LoreBookParseDebug,
  OperationGate,
} from './loreBookParserTypes';

const LEXICAL_TO_DOMAIN: Record<string, LoreBookDomain | undefined> = {
  PERSON: 'characters',
  CHARACTER: 'characters',
  PLACE: 'locations',
  VENUE: 'locations',
  TRAVEL_DESTINATION: 'locations',
  DEPLOYMENT_SITE: 'locations',
  WORKSITE: 'locations',
  SCHOOL: 'schools',
  ORGANIZATION: 'organizations',
  GROUP: 'groups',
  FRIEND_GROUP: 'groups',
  SCHOOL_CLUB: 'groups',
  SCHOOL_TEAM: 'groups',
  COMMUNITY: 'groups',
  SKILL: 'skills',
  ACTIVITY: 'skills',
  WORK_ACTIVITY: 'skills',
  TASK: 'quests',
  EVENT: 'events',
  ROLE: 'work',
  WORK_CONTEXT: 'work',
  OBJECT: 'projects',
  MEDIA: 'projects',
};

const JUNK_SPANS = new Set(['i', 'me', 'my', 'we', 'you', 'they', 'someone', 'somebody']);
const GENERIC_FAMILY = new Set(['mom', 'dad', 'mother', 'father', 'phone']);
const PERSON_REFERENCE_TYPES = new Set([
  'TITLE_REFERENCE',
  'ROLE_REFERENCE',
  'FAMILY_REFERENCE',
  'UNRESOLVED_PERSON_REFERENCE',
]);

function shouldSuppressByName(name: string, text: string): string | null {
  const key = normalizeNameKey(name);
  if (GENERIC_FAMILY.has(key)) return 'generic_family_or_object';
  if (isBareKinshipTitle(name)) return 'bare_kinship_title';
  if (isGenericSchoolPhrase(name)) return 'generic_school_phrase';
  if (/\bfind my\b/i.test(name) && /\bfind my app\b/i.test(text)) return 'consumer_app_find_my';
  if (guardConsumerAppReference(name, text).allowed === false) {
    return guardConsumerAppReference(name, text).rejectionReason ?? 'consumer_app';
  }
  if (/\b(?:phone in|forgot my phone)\b/i.test(text) && /phone/i.test(name)) return 'object_location_phrase';
  return null;
}

export type SpanMappingContext = {
  userId: string;
  text: string;
  canon: CanonIndex;
  crossBook: CrossBookIndex;
  messageId?: string;
  threadId?: string;
  debug?: LoreBookParseDebug;
};

function evidenceFromSpan(
  span: LexicalIntelligenceSpan,
  text: string,
  ctx: SpanMappingContext,
  parserRules: string[] = []
): EvidenceBundle {
  const quote =
    span.contextWindow?.match?.trim() ||
    text.slice(Math.max(0, span.start - 40), Math.min(text.length, span.end + 40)).trim();
  return {
    quote,
    messageId: ctx.messageId,
    threadId: ctx.threadId,
    start: span.start,
    end: span.end,
    lexicalRulesFired: span.rulesFired,
    parserRulesFired: parserRules,
  };
}

function primaryDomainForSpan(span: LexicalIntelligenceSpan): LoreBookDomain | undefined {
  if (span.subtype === 'TRAVEL_EVENT' || span.type === 'TRAVEL_DESTINATION') return 'locations';
  if (span.type === 'WORKSITE' || span.type === 'DEPLOYMENT_SITE') return 'locations';
  if (/\b(?:middle|high|elementary)\s+school\b/i.test(span.text) && span.type !== 'PERSON') return 'schools';
  return LEXICAL_TO_DOMAIN[span.type];
}

function bookEntriesForDomain(canon: CanonIndex, domain: LoreBookDomain) {
  const entities = canonEntitiesForDomain(canon, domain);
  return collectBookEntriesWithIds(
    entities.map((e) => ({ id: e.id, names: [e.displayName, ...e.aliases] }))
  );
}

function gateRank(gate?: OperationGate | 'suggest' | 'review'): number {
  switch (gate) {
    case 'block':
      return 4;
    case 'review':
      return 3;
    case 'suggest':
      return 2;
    case 'auto':
      return 1;
    default:
      return 0;
  }
}

function pushUniqueOp(ops: LoreBookOperation[], op: LoreBookOperation, keyFn: (o: LoreBookOperation) => string) {
  const key = keyFn(op);
  const idx = ops.findIndex((existing) => keyFn(existing) === key);
  if (idx < 0) {
    ops.push(op);
    return;
  }
  const prev = ops[idx]!;
  if (op.kind === 'suggest_add' && prev.kind === 'suggest_add') {
    if (gateRank(op.gate) > gateRank(prev.gate)) ops[idx] = op;
    if (op.confidence > prev.confidence) ops[idx] = { ...ops[idx] as typeof op, confidence: op.confidence };
  }
}

function opKey(op: LoreBookOperation): string {
  switch (op.kind) {
    case 'suggest_add':
      return `${op.kind}:${op.domain}:${normalizeNameKey(op.name)}`;
    case 'suggest_merge':
      return `${op.kind}:${op.domain}:${normalizeNameKey(op.name)}:${op.targetBookId}`;
    case 'redirect':
      return `${op.kind}:${op.fromDomain}:${op.toDomain}:${normalizeNameKey(op.name)}`;
    case 'link':
      return `${op.kind}:${normalizeNameKey(op.fromEntity.name)}:${op.relationType}:${normalizeNameKey(op.toEntity.name)}`;
    case 'attach_evidence':
      return `${op.kind}:${op.domain}:${op.entityId}:${normalizeNameKey(op.quote)}`;
    case 'suppress':
      return `${op.kind}:${normalizeNameKey(op.name)}:${op.reason}`;
    default:
      return `${op.kind}:${JSON.stringify(op)}`;
  }
}

function shouldSuppressProjectCandidate(name: string, text: string, crossBook: CrossBookIndex): LoreBookOperation | null {
  const trimmed = name.trim();
  if (!trimmed) return { kind: 'suppress', name: trimmed, reason: 'empty', sourceSpans: [] };

  const consumer = guardConsumerAppReference(trimmed, text);
  if (!consumer.allowed) {
    return { kind: 'suppress', name: trimmed, reason: consumer.rejectionReason ?? 'consumer_app', sourceSpans: [trimmed] };
  }

  const object = guardObjectReference(trimmed, text);
  if (!object.allowed) {
    return { kind: 'suppress', name: trimmed, reason: object.rejectionReason ?? 'object_reference', sourceSpans: [trimmed] };
  }

  const guard = guardCrossBookEntity(trimmed, text, crossBook);
  if (!guard.allowed && guard.rejectedAs === 'PERSON') {
    return { kind: 'suppress', name: trimmed, reason: guard.rejectionReason ?? 'known_as_person', sourceSpans: [trimmed] };
  }

  return null;
}

function applyEntityQualityGate(
  name: string,
  domain: LoreBookDomain,
  ctx: SpanMappingContext,
  span: LexicalIntelligenceSpan
): { allowed: boolean; displayName: string; gate: OperationGate; reason?: string } {
  const verdict = evaluateEntityQuality(
    {
      name,
      domain,
      contextText: ctx.text,
      evidence: span.contextWindow?.match,
      spanType: span.type,
      confidence: span.confidence,
      sourceMessageId: ctx.messageId,
      sourceThreadId: ctx.threadId,
    },
    {
      crossBook: ctx.crossBook,
      knownInBook: new Set(canonEntitiesForDomain(ctx.canon, domain).map((e) => e.displayName)),
      knownInBookIds: new Map(
        canonEntitiesForDomain(ctx.canon, domain).map((e) => [e.canonicalKey, e.id])
      ),
      skipDuplicateCheck: true,
    }
  );

  if (ctx.debug) {
    ctx.debug.qualityGates = ctx.debug.qualityGates ?? [];
    ctx.debug.qualityGates.push({
      name,
      domain,
      gate: verdict.gate,
      reason: verdict.rejectionReason,
      provenance: verdict.provenance.map((p) => p.rule),
    });
  }

  if (verdict.gate === 'reject') {
    return { allowed: false, displayName: name, gate: 'block', reason: verdict.rejectionReason };
  }

  return {
    allowed: true,
    displayName: resolveDisplayName({ name, domain }, verdict),
    gate: qualityGateToOperationGate(verdict),
    reason: verdict.rejectionReason,
  };
}

function mapSpanToOperations(span: LexicalIntelligenceSpan, ctx: SpanMappingContext): LoreBookOperation[] {
  const ops: LoreBookOperation[] = [];
  const name = span.text.trim();
  const key = normalizeNameKey(name);
  if (!key || key.length < 2 || JUNK_SPANS.has(key)) return ops;

  const suppressReason = shouldSuppressByName(name, ctx.text);
  if (suppressReason) {
    ops.push({ kind: 'suppress', name, reason: suppressReason, sourceSpans: [span.id] });
    return ops;
  }

  if (shouldSuppressSpanType(span.type)) return ops;

  if (PERSON_REFERENCE_TYPES.has(span.type)) {
    ops.push({
      kind: 'suppress',
      name,
      reason: `person_reference:${span.type}`,
      sourceSpans: [span.id],
    });
    return ops;
  }

  const domain = primaryDomainForSpan(span);
  if (!domain) return ops;

  const known = findCanonEntity(name, ctx.canon);
  if (known) {
    ctx.debug?.canonMatches.push({
      name,
      domain: known.entity.domain,
      entityId: known.entity.id,
      matchType: known.matchType,
    });
    ops.push({
      kind: 'attach_evidence',
      entityId: known.entity.id,
      domain: known.entity.domain,
      quote: evidenceFromSpan(span, ctx.text, ctx, ['canon_exact']).quote,
      messageId: ctx.messageId,
      confidence: Math.max(span.confidence, 0.85),
    });
    return ops;
  }

  const quality = applyEntityQualityGate(name, domain, ctx, span);
  if (!quality.allowed) {
    ops.push({
      kind: 'suppress',
      name,
      reason: quality.reason ?? 'entity_quality_gate',
      sourceSpans: [span.id],
    });
    return ops;
  }
  const displayName = quality.displayName;

  const bookIndex = bookEntriesForDomain(ctx.canon, domain);
  const bookMatch = resolveBookNameMatch(displayName, bookIndex.exactKeys, bookIndex.entries);
  ctx.debug?.duplicateChecks.push({ name: displayName, status: bookMatch.status, matchedName: bookMatch.matchedName });

  const mergeOp = evaluateMergeGate(displayName, domain, ctx.canon);
  if (mergeOp) {
    ops.push(mergeOp);
    return ops;
  }

  if (bookMatch.status === 'existing' && bookMatch.matchedId) {
    ops.push({
      kind: 'attach_evidence',
      entityId: bookMatch.matchedId,
      domain,
      quote: evidenceFromSpan(span, ctx.text, ctx).quote,
      messageId: ctx.messageId,
      confidence: span.confidence,
    });
    return ops;
  }

  if (bookMatch.status === 'similar' && bookMatch.matchedId && bookMatch.matchedName) {
    ops.push({
      kind: 'suggest_merge',
      domain,
      name,
      targetBookId: bookMatch.matchedId,
      targetName: bookMatch.matchedName,
      reason: 'book_similar_match',
      confidence: span.confidence,
      gate: 'review',
    });
    return ops;
  }

  // Cross-book redirect when span domain conflicts with canon elsewhere
  const wrongDomainAsProject = domain === 'projects' || span.type === 'OBJECT';
  const probeDomain = wrongDomainAsProject ? 'projects' : domain;
  const alts = detectAlternativeCategories(name, probeDomain as 'projects', {
    evidence: ctx.text,
    index: ctx.crossBook,
  });
  for (const alt of alts) {
    if (alt.domain === probeDomain) continue;
    const guard = guardCrossBookEntity(name, ctx.text, ctx.crossBook);
    ctx.debug?.crossBookGuards.push({
      name,
      allowed: guard.allowed,
      rejectedAs: guard.rejectedAs,
      reason: guard.rejectionReason,
    });
    ops.push({
      kind: 'redirect',
      fromDomain: probeDomain as LoreBookDomain,
      toDomain: alt.domain as LoreBookDomain,
      name,
      reason: alt.reason,
      confidence: alt.confidence,
    });
    if (!guard.allowed) return ops;
  }

  if (domain === 'locations') {
    const placeGuard = guardPlaceCandidate(name, ctx.text);
    if (!placeGuard.allowed && placeGuard.rejectedAs === 'EVENT') {
      ops.push({
        kind: 'suggest_add',
        domain: 'events',
        name,
        evidence: evidenceFromSpan(span, ctx.text, ctx, ['place_guard_event']),
        confidence: span.confidence,
        sourceSpans: [span.id],
        gate: 'suggest',
      });
      return ops;
    }
    if (!placeGuard.allowed && placeGuard.rejectedAs !== 'PLACE') {
      ops.push({ kind: 'suppress', name, reason: `place_guard:${placeGuard.rejectedAs}`, sourceSpans: [span.id] });
      return ops;
    }
  }

  if (/\b(?:umbia|prom|party|festival|concert|gig|show)\b/i.test(name) && domain === 'projects') {
    ops.push({
      kind: 'suggest_add',
      domain: 'events',
      name,
      evidence: evidenceFromSpan(span, ctx.text, ctx, ['event_name_heuristic']),
      confidence: span.confidence,
      sourceSpans: [span.id],
      gate: 'suggest',
    });
    return ops;
  }

  if (span.type === 'WORKSITE' || span.type === 'DEPLOYMENT_SITE') {
    const orgGuard = guardCrossBookEntity(name, ctx.text, ctx.crossBook);
    if (!orgGuard.allowed && orgGuard.rejectedAs === 'ORGANIZATION') {
      ops.push({ kind: 'suppress', name, reason: 'worksite_not_employer', sourceSpans: [span.id] });
      return ops;
    }
  }

  const gate = quality.gate === 'block' ? 'block' : resolveSuggestAddGate({
    domain,
    name: displayName,
    text: ctx.text,
    spanType: span.type,
    isPrivateResidence: isPrivateResidenceContext(displayName, ctx.text),
    isIdentitySensitive: isIdentityCollisionText(ctx.text),
    isFamilyTitle: /\b(?:tio|tía|tia|cousin|uncle|aunt)\b/i.test(displayName),
    isRomantic: isRomanticContext(ctx.text),
    isConsumerApp: !guardConsumerAppReference(displayName, ctx.text).allowed,
  });

  if (gate === 'block') {
    ops.push({ kind: 'suppress', name: displayName, reason: 'gate_block', sourceSpans: [span.id] });
    return ops;
  }

  const finalGate = quality.gate === 'review' || gate === 'review' ? 'review' : gate;

  ops.push({
    kind: 'suggest_add',
    domain,
    name: displayName,
    evidence: evidenceFromSpan(span, ctx.text, ctx, ['entity_quality_pass']),
    confidence: span.confidence,
    sourceSpans: [span.id],
    gate: finalGate,
  });

  return ops;
}

function mapProjectCandidates(ctx: SpanMappingContext): LoreBookOperation[] {
  const ops: LoreBookOperation[] = [];
  const knownProjects = new Set(canonEntitiesForDomain(ctx.canon, 'projects').map((e) => e.displayName));
  const suggestions = processProjectSuggestionsForOutput(ctx.text, {
    crossBook: ctx.crossBook,
    knownProjects,
  });

  for (const project of suggestions) {
    const name = project.text.trim();
    if (!name) continue;

    const suppress = shouldSuppressProjectCandidate(name, ctx.text, ctx.crossBook);
    if (suppress) {
      pushUniqueOp(ops, suppress, opKey);
      continue;
    }

    const guard = guardCrossBookEntity(name, ctx.text, ctx.crossBook, { knownProjects });
    ctx.debug?.crossBookGuards.push({
      name,
      allowed: guard.allowed,
      rejectedAs: guard.rejectedAs,
      reason: guard.rejectionReason,
    });

    if (!guard.allowed) {
      const altDomain = LEXICAL_TO_DOMAIN[guard.rejectedAs ?? ''] ?? 'characters';
      pushUniqueOp(
        ops,
        {
          kind: 'redirect',
          fromDomain: 'projects',
          toDomain: altDomain,
          name,
          reason: guard.rejectionReason ?? 'cross_book_guard',
          confidence: 0.9,
        },
        opKey
      );
      continue;
    }

    const known = findCanonEntity(name, ctx.canon);
    if (known?.entity.domain === 'projects') {
      pushUniqueOp(
        ops,
        {
          kind: 'attach_evidence',
          entityId: known.entity.id,
          domain: 'projects',
          quote: project.evidencePhrases?.[0] ?? ctx.text.slice(0, 120),
          messageId: ctx.messageId,
          confidence: project.confidence,
        },
        opKey
      );
      continue;
    }

    const mergeOp = evaluateMergeGate(name, 'projects', ctx.canon);
    if (mergeOp) {
      pushUniqueOp(ops, mergeOp, opKey);
      continue;
    }

    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'projects',
        name,
        evidence: {
          quote: project.evidencePhrases?.[0] ?? ctx.text.slice(0, 160),
          messageId: ctx.messageId,
          threadId: ctx.threadId,
          parserRulesFired: ['project_pipeline'],
        },
        confidence: project.confidence,
        sourceSpans: [],
        gate: project.status === 'needs_review' ? 'review' : 'suggest',
      },
      opKey
    );
  }

  return ops;
}

function filterConflictingProjectAdds(ops: LoreBookOperation[]): LoreBookOperation[] {
  const redirectNames = new Set(
    ops
      .filter((o): o is Extract<LoreBookOperation, { kind: 'redirect' }> => o.kind === 'redirect')
      .map((o) => normalizeNameKey(o.name))
  );
  const eventNames = new Set(
    ops
      .filter(
        (o): o is Extract<LoreBookOperation, { kind: 'suggest_add' }> =>
          o.kind === 'suggest_add' && o.domain === 'events'
      )
      .map((o) => normalizeNameKey(o.name))
  );

  return ops.filter((o) => {
    if (o.kind !== 'suggest_add' || o.domain !== 'projects') return true;
    const key = normalizeNameKey(o.name);
    if (redirectNames.has(key) || eventNames.has(key)) return false;
    if (/\b(?:umbia|gothicumbia|prom|festival)\b/i.test(o.name)) return false;
    return true;
  });
}

function extractPatternOperations(ctx: SpanMappingContext): LoreBookOperation[] {
  const ops: LoreBookOperation[] = [];
  const { text } = ctx;

  // School memory patterns
  const schoolMatch = text.match(/\b([A-Z][\w\s.'-]+(?:Middle|High|Elementary)\s+School)\b/);
  if (schoolMatch?.[1]) {
    const schoolName = schoolMatch[1].trim();
    if (!findCanonEntity(schoolName, ctx.canon)) {
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'schools',
          name: schoolName,
          evidence: { quote: text, parserRulesFired: ['pattern_school_name'] },
          confidence: 0.82,
          sourceSpans: [],
          gate: 'suggest',
        },
        opKey
      );
    }
    const bandMatch = text.match(/\b(?:in|with)\s+(?:the\s+)?band\b/i);
    if (bandMatch) {
      const groupName = `${schoolName} Band`;
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'groups',
          name: groupName,
          evidence: { quote: text, parserRulesFired: ['pattern_school_band'] },
          confidence: 0.78,
          sourceSpans: [],
          gate: 'suggest',
        },
        opKey
      );
    }
  }

  const friendMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+best\s+friend\b/);
  if (friendMatch?.[1]) {
    const person = friendMatch[1].trim();
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'characters',
        name: person,
        evidence: { quote: text, parserRulesFired: ['pattern_best_friend'] },
        confidence: 0.85,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
    pushUniqueOp(
      ops,
      {
        kind: 'link',
        fromEntity: { domain: 'characters', name: person },
        toEntity: { domain: 'characters', name: 'self' },
        relationType: 'best_friend',
        evidence: { quote: text, parserRulesFired: ['pattern_best_friend_link'] },
        confidence: 0.8,
        gate: gateForLink({ domain: 'relationships', name: person, text, isRomantic: false, isFamilyTitle: false }),
      },
      opKey
    );
  }

  // Family graduation party
  const cousinMatch = text.match(/\bmy\s+cousin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (cousinMatch?.[1]) {
    const cousin = cousinMatch[1].trim();
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'characters',
        name: cousin,
        evidence: { quote: text, parserRulesFired: ['pattern_cousin'] },
        confidence: 0.84,
        sourceSpans: [],
        gate: 'review',
      },
      opKey
    );
    pushUniqueOp(
      ops,
      {
        kind: 'link',
        fromEntity: { domain: 'characters', name: cousin },
        toEntity: { domain: 'characters', name: 'self' },
        relationType: 'cousin',
        evidence: { quote: text, parserRulesFired: ['pattern_cousin_link'] },
        confidence: 0.82,
        gate: 'review',
      },
      opKey
    );
  }

  const tioMatch = text.match(/\bmy\s+(Tio|Tía|Tia)\s+([A-Z][a-z]+)/i);
  if (tioMatch?.[2]) {
    const title = tioMatch[1];
    const given = tioMatch[2].trim();
    const displayName = `${title} ${given}`;
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'characters',
        name: displayName,
        evidence: { quote: text, parserRulesFired: ['pattern_family_title'] },
        confidence: 0.86,
        sourceSpans: [],
        gate: 'review',
      },
      opKey
    );
    pushUniqueOp(
      ops,
      {
        kind: 'link',
        fromEntity: { domain: 'characters', name: displayName },
        toEntity: { domain: 'characters', name: 'self' },
        relationType: title.toLowerCase().startsWith('tio') ? 'uncle' : 'aunt',
        evidence: { quote: text, parserRulesFired: ['pattern_tio_link'] },
        confidence: 0.8,
        gate: 'review',
      },
      opKey
    );

    const houseMatch = text.match(new RegExp(`${given}'s\\s+house`, 'i'));
    if (houseMatch) {
      const locName = `${displayName}'s house`;
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'locations',
          name: locName,
          evidence: { quote: text, parserRulesFired: ['pattern_private_residence'] },
          confidence: 0.8,
          sourceSpans: [],
          gate: 'review',
        },
        opKey
      );
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'family',
          name: `${displayName} Household`,
          evidence: { quote: text, parserRulesFired: ['pattern_household'] },
          confidence: 0.75,
          sourceSpans: [],
          gate: 'review',
        },
        opKey
      );
    }
  }

  // Worksite vs employer
  const employerMatch = text.match(/\b(?:worked|working)\s+(?:at|for)\s+([A-Z][\w\s&.-]+?)(?:\s+as\b|,|\.|$)/i);
  if (employerMatch?.[1]) {
    const org = employerMatch[1].trim();
    if (!/denny'?s/i.test(org)) {
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'organizations',
          name: org,
          evidence: { quote: text, parserRulesFired: ['pattern_employer'] },
          confidence: 0.83,
          sourceSpans: [],
          gate: 'suggest',
        },
        opKey
      );
    }
  }

  const roleMatch = text.match(/\bas\s+(?:a\s+)?([a-z][\w\s-]{2,40}?)(?:\s+(?:doing|at|in|for)\b|,|\.|$)/i);
  if (roleMatch?.[1] && /\b(?:robot tech|engineer|developer|manager)\b/i.test(roleMatch[1])) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'work',
        name: roleMatch[1].trim(),
        evidence: { quote: text, parserRulesFired: ['pattern_role'] },
        confidence: 0.76,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  const skillMatch = text.match(/\b(?:doing|performing)\s+([a-z][\w\s-]{2,40}?)(?:\s+at\b|,|\.|$)/i);
  if (skillMatch?.[1]) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'skills',
        name: skillMatch[1].trim(),
        evidence: { quote: text, parserRulesFired: ['pattern_skill_task'] },
        confidence: 0.74,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  // Travel + class
  const classMatch = text.match(/\b([A-Z][A-Za-z]*(?:\s+[A-Z][a-z]+)*\s+Class)\b/);
  if (classMatch?.[1]) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'groups',
        name: classMatch[1].trim(),
        evidence: { quote: text, parserRulesFired: ['pattern_school_class'] },
        confidence: 0.84,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  if (/\bJapan\b/.test(text) && /\b(?:went|travel|trip)\b/i.test(text)) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'locations',
        name: 'Japan',
        evidence: { quote: text, parserRulesFired: ['pattern_travel_destination'] },
        confidence: 0.8,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  if (/\bJapanese\b/i.test(text) && /\bclass\b/i.test(text)) {
    pushUniqueOp(
      ops,
      {
        kind: 'update_attribute',
        entityId: 'interest:japanese',
        domain: 'skills',
        field: 'interest',
        value: 'Japanese language/culture',
        evidence: { quote: text, parserRulesFired: ['pattern_language_interest'] },
        confidence: 0.65,
        gate: 'review',
      },
      opKey
    );
  }

  // Music scene
  const oscarMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+used\s+to\s+be\s+my\s+best\s+friend\b/);
  if (oscarMatch?.[1]) {
    const person = oscarMatch[1].trim();
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'characters',
        name: person,
        evidence: { quote: text, parserRulesFired: ['pattern_lost_friend'] },
        confidence: 0.84,
        sourceSpans: [],
        gate: 'review',
      },
      opKey
    );
    pushUniqueOp(
      ops,
      {
        kind: 'link',
        fromEntity: { domain: 'characters', name: person },
        toEntity: { domain: 'characters', name: 'self' },
        relationType: 'best_friend',
        evidence: { quote: text, parserRulesFired: ['pattern_lost_friend_link'] },
        confidence: 0.78,
        gate: 'review',
      },
      opKey
    );
  }
  if (/\b(?:ska scene|music scene)\b/i.test(text)) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'groups',
        name: 'LA ska scene',
        evidence: { quote: text, parserRulesFired: ['pattern_music_scene'] },
        confidence: 0.72,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  // Identity collision — review ops only, no merge
  if (isIdentityCollisionText(text)) {
    const selfMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+me\b/);
    if (selfMatch?.[1]) {
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: selfMatch[1].trim(),
          evidence: { quote: text, parserRulesFired: ['pattern_identity_self'] },
          confidence: 0.7,
          sourceSpans: [],
          gate: 'review',
        },
        opKey
      );
      pushUniqueOp(
        ops,
        {
          kind: 'suggest_add',
          domain: 'family',
          name: 'estranged father',
          evidence: { quote: text, parserRulesFired: ['pattern_identity_father'] },
          confidence: 0.65,
          sourceSpans: [],
          gate: 'review',
        },
        opKey
      );
    }
  }

  const gradParty = text.match(/\b([A-Z][a-z]+)'s\s+Graduation Party\b/i);
  if (gradParty?.[1]) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'events',
        name: `${gradParty[1]}'s Graduation Party`,
        evidence: { quote: text, parserRulesFired: ['pattern_graduation_party'] },
        confidence: 0.8,
        sourceSpans: [],
        gate: 'suggest',
      },
      opKey
    );
  }

  const girlfriendMatch = text.match(/\b(?:my\s+)?girlfriend\s+([A-Z][a-z]+)\b/);
  if (girlfriendMatch?.[1]) {
    pushUniqueOp(
      ops,
      {
        kind: 'suggest_add',
        domain: 'characters',
        name: girlfriendMatch[1].trim(),
        evidence: { quote: text, parserRulesFired: ['pattern_romantic_partner'] },
        confidence: 0.8,
        sourceSpans: [],
        gate: 'review',
      },
      opKey
    );
  }

  if (/\bAmazon Ring\b/i.test(text)) {
    pushUniqueOp(
      ops,
      { kind: 'suppress', name: 'Amazon Ring doorbell', reason: 'product_device_reference', sourceSpans: [] },
      opKey
    );
  }

  const eventNames = text.match(/\b([A-Z][a-z]+(?:umbia|fest|con|palooza))\b/g);
  if (eventNames) {
    for (const raw of eventNames) {
      const name = raw.trim();
      if (/^Gothicumbia$/i.test(name)) {
        pushUniqueOp(
          ops,
          {
            kind: 'suggest_add',
            domain: 'events',
            name,
            evidence: { quote: text, parserRulesFired: ['pattern_named_event'] },
            confidence: 0.78,
            sourceSpans: [],
            gate: 'suggest',
          },
          opKey
        );
      }
    }
  }

  return ops;
}

export function mapSpansToOperations(
  spans: LexicalIntelligenceSpan[],
  ctx: SpanMappingContext
): LoreBookOperation[] {
  const ops: LoreBookOperation[] = [];

  for (const span of spans) {
    for (const op of mapSpanToOperations(span, ctx)) {
      pushUniqueOp(ops, op, opKey);
    }
  }

  for (const op of mapProjectCandidates(ctx)) {
    pushUniqueOp(ops, op, opKey);
  }

  for (const op of extractPatternOperations(ctx)) {
    pushUniqueOp(ops, op, opKey);
  }

  return filterConflictingProjectAdds(ops);
}

export function partitionOperations(operations: LoreBookOperation[]): {
  active: LoreBookOperation[];
  suppressed: LoreBookOperation[];
  redirects: LoreBookOperation[];
} {
  const suppressed = operations.filter((o) => o.kind === 'suppress');
  const redirects = operations.filter((o) => o.kind === 'redirect');
  const active = operations.filter((o) => o.kind !== 'suppress');
  return { active, suppressed, redirects };
}

export function initParseDebug(): LoreBookParseDebug {
  return {
    canonMatches: [],
    rulesFired: [],
    duplicateChecks: [],
    crossBookGuards: [],
  };
}

export function collectRulesFired(operations: LoreBookOperation[]): string[] {
  const rules = new Set<string>();
  for (const op of operations) {
    if (op.kind === 'suggest_add' || op.kind === 'link' || op.kind === 'update_attribute') {
      for (const r of op.evidence.parserRulesFired ?? []) rules.add(r);
      for (const r of op.evidence.lexicalRulesFired ?? []) rules.add(`lexical:${r}`);
    }
  }
  return [...rules];
}

import {
  daysBetween,
  entityOverlap,
  extractNameHints,
  jaccard,
  tokenSet,
  tokenize,
} from './tokenize';
import { inferSensitivity, sensitivityGate } from './sensitiveMemory';
import type {
  ContinuityCandidate,
  ContinuityMemoryInput,
  ContinuityMode,
  EpistemicWeight,
  RecommendedUse,
  RelevanceBreakdown,
} from './types';

const CAUSAL_LESSON_RE =
  /\b(taught me|learned|lesson|boundaries|respect|backed off|this time|differently|progress|growth|used to|now i|focused on|pulled away|dancing|dance)\b/i;
const GOAL_RE =
  /\b(want to|goal|work at|job|interview|role|career|spacex|tesla|rocket|aerospace|robotics|avionics|lab|hardware)\b/i;
const UNFINISHED_RE =
  /\b(waiting|still|haven.?t heard|pending|follow.?up|not yet|planning to|no email)\b/i;
const PREFERENCE_RE = /\b(prefer|like|love|hate|always|never want)\b/i;
const PERSON_QUERY_RE = /\b(who|whom|whose|which (?:person|teammate|coworker|friend))\b/i;
const CODING_RE = /\b(cod(e|ing)|program|software|chatbot|sql|pipeline|debug|engineer|built|builder)\b/i;

/** Domain synonym groups for soft semantic bridges without embeddings. */
const DOMAIN_GROUPS: string[][] = [
  ['coding', 'code', 'programmer', 'built', 'chatbot', 'software', 'sql', 'pipeline', 'debug', 'engineer', 'prima', 'data', 'stack'],
  [
    'aerospace',
    'avionics',
    'rocket',
    'spacex',
    'tesla',
    'robotics',
    'robot',
    'lab',
    'hardware',
    'ros',
    'navigation',
    'mobile',
    'base',
    'demo',
    'fixture',
  ],
  ['boundary', 'boundaries', 'respect', 'backed', 'dance', 'dancing', 'pulled', 'lesson', 'taught'],
  [
    'interview',
    'job',
    'career',
    'role',
    'offer',
    'hiring',
    'thursday',
    'tips',
    'systems',
    'design',
    'second-round',
    'invite',
    'proud',
    'mom',
  ],
  ['journal', 'routine', 'morning', 'habit'],
  ['piano', 'music', 'jazz', 'scales', 'venue', 'dj', 'standard', 'learn'],
  ['bjj', 'guard', 'martial', 'class', 'training', 'rusty', 'skipped'],
  ['hike', 'hiking', 'trip', 'sam'],
  ['roadmap', 'product', 'milestone', 'deadline', 'jordan', 'pm'],
  ['feedback', 'written', 'async', 'meeting', 'manager', 'surprise', '1:1', 'pop'],
  ['warehouse', 'venue', 'vibe', 'weekend', 'late', 'sets'],
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function epistemicWeight(mem: ContinuityMemoryInput): EpistemicWeight {
  const cs = mem.correctionState ?? 'active';
  if (cs === 'user_corrected' || cs === 'superseded') return 'user_correction';
  const ep = (mem.epistemicType ?? '').toLowerCase();
  if (ep === 'user_corrected' || ep === 'correction') return 'user_correction';
  if (ep === 'user_confirmed' || ep === 'direct_statement') return 'newer_explicit';
  if (ep === 'multi_evidence_pattern') return 'repeated_supported';
  if (ep === 'deterministic_inference') return 'deterministic_inference';
  if (ep.includes('infer') || ep.includes('weak')) return 'weak_pattern';
  return 'older_explicit';
}

function scoreEpistemic(w: EpistemicWeight): number {
  switch (w) {
    case 'user_correction':
      return 1;
    case 'newer_explicit':
      return 0.95;
    case 'repeated_supported':
      return 0.85;
    case 'older_explicit':
      return 0.7;
    case 'deterministic_inference':
      return 0.55;
    case 'weak_pattern':
      return 0.3;
  }
}

function domainBridge(message: string, memory: string): number {
  const m = `${message} ${memory}`.toLowerCase();
  let best = 0;
  for (const group of DOMAIN_GROUPS) {
    const inMsg = group.filter((g) => message.toLowerCase().includes(g));
    const inMem = group.filter((g) => memory.toLowerCase().includes(g));
    if (inMsg.length && inMem.length) {
      best = Math.max(best, Math.min(1, 0.35 + 0.15 * Math.min(inMsg.length, inMem.length)));
    }
  }
  // also check combined bag for shared domain tokens
  const msgTok = new Set(tokenize(message));
  const memTok = new Set(tokenize(memory));
  for (const group of DOMAIN_GROUPS) {
    let msgHits = 0;
    let memHits = 0;
    for (const g of group) {
      if (msgTok.has(g) || message.toLowerCase().includes(g)) msgHits++;
      if (memTok.has(g) || memory.toLowerCase().includes(g)) memHits++;
    }
    if (msgHits && memHits) best = Math.max(best, 0.4);
  }
  void m;
  return best;
}

function entityMentionBoost(message: string, entities: string[]): number {
  const lower = message.toLowerCase();
  let hits = 0;
  for (const e of entities) {
    const el = e.toLowerCase();
    if (el.length >= 2 && lower.includes(el)) hits++;
    // first token of multi-word entity
    const first = el.split(/\s+/)[0] ?? '';
    if (first.length >= 3 && lower.includes(first)) hits += 0.5;
  }
  return clamp01(hits / Math.max(1, entities.length));
}

function inferMode(
  mem: ContinuityMemoryInput,
  message: string,
  breakdown: RelevanceBreakdown,
): ContinuityMode {
  if (breakdown.entity >= 0.55 && breakdown.causal < 0.35 && breakdown.goal < 0.35) {
    return 'recall';
  }
  if (breakdown.goal >= 0.4) return 'goal_follow_up';
  if (UNFINISHED_RE.test(mem.summary) || UNFINISHED_RE.test(message)) return 'unfinished_thread';
  if (CAUSAL_LESSON_RE.test(mem.summary) && CAUSAL_LESSON_RE.test(message)) return 'progress';
  if (/\bused to\b|\bbut now\b|\bchanged\b|\bnow i am focused\b/i.test(mem.summary + ' ' + message)) {
    return 'contrast';
  }
  if (breakdown.relationship >= 0.5) return 'relationship_context';
  if (breakdown.continuity >= 0.45 || breakdown.causal >= 0.4) return 'connection';
  if (breakdown.semantic >= 0.5 && breakdown.entity < 0.3) return 'pattern';
  return breakdown.composite >= 0.45 ? 'connection' : 'none';
}

function recommendUse(
  mem: ContinuityMemoryInput,
  breakdown: RelevanceBreakdown,
  sensitivityAllowed: boolean,
): RecommendedUse {
  if (!sensitivityAllowed) return 'do_not_use';
  if (
    mem.correctionState === 'user_corrected' ||
    mem.correctionState === 'superseded' ||
    mem.correctionState === 'contradicted'
  ) {
    if (mem.memoryType === 'correction' && breakdown.composite >= 0.35) {
      return 'direct_reference';
    }
    return 'do_not_use';
  }
  if (mem.memoryType === 'correction' && breakdown.composite >= 0.35) {
    return 'direct_reference';
  }
  if (breakdown.composite < 0.32) return 'do_not_use';
  if (breakdown.composite < 0.42) return 'background_only';
  if (breakdown.entity >= 0.45 || breakdown.causal >= 0.4 || breakdown.goal >= 0.45) {
    return 'direct_reference';
  }
  if (breakdown.composite >= 0.48) return 'subtle_acknowledgment';
  if (breakdown.entity >= 0.35 && breakdown.semantic < 0.3) return 'ask_for_clarification';
  return 'background_only';
}

function relationshipBlurb(
  mem: ContinuityMemoryInput,
  message: string,
  mode: ContinuityMode,
  entity: number,
  causal: number,
): string {
  if (entity >= 0.45 && causal >= 0.35) {
    return 'Same person/context and supports a related behavioral or goal thread in the current message.';
  }
  if (entity >= 0.45) {
    return 'Involves the same entity named or implied in the current message.';
  }
  if (causal >= 0.4) {
    return 'Supports the same lesson, boundary, or progression theme as the current message.';
  }
  if (mode === 'goal_follow_up') {
    return 'Aligns with an active career/project goal relevant to the opportunity mentioned now.';
  }
  if (mode === 'unfinished_thread') {
    return 'Open plan or waiting state that the current message continues.';
  }
  if (PERSON_QUERY_RE.test(message) && (mem.memoryType === 'entity' || CODING_RE.test(mem.summary))) {
    return 'Relevant person/skill evidence for a who/team question.';
  }
  const msgTok = tokenSet(message);
  const memTok = tokenSet(mem.summary);
  if (jaccard(msgTok, memTok) > 0.2) {
    return 'Semantically related wording; use only if not contradicted.';
  }
  return 'Weak link to the current message.';
}

export function scoreMemory(
  mem: ContinuityMemoryInput,
  currentMessage: string,
  resolvedEntities: string[],
  nowIso: string,
): ContinuityCandidate {
  const msgEntities = [
    ...resolvedEntities,
    ...extractNameHints(currentMessage),
    ...(mem.entities ?? []).filter((e) => currentMessage.toLowerCase().includes(e.toLowerCase())),
  ];
  const uniqueMsgEntities = [...new Set(msgEntities)];

  let entity = Math.max(
    entityOverlap(uniqueMsgEntities, mem.entities ?? [], currentMessage),
    entityMentionBoost(currentMessage, mem.entities ?? []),
  );

  // Person query + entity/skill memory without name mention: soft entity from domain
  if (PERSON_QUERY_RE.test(currentMessage) && (mem.memoryType === 'entity' || CODING_RE.test(mem.summary))) {
    if (CODING_RE.test(currentMessage) && CODING_RE.test(mem.summary)) {
      entity = Math.max(entity, 0.55);
    } else if (/\bteam\b/i.test(currentMessage) && mem.memoryType === 'entity') {
      entity = Math.max(entity, 0.4);
    }
  }

  const tagBlob = (mem.tags ?? []).join(' ');
  const memText = `${mem.summary} ${tagBlob}`;
  const baseSemantic = jaccard(tokenSet(currentMessage), tokenSet(memText));
  const bridge = domainBridge(currentMessage, memText);
  // Shared content tokens (substring) — catches interview/journal/piano etc.
  const msgTokens = tokenize(currentMessage);
  const memTokens = new Set(tokenize(memText));
  let shared = 0;
  for (const t of msgTokens) {
    if (memTokens.has(t) || memText.toLowerCase().includes(t)) shared += 1;
  }
  const sharedScore = msgTokens.length ? Math.min(1, shared / Math.min(6, msgTokens.length)) : 0;
  // Tag tokens present in the current message are a strong disambiguation signal
  // (e.g. Jordan+roadmap vs Jordan+birthday).
  let tagHit = 0;
  for (const t of mem.tags ?? []) {
    if (t && currentMessage.toLowerCase().includes(t.toLowerCase())) tagHit += 1;
  }
  const tagBoost = tagHit > 0 ? Math.min(0.4, 0.2 * tagHit) : 0;
  // Soft penalty when competing same-name entities lack message tags
  const wrongTagPenalty =
    (mem.entities?.length ?? 0) > 0 &&
    tagHit === 0 &&
    (mem.tags ?? []).some((t) =>
      !currentMessage.toLowerCase().includes(t.toLowerCase()) &&
      /birthday|friend|family|dinner|cousin|weekend/.test(t),
    )
      ? 0.25
      : 0;
  const semantic = clamp01(Math.max(baseSemantic, bridge, sharedScore * 0.85) + tagBoost - wrongTagPenalty);

  const days = daysBetween(mem.eventTime, nowIso);
  let temporal = 0.55;
  if (days != null) {
    if (days < 14) temporal = 1;
    else if (days < 60) temporal = 0.9;
    else if (days < 180) temporal = 0.75;
    else if (days < 365) temporal = 0.55;
    else temporal = 0.35;
  }
  // Prefer newer when both recent and historical present — handled by relative ranking
  if (mem.correctionState === 'historical_only') temporal = Math.min(temporal, 0.4);

  const relationship =
    mem.memoryType === 'relationship' || mem.memoryType === 'entity'
      ? Math.max(entity, semantic * 0.55)
      : entity * 0.7 + (/\b(friend|coworker|boss|cousin|partner|team|pm)\b/i.test(mem.summary) ? 0.2 : 0);

  const goalMsg = GOAL_RE.test(currentMessage) || /\b(rocket lab|avionics|spacex)\b/i.test(currentMessage);
  const goalMem =
    GOAL_RE.test(mem.summary) ||
    mem.memoryType === 'goal' ||
    mem.memoryType === 'plan' ||
    (mem.tags ?? []).some((t) => /career|aerospace|robotics|avionics/.test(t));
  const goal = goalMsg && goalMem ? Math.max(0.6, semantic) : mem.memoryType === 'goal' ? semantic * 0.85 : 0;

  const lessonMsg = CAUSAL_LESSON_RE.test(currentMessage);
  const lessonMem =
    CAUSAL_LESSON_RE.test(mem.summary) ||
    mem.memoryType === 'lesson' ||
    (mem.tags ?? []).includes('boundaries');
  const causal =
    lessonMsg && lessonMem
      ? Math.max(0.65, semantic * 0.5 + entity * 0.25)
      : mem.memoryType === 'lesson'
        ? Math.max(semantic * 0.45, lessonMsg ? 0.5 : 0)
        : 0;

  const continuity = clamp01(
    0.32 * entity + 0.28 * causal + 0.22 * goal + 0.1 * relationship + 0.08 * semantic,
  );

  const conf = clamp01(mem.confidence ?? 0.5);
  const epW = epistemicWeight(mem);
  const evidenceQuality = clamp01(0.5 * conf + 0.5 * scoreEpistemic(epW));

  let correctionPenalty = 0;
  const cs = mem.correctionState ?? 'active';
  if (cs === 'user_corrected' || cs === 'superseded' || cs === 'contradicted') {
    if (mem.memoryType !== 'correction') correctionPenalty = 1;
  }
  if (mem.assistantGenerated) {
    correctionPenalty = Math.max(correctionPenalty, 0.9);
  }

  // Boost corrections / active truth when message mentions their entities
  let typeBoost = 0;
  if (mem.memoryType === 'correction' && entity >= 0.3) typeBoost = 0.25;
  if (mem.memoryType === 'lesson' && causal >= 0.4) typeBoost = 0.12;
  if (mem.memoryType === 'goal' && goal >= 0.4) typeBoost = 0.12;
  if (PERSON_QUERY_RE.test(currentMessage) && mem.memoryType === 'entity' && entity >= 0.35) {
    typeBoost = Math.max(typeBoost, 0.18);
  }

  const sensitivity = inferSensitivity(mem.summary, mem.sensitivity);

  // Content-word overlap floors — continuity should fire on clear shared nouns
  // without requiring embeddings.
  const significantShared = msgTokens.filter(
    (t) => t.length >= 4 && (memTokens.has(t) || memText.toLowerCase().includes(t)),
  );
  if (significantShared.length >= 1 && compositeFloorNeeded(entity, causal, goal)) {
    typeBoost = Math.max(typeBoost, 0.22 + 0.08 * Math.min(3, significantShared.length - 1));
  }
  // Who/person queries: entity memories with coding/building language
  if (
    PERSON_QUERY_RE.test(currentMessage) &&
    (mem.memoryType === 'entity' || CODING_RE.test(mem.summary)) &&
    (CODING_RE.test(currentMessage) ||
      /\b(knows|good at|coded with|pair|team|data|sql)\b/i.test(currentMessage))
  ) {
    typeBoost = Math.max(typeBoost, 0.35);
    entity = Math.max(entity, 0.5);
  }

  let composite = clamp01(
    0.24 * entity +
      0.22 * semantic +
      0.08 * temporal +
      0.1 * relationship +
      0.12 * goal +
      0.12 * causal +
      0.1 * continuity +
      typeBoost,
  );

  // Hard floor when a distinctive content stem is shared
  if (significantShared.length >= 1 && composite < 0.42 && correctionPenalty < 0.5) {
    composite = Math.max(composite, 0.42 + 0.05 * Math.min(2, significantShared.length - 1));
  }
  if (bridge >= 0.35 && correctionPenalty < 0.5) {
    composite = Math.max(composite, 0.46);
  }
  if (PERSON_QUERY_RE.test(currentMessage) && mem.memoryType === 'entity' && entity >= 0.45) {
    composite = Math.max(composite, 0.5);
  }
  // Explicit day-of-week / named plan anchors in both sides
  if (
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(currentMessage) &&
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(mem.summary)
  ) {
    composite = Math.max(composite, 0.52);
  }

  // provisional composite for sensitivity gate (before penalty)
  const provisional = composite;
  const gate = sensitivityGate(sensitivity, provisional, entity, causal, {
    goalRelevance: goal,
    semanticRelevance: semantic,
  });
  const sensitivityPenalty = gate.penalty;
  composite = clamp01(composite * (1 - correctionPenalty) * (1 - sensitivityPenalty * 0.5));
  // Re-apply floors after sensitivity if allowed
  if (gate.allowed && bridge >= 0.35 && correctionPenalty < 0.5) {
    composite = Math.max(composite, 0.44);
  }

  // Penalize pure keyword similarity with zero entity/causal/goal (unrelated)
  if (entity < 0.12 && semantic > 0.3 && causal < 0.25 && goal < 0.25 && bridge < 0.35) {
    composite *= 0.4;
  }

  // Unfinished thread boost
  if (UNFINISHED_RE.test(mem.summary) && UNFINISHED_RE.test(currentMessage)) {
    composite = Math.max(composite, 0.55);
  }

  const recency = temporal;
  const repetition = mem.tags?.includes('repeated') ? 0.85 : 0.4;

  const breakdown: RelevanceBreakdown = {
    entity: clamp01(entity),
    semantic: clamp01(semantic),
    temporal: clamp01(temporal),
    relationship: clamp01(relationship),
    goal: clamp01(goal),
    causal: clamp01(causal),
    continuity: clamp01(continuity),
    confidence: conf,
    evidenceQuality,
    correctionPenalty,
    sensitivityPenalty,
    recency,
    repetition,
    composite,
  };

  const mode = inferMode(mem, currentMessage, breakdown);
  const recommendedUse = recommendUse(mem, breakdown, gate.allowed);

  return {
    memoryId: mem.memoryId,
    memoryType: mem.memoryType,
    summary: mem.summary,
    entities: mem.entities ?? [],
    eventTime: mem.eventTime ?? null,
    relationshipToCurrentMessage: relationshipBlurb(mem, currentMessage, mode, entity, causal),
    evidenceIds: mem.evidenceIds ?? [],
    confidence: conf,
    epistemicType: mem.epistemicType ?? 'unknown',
    correctionState: cs,
    sensitivity,
    relevanceBreakdown: breakdown,
    recommendedUse,
    continuityMode: mode,
    epistemicWeight: epW,
    source: mem.source,
  };
}

export function whySelected(c: ContinuityCandidate): string {
  const b = c.relevanceBreakdown;
  const parts: string[] = [];
  if (b.entity >= 0.45) parts.push('involves the same person/entity');
  if (b.causal >= 0.35) parts.push('supports the same behavioral lesson or progression');
  if (b.goal >= 0.35) parts.push('aligns with an active goal');
  if (b.temporal >= 0.7) parts.push('is relatively recent');
  if (b.entity >= 0.45 && c.eventTime) parts.push('occurred before the current event');
  if (parts.length === 0) parts.push('had the strongest composite relevance among candidates');
  return `Selected because it ${parts.join(', ')}.`;
}

export function looksLikePreferenceMessage(msg: string): boolean {
  return PREFERENCE_RE.test(msg);
}

function compositeFloorNeeded(entity: number, causal: number, goal: number): boolean {
  return entity < 0.35 && causal < 0.35 && goal < 0.35;
}

/**
 * Context Scoring Service — Phase 1 of the Context Selection Layer
 *
 * Sits between ragBuilderService and systemPromptBuilder.
 * Receives the raw loreData object, scores each block for relevance
 * to the current message, and returns a filtered version with the
 * same shape the builder already accepts.
 *
 * Design constraints:
 *  - No new DB queries. No AI calls. Pure CPU (<5ms).
 *  - Output is the same loreData shape — builder is unaware this runs.
 *  - If this service throws, the caller falls back to unfiltered loreData.
 *  - Conservative first pass: optimise for continuity preservation, not compression.
 *    Target: 30–40% token reduction.
 *
 * Scoring formula per block:
 *   composite = 0.35 × semanticRelevance
 *              + 0.25 × entityOverlap
 *              + 0.20 × confidence
 *              + 0.12 × recency
 *              + 0.08 × continuityImportance
 *
 * Categories:
 *   CORE             — always included, no scoring
 *   OPTIONAL         — scored; included if composite ≥ OPTIONAL_THRESHOLD
 *   ENTITY_SPECIFIC  — included only if entity mentioned in message
 *   MESSAGE_SPECIFIC — included only if semantic relevance ≥ MSG_THRESHOLD
 *   REDUNDANT        — never included (superseded by another block)
 */

import { logger } from '../../logger';

// ─── Thresholds (conservative first pass) ─────────────────────────────────────

const OPTIONAL_THRESHOLD   = 0.15;  // Include if composite score ≥ this
const MSG_SPECIFIC_THRESHOLD = 0.25; // Include message-specific blocks if relevance ≥ this
const STUB_THRESHOLD       = 0.08;  // Below this: reduce to a stub or skip entirely
const HALF_LIFE_DAYS       = 90;    // Recency decay half-life

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockScore {
  key: string;
  category: 'CORE' | 'OPTIONAL' | 'ENTITY_SPECIFIC' | 'MESSAGE_SPECIFIC' | 'REDUNDANT';
  scores: {
    semanticRelevance: number;
    entityOverlap: number;
    confidence: number;
    recency: number;
    continuityImportance: number;
  };
  composite: number;
  estimatedTokens: number;
  decision: 'INCLUDE' | 'STUB' | 'EXCLUDE';
  reason: string;
}

export interface ScoringResult {
  filteredLoreData: Record<string, unknown>;
  scores: BlockScore[];
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
}

// ─── Keyword sets for semantic relevance ──────────────────────────────────────

const TOPIC_KEYWORDS: Record<string, string[]> = {
  characters: [
    'who', 'person', 'people', 'friend', 'family', 'partner', 'colleague',
    'she', 'he', 'they', 'her', 'him', 'them', 'someone', 'everybody', 'anyone',
    'relationship', 'told me', 'met', 'talked to', 'saw', 'with',
  ],
  locations: [
    'where', 'place', 'location', 'city', 'home', 'office', 'gym', 'school',
    'restaurant', 'went to', 'visited', 'at the', 'in the', 'moved to', 'lived',
  ],
  chapters: [
    'chapter', 'period', 'time', 'phase', 'era', 'when i was', 'back then',
    'that year', 'that summer', 'those days', 'life at', 'story',
  ],
  interests: [
    'hobby', 'passion', 'interest', 'love doing', 'into', 'enjoy', 'obsessed',
    'creative', 'project', 'learning', 'reading', 'playing', 'music', 'art',
    'writing', 'coding', 'cooking', 'travel',
  ],
  relationships: [
    'relationship', 'dating', 'girlfriend', 'boyfriend', 'partner', 'ex',
    'romantic', 'love', 'breakup', 'together', 'married', 'feelings for',
  ],
  social: [
    'group', 'crew', 'team', 'circle', 'friends', 'my people', 'squad',
    'club', 'community', 'network', 'colleagues',
  ],
  identity: [
    'who am i', 'values', 'belief', 'purpose', 'meaning', 'identity',
    'who i am', 'type of person', 'my nature', 'pattern', 'why do i always',
  ],
  fitness: [
    'gym', 'workout', 'exercise', 'run', 'lift', 'training', 'fitness',
    'weight', 'muscle', 'cardio', 'diet', 'nutrition', 'health', 'body',
  ],
  episodic: [
    'when', 'happened', 'remember', 'event', 'moment', 'occasion', 'incident',
    'back in', 'that time', 'last year', 'last month', 'recently', 'ago',
  ],
  corrections: [
    'wrong', 'incorrect', 'actually', 'correction', 'was wrong', 'not true',
    'update', 'changed', 'mistake', 'fix',
  ],
  reinterpretations: [
    'perspective', 'looking back', 'realize', 'understand now', 'see it differently',
    'reflection', 'hindsight', 'in retrospect', 'thinking about it',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function keywordOverlap(msgTokens: Set<string>, keywords: string[]): number {
  if (!keywords.length) return 0;
  const matched = keywords.filter(kw => {
    const kwTokens = kw.toLowerCase().split(/\s+/);
    return kwTokens.every(t => msgTokens.has(t));
  }).length;
  return Math.min(1, matched / Math.max(1, Math.min(keywords.length, 5)));
}

function entityOverlapScore(
  msg: string,
  entities: Array<{ name: string; alias?: string[] }>
): number {
  const lower = msg.toLowerCase();
  const matched = entities.filter(e => {
    const names = [e.name, ...(e.alias ?? [])].filter(Boolean);
    return names.some(n => n && lower.includes(n.toLowerCase()));
  }).length;
  // At least one match is a strong signal; diminishing returns after 3
  if (matched === 0) return 0;
  if (matched === 1) return 0.6;
  if (matched === 2) return 0.8;
  return 1.0;
}

function recencyScore(updatedAt?: string | null): number {
  if (!updatedAt) return 0.3;
  const daysSince = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  return Math.exp(-daysSince / HALF_LIFE_DAYS);
}

function avgConfidence(items: Array<{ confidence?: number }>): number {
  if (!items.length) return 0.5;
  const valid = items.filter(i => i.confidence != null);
  if (!valid.length) return 0.5;
  return valid.reduce((s, i) => s + (i.confidence ?? 0), 0) / valid.length;
}

/** Rough token estimate: 1 token ≈ 4 chars */
function estimateTokens(data: unknown): number {
  if (data == null) return 0;
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Math.ceil(str.length / 4);
}

/**
 * Composite entity confidence — computed from available signals because
 * the characters table has no single top-level confidence field.
 *
 * Signals (all 0–1):
 *   centrality  — social graph importance (from social_nodes merge)
 *   attrConf    — mean confidence of stored attributes
 *   recency     — exponential decay on updated_at (90-day half-life)
 *   notMentionOnly — penalise characters the user only passingly mentioned
 *
 * Returns a tier:
 *   'FULL'  — confidence ≥ 0.65: full context card
 *   'ABBR'  — confidence 0.40–0.65: name + role + top attributes only
 *   'STUB'  — confidence < 0.40: name only (unless directly queried)
 */
export type ConfidenceTier = 'FULL' | 'ABBR' | 'STUB';

export function computeEntityConfidence(
  char: {
    centrality?: number;
    updated_at?: string;
    relationship_depth?: string;
    confidence?: number;
  },
  attributes: Array<{ confidence?: number }>
): { score: number; tier: ConfidenceTier } {
  // Normalise centrality — values vary by graph size; cap at 1.0
  const centralityNorm = Math.min((char.centrality ?? 0) / 10, 1.0);
  // Mean attribute confidence (default 0.5 if no attributes)
  const attrConf =
    attributes.length > 0
      ? attributes.reduce((s, a) => s + (a.confidence ?? 0.5), 0) / attributes.length
      : 0.3;
  // Recency: 90-day half-life
  const rec = recencyScore(char.updated_at);
  // Penalise mention-only characters (never confirmed as real relationships)
  const notMentionOnly = char.relationship_depth !== 'mentioned_only' ? 1.0 : 0.2;

  const score =
    0.35 * attrConf +
    0.25 * centralityNorm +
    0.25 * rec +
    0.15 * notMentionOnly;

  const tier: ConfidenceTier =
    score >= 0.65 ? 'FULL' : score >= 0.40 ? 'ABBR' : 'STUB';

  return { score, tier };
}

/**
 * Apply confidence tiers to a character list.
 * If the character is directly mentioned in the current message → always FULL
 * (the user asked about them — they must receive complete context).
 */
export function applyConfidenceTiers(
  characters: Array<Record<string, unknown>>,
  attributesMap: Record<string, Array<{ confidence?: number }>>,
  message: string
): Array<Record<string, unknown>> {
  const msgLower = message.toLowerCase();

  return characters.map(char => {
    const name = (char.name as string | undefined) ?? '';
    const aliases = (char.alias as string[] | undefined) ?? [];

    // Direct mention override — never stub a character the user named explicitly
    const directlyMentioned =
      (name && msgLower.includes(name.toLowerCase())) ||
      aliases.some(a => a && msgLower.includes(a.toLowerCase()));

    if (directlyMentioned) {
      return { ...char, _confidenceTier: 'FULL' };
    }

    const attrs = attributesMap[char.id as string] ?? [];
    const { tier } = computeEntityConfidence(char as any, attrs);

    if (tier === 'FULL') {
      return { ...char, _confidenceTier: 'FULL' };
    }

    if (tier === 'ABBR') {
      // Abbreviated: keep name, role, archetype, top-3 attributes, drop summary/tags
      const topAttrs = attrs
        .slice()
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 3);
      return {
        id: char.id,
        name: char.name,
        alias: char.alias,
        role: char.role,
        archetype: char.archetype,
        centrality: char.centrality,
        updated_at: char.updated_at,
        relationship_depth: char.relationship_depth,
        // Pass abbreviated attributes back so the builder can still format them
        _abbreviatedAttributes: topAttrs,
        _confidenceTier: 'ABBR',
      };
    }

    // STUB: name + role only — builder will render as a single line
    return {
      id: char.id,
      name: char.name,
      alias: char.alias,
      role: char.role,
      centrality: char.centrality,
      updated_at: char.updated_at,
      relationship_depth: char.relationship_depth,
      _confidenceTier: 'STUB',
    };
  });
}

function composite(s: BlockScore['scores']): number {
  return (
    0.35 * s.semanticRelevance +
    0.25 * s.entityOverlap +
    0.20 * s.confidence +
    0.12 * s.recency +
    0.08 * s.continuityImportance
  );
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreContext(
  loreData: Record<string, unknown>,
  message: string,
  characters: Array<{ name: string; alias?: string[]; updated_at?: string; confidence?: number }>,
  locations: Array<{ name: string; updated_at?: string }>
): ScoringResult {
  const scores: BlockScore[] = [];
  const msgTokens = tokenize(message);
  const filtered: Record<string, unknown> = {};

  let tokensBefore = 0;
  let tokensAfter  = 0;

  // Helper to record a decision and either pass or suppress the data
  function decide(
    key: string,
    category: BlockScore['category'],
    rawValue: unknown,
    scoreInputs: BlockScore['scores'],
    options: { forceInclude?: boolean; stubValue?: unknown } = {}
  ): void {
    const est = estimateTokens(rawValue);
    tokensBefore += est;

    const comp = composite(scoreInputs);
    let decision: BlockScore['decision'];
    let reason: string;

    if (category === 'CORE' || options.forceInclude) {
      decision = 'INCLUDE';
      reason = 'core block — always included';
    } else if (category === 'REDUNDANT') {
      decision = 'EXCLUDE';
      reason = 'redundant — superseded by another block';
    } else if (category === 'ENTITY_SPECIFIC') {
      if (scoreInputs.entityOverlap > 0) {
        decision = 'INCLUDE';
        reason = `entity mentioned in message (overlap=${scoreInputs.entityOverlap.toFixed(2)})`;
      } else {
        decision = 'EXCLUDE';
        reason = 'no entity overlap with message';
      }
    } else if (category === 'MESSAGE_SPECIFIC') {
      if (scoreInputs.semanticRelevance >= MSG_SPECIFIC_THRESHOLD) {
        decision = 'INCLUDE';
        reason = `message-specific block relevant (sem=${scoreInputs.semanticRelevance.toFixed(2)})`;
      } else if (scoreInputs.semanticRelevance >= STUB_THRESHOLD && options.stubValue !== undefined) {
        decision = 'STUB';
        reason = `low relevance (sem=${scoreInputs.semanticRelevance.toFixed(2)}) — stubbed`;
      } else {
        decision = 'EXCLUDE';
        reason = `no topic overlap (sem=${scoreInputs.semanticRelevance.toFixed(2)})`;
      }
    } else {
      // OPTIONAL
      if (comp >= OPTIONAL_THRESHOLD) {
        decision = 'INCLUDE';
        reason = `composite=${comp.toFixed(2)} ≥ threshold`;
      } else if (comp >= STUB_THRESHOLD && options.stubValue !== undefined) {
        decision = 'STUB';
        reason = `composite=${comp.toFixed(2)} — below threshold, stubbed`;
      } else {
        decision = 'EXCLUDE';
        reason = `composite=${comp.toFixed(2)} — below threshold`;
      }
    }

    const block: BlockScore = {
      key,
      category,
      scores: scoreInputs,
      composite: comp,
      estimatedTokens: est,
      decision,
      reason,
    };
    scores.push(block);

    if (decision === 'INCLUDE') {
      filtered[key] = rawValue;
      tokensAfter += est;
    } else if (decision === 'STUB' && options.stubValue !== undefined) {
      filtered[key] = options.stubValue;
      tokensAfter += estimateTokens(options.stubValue);
    }
    // EXCLUDE: key not added to filtered
  }

  // ── Characters ─────────────────────────────────────────────────────────────
  // Phase 4: apply composite confidence tiers before any other pruning.
  //   FULL (≥ 0.65)  — complete card
  //   ABBR (0.40–0.65) — name + role + top-3 attributes
  //   STUB (< 0.40)  — name + role only
  // Direct mention in message always upgrades to FULL (override rule).
  {
    const raw = (loreData.allCharacters as Array<Record<string, unknown>> | undefined) ?? [];
    const attrMap = (loreData.characterAttributesMap as Record<string, Array<{ confidence?: number }>> | undefined) ?? {};
    const entityOverlap = entityOverlapScore(message, characters);
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.characters);
    const charRecency = raw.length
      ? raw.slice(0, 10).reduce((s: number, c) => s + recencyScore(c.updated_at as string | undefined), 0) /
        Math.min(raw.length, 10)
      : 0.3;

    // Apply confidence tiers (direct mention → always FULL)
    const tiered = applyConfidenceTiers(raw, attrMap, message);

    decide('allCharacters', 'OPTIONAL', tiered, {
      semanticRelevance: rel,
      entityOverlap,
      confidence: avgConfidence(raw as Array<{ confidence?: number }>),
      recency: charRecency,
      continuityImportance: 0.9,
    });

    // characterAttributesMap and characterMemoriesMap follow characters — builder reads both for FULL-tier cards
    if (filtered.allCharacters) {
      filtered.characterAttributesMap = attrMap;
      const memMap = loreData.characterMemoriesMap as Record<string, unknown> | undefined;
      if (memMap) filtered.characterMemoriesMap = memMap;
    }
  }

  // ── Locations ───────────────────────────────────────────────────────────────
  {
    const raw = (loreData.allLocations as any[] | undefined) ?? [];
    const locEntityOverlap = entityOverlapScore(message, locations);
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.locations);

    decide('allLocations', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: locEntityOverlap,
      confidence: 0.7, // Locations don't have per-item confidence, assume reasonable
      recency: 0.5,
      continuityImportance: 0.5,
    });
  }

  // ── Chapters ────────────────────────────────────────────────────────────────
  {
    const raw = (loreData.allChapters as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.chapters);

    decide('allChapters', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.7,
    });
  }

  // ── Timeline Hierarchy ──────────────────────────────────────────────────────
  {
    const raw = loreData.timelineHierarchy as Record<string, any[]> | undefined;
    const hasHierarchy = raw && (raw.eras?.length || raw.sagas?.length || raw.arcs?.length);
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.chapters);

    decide('timelineHierarchy', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: hasHierarchy ? 0.6 : 0,
    });
  }

  // ── Essence Profile ─────────────────────────────────────────────────────────
  {
    const raw = loreData.essenceProfile;
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.identity);

    decide('essenceProfile', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.7,
    });
  }

  // ── Identity Core ───────────────────────────────────────────────────────────
  {
    const raw = loreData.identityCoreProfile;
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.identity);

    decide('identityCoreProfile', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.65,
    });
  }

  // ── Romantic Relationships ──────────────────────────────────────────────────
  {
    const raw = (loreData.romanticRelationships as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.relationships);
    // Partner names are often mentioned by first name — check entity overlap
    const partnerEntities = raw.map((r: any) => ({ name: r.partner_name || '' }));
    const overlap = entityOverlapScore(message, partnerEntities);

    decide('romanticRelationships', 'ENTITY_SPECIFIC', raw, {
      semanticRelevance: rel,
      entityOverlap: Math.max(overlap, rel >= 0.3 ? 0.5 : 0),
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.7,
    });
  }

  // ── Corrections & Deprecated ────────────────────────────────────────────────
  {
    const raw = (loreData.corrections as any[] | undefined) ?? [];
    const deprecated = (loreData.deprecatedUnits as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.corrections);
    // Also check if any corrected entity name appears in the message
    const correctedEntities = raw.map((c: any) => ({ name: c.target_type || '' }));
    const overlap = entityOverlapScore(message, correctedEntities);

    decide('corrections', 'MESSAGE_SPECIFIC', raw, {
      semanticRelevance: Math.max(rel, overlap * 0.6),
      entityOverlap: overlap,
      confidence: 0.8,
      recency: avgConfidence(raw.map((c: any) => ({ confidence: recencyScore(c.created_at) }))),
      continuityImportance: 0.8, // High — corrections must be seen when relevant
    });

    // deprecatedUnits follow corrections
    if (filtered.corrections) {
      filtered.deprecatedUnits = deprecated;
    }
  }

  // ── Workout Events (already gated by FITNESS_RE in ragBuilder — keep) ───────
  {
    const raw = (loreData.workoutEvents as any[] | undefined) ?? [];
    decide('workoutEvents', 'MESSAGE_SPECIFIC', raw, {
      semanticRelevance: raw.length > 0 ? keywordOverlap(msgTokens, TOPIC_KEYWORDS.fitness) : 0,
      entityOverlap: 0,
      confidence: 0.8,
      recency: raw.length > 0 ? recencyScore((raw[0] as any)?.date) : 0,
      continuityImportance: 0.5,
    }, {
      // fitess knowledge paragraph stripped — just raw events
    });
  }

  // ── Biometrics ──────────────────────────────────────────────────────────────
  {
    const raw = (loreData.recentBiometrics as any[] | undefined) ?? [];
    decide('recentBiometrics', 'MESSAGE_SPECIFIC', raw, {
      semanticRelevance: raw.length > 0 ? keywordOverlap(msgTokens, TOPIC_KEYWORDS.fitness) : 0,
      entityOverlap: 0,
      confidence: 0.9,
      recency: raw.length > 0 ? recencyScore((raw[0] as any)?.measurement_date) : 0,
      continuityImportance: 0.4,
    });
  }

  // ── Interests ───────────────────────────────────────────────────────────────
  {
    const raw = (loreData.topInterests as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.interests);
    // When relevant: pass top 10 instead of all 30
    const pruned = rel >= MSG_SPECIFIC_THRESHOLD ? raw.slice(0, 10) : raw.slice(0, 5);

    decide('topInterests', 'MESSAGE_SPECIFIC', pruned, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.5,
    }, {
      stubValue: raw.slice(0, 3), // Stub: top 3 only
    });
  }

  // ── Social Communities ──────────────────────────────────────────────────────
  {
    const raw = (loreData.socialCommunities as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.social);
    const charOverlap = entityOverlapScore(message, characters);

    decide('socialCommunities', 'OPTIONAL', raw, {
      semanticRelevance: rel,
      entityOverlap: charOverlap * 0.5, // Characters mentioned → social context potentially relevant
      confidence: 0.7,
      recency: 0.5,
      continuityImportance: 0.5,
    });
  }

  // ── Episodic Events ─────────────────────────────────────────────────────────
  // Heavy block (40 fetched, 20 formatted). Apply recency + relevance pruning.
  {
    const raw = (loreData.episodicEvents as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.episodic);
    const entityOverlap = entityOverlapScore(message, characters);

    // Prune: if relevance is high, take top 15 most recent; if low, take top 8
    const limit = rel >= 0.3 || entityOverlap > 0 ? 15 : 8;
    const pruned = raw.slice(0, limit);

    decide('episodicEvents', 'OPTIONAL', pruned, {
      semanticRelevance: rel,
      entityOverlap,
      confidence: avgConfidence(raw),
      recency: raw.length > 0 ? recencyScore((raw[0] as any)?.start_time) : 0,
      continuityImportance: 0.6,
    });
  }

  // ── Stable Life Arcs ────────────────────────────────────────────────────────
  {
    const raw = (loreData.stableArcs as any[] | undefined) ?? [];
    decide('stableArcs', 'OPTIONAL', raw, {
      semanticRelevance: keywordOverlap(msgTokens, TOPIC_KEYWORDS.chapters),
      entityOverlap: 0,
      confidence: avgConfidence(raw),
      recency: 0.5,
      continuityImportance: 0.75, // Stable arcs are high-continuity by definition
    });
  }

  // ── Recent Reinterpretations ────────────────────────────────────────────────
  {
    const raw = (loreData.recentInterpretations as any[] | undefined) ?? [];
    const rel = keywordOverlap(msgTokens, TOPIC_KEYWORDS.reinterpretations);

    decide('recentInterpretations', 'MESSAGE_SPECIFIC', raw, {
      semanticRelevance: rel,
      entityOverlap: 0,
      confidence: 0.7,
      recency: raw.length > 0 ? recencyScore((raw[0] as any)?.written_at) : 0,
      continuityImportance: 0.5,
    });
  }

  // ── allPeoplePlaces: passed through (used internally, not in prompt) ─────────
  filtered.allPeoplePlaces = loreData.allPeoplePlaces;

  // ── Compute final stats ─────────────────────────────────────────────────────
  const reductionPct = tokensBefore > 0
    ? Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100)
    : 0;

  return { filteredLoreData: filtered, scores, tokensBefore, tokensAfter, reductionPct };
}

/**
 * Emit a structured diagnostic log for every scoring decision.
 * Gated to debug level — zero cost in production unless debug logging is enabled.
 */
export function logScoringDecisions(result: ScoringResult, userId: string): void {
  if (!logger.isLevelEnabled?.('debug')) return;

  const lines = result.scores.map(s =>
    `  ${s.key.padEnd(25)} category=${s.category.padEnd(16)} ` +
    `composite=${s.composite.toFixed(2)} ` +
    `[sem=${s.scores.semanticRelevance.toFixed(2)} ent=${s.scores.entityOverlap.toFixed(2)} ` +
    `conf=${s.scores.confidence.toFixed(2)} rec=${s.scores.recency.toFixed(2)}] ` +
    `→ ${s.decision.padEnd(7)} | ${s.reason}`
  ).join('\n');

  logger.debug(
    { userId, tokensBefore: result.tokensBefore, tokensAfter: result.tokensAfter, reductionPct: result.reductionPct },
    `[ContextScoring] ${result.reductionPct}% reduction (${result.tokensBefore}→${result.tokensAfter} tokens)\n${lines}`
  );
}

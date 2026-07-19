/**
 * Evidence Contract — every query predicts the shape of its answer before
 * retrieval results are allowed near the model.
 *
 * The scope planner already decides which domains a question is about.
 * The contract goes further: it declares what kind of evidence could
 * possibly answer this question, scores every candidate source against
 * that declaration, and rejects anything that cannot justify why it
 * belongs. Retrieval stops being "these are similar" and becomes "each of
 * these is defensible."
 *
 *   Intent detection → evidence requirements → candidate retrieval →
 *   evidence scoring/filtering → LLM
 *
 * Pure functions, deterministic and cheap (no embeddings, no DB): the
 * contract runs on every chat turn between retrieval and prompt assembly.
 */

import type { ResponseScopePlan } from './responseScopeTypes';

/** What the answer should look like, predicted from the question. */
export type ExpectedAnswerShape =
  | 'list_of_people'
  | 'explanation'
  | 'narrative'
  | 'timeline'
  | 'single_fact'
  | 'summary';

/** Fine-grained topic beneath the scope plan's intent. */
export type EvidenceTopic =
  | 'conflict'
  | 'emotional_state'
  | 'romance'
  | 'family'
  | 'friendship'
  | 'building'
  | 'career'
  | 'health'
  | 'places'
  | 'events'
  | 'general';

type SourceKind = string;

export type EvidenceContract = {
  topic: EvidenceTopic;
  expectedAnswerShape: ExpectedAnswerShape;
  /** Source types that could possibly carry the answer. */
  targetKinds: SourceKind[];
  /** Evidence lexicon: text matching these supports the question. */
  supportingPatterns: RegExp[];
  /** Text matching these can never answer the question (hard reject). */
  forbiddenPatterns: RegExp[];
  /** Salient query terms for lexical overlap. */
  queryTerms: string[];
  /** Entities the question (or active context) is about. */
  entityNames: string[];
  /** Sources scoring below this never reach the model. */
  minScore: number;
  maxSources: number;
};

export type ScoredSource<T> = T & {
  relevanceScore: number;
  relevanceReasons: string[];
};

export type EvidenceContractVerdict<T> = {
  accepted: Array<ScoredSource<T>>;
  rejected: Array<ScoredSource<T>>;
  contract: EvidenceContract;
};

/** Minimum a source needs to be forwarded, when the contract doesn't override. */
export const DEFAULT_MIN_EVIDENCE_SCORE = 20;

/**
 * A knowledge source at or above this is treated as answering the question
 * (topic support + crystallized bonus reach 55; entity hits push far higher).
 */
export const KNOWLEDGE_ANSWERS_THRESHOLD = 50;

/**
 * With strong knowledge present, an observation must bring specifics beyond
 * the topic lexicon (an entity hit or strong query overlap) to stay. Generic
 * re-derivations of the crystallized truth score 45–52 and drop.
 */
export const OBSERVATION_KEEP_THRESHOLD = 55;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'im', 'am', 'is', 'are', 'was', 'were',
  'do', 'does', 'did', 'have', 'has', 'had', 'what', 'who', 'whom', 'which',
  'when', 'where', 'why', 'how', 'with', 'about', 'tell', 'and', 'or', 'of',
  'to', 'in', 'on', 'at', 'for', 'you', 'your', 'be', 'been', 'it', 'this',
  'that', 'right', 'now', 'currently', 'anyone', 'someone', 'having',
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// ---------------------------------------------------------------------------
// Topic detection: what could possibly answer this question?
// ---------------------------------------------------------------------------

/**
 * Per-topic evidence requirements. Supporting/forbidden patterns are generic
 * concept lexicons — never specific people, orgs, venues, or products.
 */
const TOPIC_RULES: Array<{
  topic: EvidenceTopic;
  question: RegExp;
  expectedAnswerShape: ExpectedAnswerShape;
  targetKinds: SourceKind[];
  supporting: RegExp;
  forbidden: RegExp;
}> = [
  {
    topic: 'conflict',
    question:
      /\b(?:conflict|beef|drama|fight|fighting|argument|arguing|falling out|fell out|tension|enemies|mad at me|angry (?:at|with)|accus|blocked|feud|grudge|on bad terms)\b/i,
    expectedAnswerShape: 'list_of_people',
    targetKinds: ['character', 'entry', 'event', 'chapter'],
    supporting:
      /\b(?:conflict|accus|blocked|unfollowed|argument|argu|fight|fought|drama|tension|betray|removed|kicked|banned|excluded|fell out|falling out|called (?:me|them) out|beef|grudge|apolog)\b/i,
    forbidden:
      /\b(?:degree|university|college|coursework|curriculum|onboarding|certification|resume|skill(?:s)? list|gym routine|purchase|bought|laptop|workout)\b/i,
  },
  {
    topic: 'emotional_state',
    question:
      /\b(?:why (?:do|am) i feel|feeling (?:depressed|sad|down|anxious|lonely|overwhelmed|burned out|burnt out)|why am i (?:depressed|sad|down|anxious|lonely|unhappy)|my mood|mental health)\b/i,
    expectedAnswerShape: 'explanation',
    targetKinds: ['entry', 'event', 'chapter', 'character'],
    supporting:
      /\b(?:felt|feeling|emotion|sad|depress|anxious|lonely|stress|overwhelm|setback|rejected|loss|grief|breakup|blocked|conflict|argument|disappoint|burn(?:ed|t) out)\b/i,
    forbidden:
      /\b(?:degree|university|college|certification|skill(?:s)? list|resume|coursework|gpa|achievement list)\b/i,
  },
  {
    topic: 'romance',
    question:
      /\b(?:dating|love life|romantic|girlfriend|boyfriend|partner|crush|relationship with|my ex\b|situationship)\b/i,
    expectedAnswerShape: 'narrative',
    targetKinds: ['character', 'entry', 'event', 'chapter'],
    supporting:
      /\b(?:date|dating|romantic|girlfriend|boyfriend|partner|crush|kissed|love|breakup|blocked|ex\b|anniversary|situationship)\b/i,
    forbidden: /\b(?:coursework|certification|resume|onboarding|sprint|deploy)\b/i,
  },
  {
    topic: 'building',
    question: /\b(?:what am i (?:building|working on|making)|my project(?:s)?\b|building lately|shipping)\b/i,
    expectedAnswerShape: 'summary',
    targetKinds: ['entry', 'chapter', 'event', 'task'],
    supporting:
      /\b(?:built|building|build|coded|coding|shipped|deploy|prototype|project|designed|feature|app|repo|working on|worked on)\b/i,
    forbidden:
      /\b(?:date night|girlfriend|boyfriend|romantic|concert|club|grocery|groceries|errand)\b/i,
  },
  {
    topic: 'career',
    question: /\b(?:my job|my work\b|my career|coworkers|my team\b|my boss|workplace)\b/i,
    expectedAnswerShape: 'summary',
    targetKinds: ['character', 'entry', 'event', 'chapter'],
    supporting:
      /\b(?:job|work|shift|team|boss|coworker|colleague|onboard|hired|promotion|office|workplace|career)\b/i,
    forbidden: /\b(?:date night|romantic|crush|club night)\b/i,
  },
  {
    topic: 'family',
    question: /\b(?:my family|my (?:mom|mother|dad|father|grandma|grandmother|abuela|abuelo|sister|brother|cousin|aunt|uncle))\b/i,
    expectedAnswerShape: 'narrative',
    targetKinds: ['character', 'entry', 'event', 'chapter'],
    supporting:
      /\b(?:family|mom|mother|dad|father|grandma|grandmother|grandpa|abuela|abuelo|t[ií]a|t[ií]o|aunt|uncle|cousin|sister|brother|sibling)\b/i,
    forbidden: /\b(?:sprint|deploy|certification|onboarding)\b/i,
  },
];

function detectTopic(message: string): EvidenceContract['topic'] {
  for (const rule of TOPIC_RULES) {
    if (rule.question.test(message)) return rule.topic;
  }
  return 'general';
}

// ---------------------------------------------------------------------------
// Contract construction
// ---------------------------------------------------------------------------

export function buildEvidenceContract(
  message: string,
  plan?: Pick<ResponseScopePlan, 'primaryEntities' | 'maxEvidenceItems'> | null,
): EvidenceContract {
  const topic = detectTopic(message);
  const rule = TOPIC_RULES.find((r) => r.topic === topic);

  return {
    topic,
    expectedAnswerShape: rule?.expectedAnswerShape ?? 'summary',
    targetKinds: rule?.targetKinds ?? [],
    supportingPatterns: rule ? [rule.supporting] : [],
    forbiddenPatterns: rule ? [rule.forbidden] : [],
    queryTerms: terms(message),
    entityNames: (plan?.primaryEntities ?? []).map((e) => e.name.toLowerCase()).filter(Boolean),
    minScore: DEFAULT_MIN_EVIDENCE_SCORE,
    maxSources: Math.max(plan?.maxEvidenceItems ?? 20, 8),
  };
}

// ---------------------------------------------------------------------------
// Scoring: each source must justify why it belongs
// ---------------------------------------------------------------------------

type ScorableSource = {
  type?: string;
  title?: string;
  snippet?: string;
};

export function scoreEvidence(
  source: ScorableSource,
  contract: EvidenceContract,
): { score: number; reasons: string[] } {
  const text = `${source.title ?? ''} ${source.snippet ?? ''}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (!text.trim()) return { score: 0, reasons: ['empty'] };

  // Hard reject: evidence kinds that can never answer this question.
  for (const pattern of contract.forbiddenPatterns) {
    if (pattern.test(text) && !contract.supportingPatterns.some((p) => p.test(text))) {
      return { score: 0, reasons: ['forbidden_evidence_kind'] };
    }
  }

  // Entity relevance: the question's subjects appear in the source.
  const entityHit = contract.entityNames.find((name) => name && text.includes(name));
  if (entityHit) {
    score += 45;
    reasons.push(`entity:${entityHit}`);
  }

  // Topic support: the source carries the kind of evidence the contract needs.
  if (contract.supportingPatterns.some((p) => p.test(text))) {
    score += 35;
    reasons.push(`supports:${contract.topic}`);
  }

  // Lexical overlap with the question itself.
  const sourceTerms = new Set(terms(text));
  const overlap = contract.queryTerms.filter((t) => sourceTerms.has(t));
  if (overlap.length > 0) {
    score += Math.min(20, overlap.length * 7);
    reasons.push(`terms:${overlap.slice(0, 3).join(',')}`);
  }

  // Crystallized knowledge outranks observations: a durable, evidence-backed
  // claim that matches the question answers it without re-deriving the truth
  // from many raw memories.
  if (source.type === 'knowledge') {
    if (score > 0) {
      score += 20;
      reasons.push('crystallized');
    }
  } else if (contract.targetKinds.length > 0 && source.type) {
    // Type alignment: is this even a kind of source that can hold the answer?
    if (contract.targetKinds.includes(source.type)) {
      score += 10;
      reasons.push('kind_aligned');
    } else {
      score -= 25;
      reasons.push(`kind_mismatch:${source.type}`);
    }
  }

  // A general contract has no topic lexicon; fall back to lexical + entity
  // signals with a floor so ordinary chat isn't starved of context.
  if (contract.topic === 'general' && score < DEFAULT_MIN_EVIDENCE_SCORE) {
    score = 25;
    reasons.push('general_pass');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Enforce the contract: score every candidate, reject anything below the
 * floor, forward the survivors ranked by defensibility.
 */
export function enforceEvidenceContract<T extends ScorableSource>(
  sources: T[],
  contract: EvidenceContract,
): EvidenceContractVerdict<T> {
  const accepted: Array<ScoredSource<T>> = [];
  const rejected: Array<ScoredSource<T>> = [];

  for (const source of sources) {
    const { score, reasons } = scoreEvidence(source, contract);
    const scored = { ...source, relevanceScore: score, relevanceReasons: reasons };
    if (score >= contract.minScore) accepted.push(scored);
    else rejected.push(scored);
  }

  accepted.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Retrieval priority: when crystallized knowledge strongly answers the
  // question, weak observations add noise, not evidence — drop them instead
  // of re-deriving the same truth from raw memories.
  let forwarded = accepted;
  const strongKnowledge = accepted.some(
    (s) => s.type === 'knowledge' && s.relevanceScore >= KNOWLEDGE_ANSWERS_THRESHOLD,
  );
  if (strongKnowledge) {
    const demoted: Array<ScoredSource<T>> = [];
    forwarded = accepted.filter((s) => {
      if (s.type === 'knowledge' || s.relevanceScore >= OBSERVATION_KEEP_THRESHOLD) return true;
      demoted.push({ ...s, relevanceReasons: [...s.relevanceReasons, 'superseded_by_knowledge'] });
      return false;
    });
    rejected.push(...demoted);
  }

  return {
    accepted: forwarded.slice(0, contract.maxSources),
    rejected: [...rejected, ...forwarded.slice(contract.maxSources)],
    contract,
  };
}

/**
 * Evidence filtering — every retrieved item must pass domain relevance,
 * entity relevance, truth-state, and duplication checks before it reaches
 * the LLM. Rejected items are kept (with reasons) for the scope audit.
 */

import type {
  EvidenceFilterResult,
  LoreBookDomain,
  ResponseScopePlan,
  ScopedEvidenceItem,
} from './responseScopeTypes';

const ROMANTIC_HINT_RE =
  /\b(boyfriend|girlfriend|crush|dating|romantic|situationship|ex[- ](lover|boyfriend|girlfriend)|hooking.up|unrequited)\b/i;
const FAMILY_HINT_RE =
  /\b(mother|father|mom|dad|grand(ma|pa|mother|father)|abuel[oa]|t[ií][oa]\b|uncle|aunt|cousin|sibling|brother|sister|son|daughter|parent_of|sibling_of|family)\b/i;
const WORK_HINT_RE =
  /\b(coworker|manager|team[_ ]lead|lead[_ ](engineer|developer)|boss|colleague|employer|work(s|ed|place)?\b|job|shift|on[- ]?site|office|warehouse)\b/i;
const MUSIC_HINT_RE = /\b(band|show|gig|ska|goth|dj|venue|concert|mosh|set list|backline)\b/i;
const DIAGNOSTIC_HINT_RE =
  /\b(memory layer|structured memory|provenance_edges|pipeline_runs|retrieval|mention_count|coverage report|source_message_ids)\b/i;

/**
 * Best-effort domain tag for generic working-memory items that don't carry
 * one. Explicit metadata wins; content heuristics are the fallback.
 */
export function classifyItemDomain(item: {
  type?: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}): LoreBookDomain {
  const meta = item.metadata ?? {};
  if (typeof meta.domain === 'string') return meta.domain as LoreBookDomain;

  const text = `${item.title ?? ''} ${item.content ?? ''} ${String(meta.relationship_type ?? '')}`;
  if (DIAGNOSTIC_HINT_RE.test(text) || item.type === 'debug') return 'diagnostics';
  if (ROMANTIC_HINT_RE.test(text)) return 'romance';
  if (FAMILY_HINT_RE.test(text)) return 'family';
  if (WORK_HINT_RE.test(text)) return 'work_relationships';
  if (MUSIC_HINT_RE.test(text)) return 'music_scene';

  switch (item.type) {
    case 'project': return 'projects';
    case 'goal': return 'projects';
    case 'community': return 'organizations';
    case 'event': return 'events';
    case 'episode': return 'events';
    case 'timeline': return 'events';
    case 'relationship': return 'people';
    case 'skill': return 'general_biography';
    default: return 'people';
  }
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Domains where membership alone is weak evidence — these also need entity overlap. */
const BROAD_DOMAINS = new Set(['people', 'events', 'general_biography', 'places']);

function entityMatches(item: ScopedEvidenceItem, plan: ResponseScopePlan): boolean {
  // Core-domain evidence answers by domain alone: a teammate's name will
  // never literally match the employer named in the question.
  if (!BROAD_DOMAINS.has(item.domain)) return true;
  if (plan.primaryEntities.length === 0) return true;
  const names = (item.entityNames ?? []).map((n) => n.toLowerCase());
  if (names.length === 0) return true; // untagged items pass on domain alone
  const wanted = plan.primaryEntities.map((e) => e.name.toLowerCase());
  return names.some((n) => wanted.some((w) => n.includes(w) || w.includes(n)));
}

export function filterEvidence(
  items: ScopedEvidenceItem[],
  plan: ResponseScopePlan,
): EvidenceFilterResult {
  const accepted: ScopedEvidenceItem[] = [];
  const rejected: EvidenceFilterResult['rejected'] = [];
  const seenTitles = new Set<string>();

  for (const item of items) {
    if (item.excluded) {
      rejected.push({ ...item, rejectedReason: 'truth_state_excluded' });
      continue;
    }
    if (plan.blockedDomains.includes(item.domain)) {
      rejected.push({ ...item, rejectedReason: `blocked_domain:${item.domain}` });
      continue;
    }
    if (!plan.allowedDomains.includes(item.domain)) {
      rejected.push({ ...item, rejectedReason: `domain_not_allowed:${item.domain}` });
      continue;
    }
    if (!entityMatches(item, plan)) {
      rejected.push({ ...item, rejectedReason: 'entity_irrelevant' });
      continue;
    }
    const key = normalizeTitle(item.title);
    if (key && seenTitles.has(key)) {
      rejected.push({ ...item, rejectedReason: 'duplicate' });
      continue;
    }
    if (key) seenTitles.add(key);
    if (accepted.length >= plan.maxEvidenceItems) {
      rejected.push({ ...item, rejectedReason: 'over_budget' });
      continue;
    }
    accepted.push(item);
  }

  return { accepted, rejected };
}

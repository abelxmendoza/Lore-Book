import {
  BOOK_QUERY_DOMAINS,
  type BookQueryDomain,
} from '@lorebook/api-contracts';

export const BOOK_QUERY_DOMAIN_HINTS: Record<BookQueryDomain, RegExp> = {
  character: /\b(?:people|person|characters?|friends?|coworkers?|aliases?)\b/i,
  organization: /\b(?:groups?|organizations?|communities|clubs?|teams?|bands?|companies|employers?|workplaces?|schools?|universit(?:y|ies)|colleges?|education|degrees?)\b/i,
  family: /\b(?:family|relatives?|kinship|maternal|paternal|cousins?|siblings?|parents?|household)\b/i,
  location: /\b(?:places?|locations?|venues?|where|visited|lived|cities|address)\b/i,
  romance: /\b(?:dating|romance|romantic|relationships?|crush|partner|ex(?:es)?|love)\b/i,
  project: /\b(?:projects?|building|shipped|software|creative work)\b/i,
  skill: /\b(?:skills?|practice|learning|proficiency|abilities|good at)\b/i,
  quest: /\b(?:quests?|goals?|working on|priorities|blocked|deadlines?|progress)\b/i,
  event: /\b(?:events?|life log|logged moments?|calendar entries|education timeline|career timeline)\b/i,
  document: /\b(?:documents?|files?|uploads?|resume|resumes|cv|pdf|source file|work history|job history|jobs?|school history|schools?|education|degree|degrees|contact|email|phone)\b/i,
  narrative: /\b(?:narrative|anchors?|eras?|chapters?|themes?|story arcs?)\b/i,
};

const EXPLICIT_QUERY_LANGUAGE =
  /(?:^(?:please\s+)?(?:show|find|list|which|what|who|where|when|search|query|compare)\b|\b(?:connect|related|mentions?|supports?|across|how many|do i have)\b)/i;

const GRAPH_QUERY_LANGUAGE =
  /\b(?:who introduced|how do i know|connected to|connection between|what links|through whom|know each other|in common)\b/i;

const GENERIC_CHAT_QUERY_DOMAINS = new Set<BookQueryDomain>([
  'event',
  'document',
  'narrative',
]);

export function detectBookQueryDomains(message: string): BookQueryDomain[] {
  return BOOK_QUERY_DOMAINS.filter((domain) => BOOK_QUERY_DOMAIN_HINTS[domain].test(message));
}

/**
 * Generic Book chat routing is intentionally narrow:
 * - two or more Book domains means the question needs cross-Book retrieval;
 * - People, Organizations, Family, Places, Romance, Projects, Skills, and
 *   Quests retain their existing handlers and richer domain-specific semantics.
 * - Life Log, Documents, and Narrative use the generic adapter because they do
 *   not yet have a dedicated mature mode handler.
 */
export function isUniversalBookQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (!EXPLICIT_QUERY_LANGUAGE.test(text)) return false;
  const domains = detectBookQueryDomains(text);
  if (domains.length >= 2) return true;
  if (GRAPH_QUERY_LANGUAGE.test(text)) {
    // A graph-shaped question within one mature Book (for example
    // "Which organizations is Marcus connected to?") belongs to that Book's
    // compiler. The universal adapter is for actual cross-Book paths.
    return domains.length === 0;
  }
  return domains.some((domain) => GENERIC_CHAT_QUERY_DOMAINS.has(domain));
}

export function isGraphBookQueryRequest(message: string): boolean {
  return GRAPH_QUERY_LANGUAGE.test(message);
}

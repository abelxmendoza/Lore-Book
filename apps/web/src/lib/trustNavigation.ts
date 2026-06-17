import type { ReviewQueueItem, TrustDomain, UnknownGap } from '../api/trust';

const DOMAIN_BOOK_PATH: Record<TrustDomain, string> = {
  characters: '/characters',
  locations: '/locations',
  organizations: '/organizations',
  projects: '/projects',
  goals: '/discovery/values-habits',
  skills: '/skills',
  communities: '/organizations',
  relationships: '/love',
  events: '/events',
  households: '/family',
};

export function resolveTrustItemRoute(item: Pick<ReviewQueueItem, 'action' | 'kind' | 'domain' | 'reason' | 'metadata'>): string {
  const action = item.action ?? item.kind;

  switch (action) {
    case 'review_contradiction':
      return '/discovery/contradictions';
    case 'review_alert':
      return '/discovery/correction-dashboard';
    case 'entity_authority':
      return '/discovery/memory-review';
    case 'merge_or_dismiss':
      return DOMAIN_BOOK_PATH[item.domain] ?? '/characters';
    case 'confirm_or_reject':
      return DOMAIN_BOOK_PATH[item.domain] ?? '/characters';
    case 'fill_gap':
      return `/chat?prompt=${encodeURIComponent(item.reason)}`;
    default:
      if (item.kind === 'contradiction' || item.kind === 'contradiction_alert') {
        return '/discovery/correction-dashboard';
      }
      if (item.kind === 'duplicate_entity') {
        return DOMAIN_BOOK_PATH[item.domain] ?? '/characters';
      }
      if (item.kind.startsWith('mentioned_') || item.kind === 'no_relationship' || item.kind === 'sparse_entity') {
        return `/chat?prompt=${encodeURIComponent(item.reason)}`;
      }
      return DOMAIN_BOOK_PATH[item.domain] ?? '/chat';
  }
}

export function resolveUnknownGapRoute(gap: Pick<UnknownGap, 'prompt' | 'domain' | 'kind'>): string {
  if (gap.kind === 'timeline_void') return '/gaps';
  if (gap.prompt) return `/chat?prompt=${encodeURIComponent(gap.prompt)}`;
  return DOMAIN_BOOK_PATH[gap.domain] ?? '/chat';
}

export function trustDomainBookPath(domain: TrustDomain): string {
  return DOMAIN_BOOK_PATH[domain];
}

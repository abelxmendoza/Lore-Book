/**
 * Read-path filter for Knowledge Gaps / Trust Coverage.
 *
 * Write-path guards (entityQualityGate, projectTypeGuard) already reject
 * alt-account testing chatter and consumer gadgets. Persisted rows from
 * before those guards — and omega_entities typed as PERSON by mistake —
 * still showed up as "Review next" on a real account.
 */
import { isAltAccountTestingCommentary } from '../lorebook/quality/productMetaCommentaryGuard';
import { isRejectedProjectSuggestionName } from '../lexical/projects/projectTypeGuard';
import { guardConsumerAppReference } from '../lexical/projects/projectConsumerAppGuard';
import { guardObjectReference } from '../lexical/projects/projectObjectGuard';
import type { TrustDomain } from './trustTypes';

const GREETING_FRAGMENT = /^(?:hi|hey|hello|yo)\s+i['']?m$/i;
const BARE_PRODUCT_DEVICE = /^(?:amazon\s+)?ring(?:\s+doorbell)?$/i;

export function isTrustSurfaceNoise(
  label: string,
  extraText = '',
  domain?: TrustDomain
): boolean {
  const name = (label ?? '').trim();
  if (!name) return true;

  const haystack = `${name} ${extraText}`.trim();
  if (isAltAccountTestingCommentary(name) || isAltAccountTestingCommentary(haystack)) {
    return true;
  }

  if (GREETING_FRAGMENT.test(name) || BARE_PRODUCT_DEVICE.test(name.toLowerCase())) {
    return true;
  }

  if (domain === 'projects' && isRejectedProjectSuggestionName(name, undefined, haystack || name)) {
    return true;
  }

  const consumer = guardConsumerAppReference(name, extraText || name);
  if (!consumer.allowed) return true;

  const object = guardObjectReference(name, extraText || name);
  if (!object.allowed) return true;

  return false;
}

/**
 * Live place-name identity checks for merge resolve + Location Book folding.
 * Prefer display name / aliases over a possibly-stale normalized_name column.
 */

import {
  containmentIsPossessive,
  normalizeNameKey,
  namesOverlapByContainment,
} from '../../utils/nameNormalization';

/**
 * True when a canonical locations row is the same place as `candidateName`.
 * Uses the LIVE display name + aliases — never trust a stale normalized_name
 * column alone (that caused "First Street Pool" to map onto
 * "First Street Pool & Billiards" and fail merge as self-merge).
 */
export function locationRowMatchesResolvedName(
  row: {
    name: string;
    normalized_name?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  candidateName: string,
): boolean {
  const candidate = candidateName.trim();
  if (!candidate) return false;
  const candidateKey = normalizeNameKey(candidate);
  const liveKey = normalizeNameKey(row.name);
  if (liveKey === candidateKey) return true;

  const aliases = Array.isArray(row.metadata?.aliases)
    ? (row.metadata!.aliases as unknown[]).filter(
        (alias): alias is string => typeof alias === 'string' && alias.trim().length > 0,
      )
    : [];
  return aliases.some((alias) => normalizeNameKey(alias) === candidateKey);
}

/**
 * True when `shadowName` should fold into `hostName` on the Location Book
 * (short venue card vs "Name & Billiards", alias twin, safe containment).
 * Refuses city/geo subsumption like Anaheim ⊂ Anaheim Family Home.
 */
export function isPlaceNameShadowOf(
  shadowName: string,
  host: {
    name: string;
    metadata?: Record<string, unknown> | null;
  },
): boolean {
  if (locationRowMatchesResolvedName(host, shadowName)) return true;

  const shadowKey = normalizeNameKey(shadowName);
  const hostKey = normalizeNameKey(host.name);
  if (!shadowKey || !hostKey || shadowKey === hostKey) return shadowKey === hostKey;

  // "First Street Pool" → "First Street Pool & Billiards" / "… and Billiards" / "… Club"
  if (hostKey.startsWith(`${shadowKey} `)) {
    const rest = hostKey.slice(shadowKey.length).trim();
    // Avoid \b after "&" — "&" is non-word so \b never fires before a space.
    if (/^(?:&|and|the|club)(?:\s|$)/.test(rest)) return true;
  }

  // Token containment only when the host is a venue elaboration of the shadow,
  // not when a city name sits inside a longer residence label.
  if (!namesOverlapByContainment(shadowKey, hostKey)) return false;
  const short = shadowKey.length <= hostKey.length ? shadowKey : hostKey;
  const long = shadowKey.length <= hostKey.length ? hostKey : shadowKey;
  if (containmentIsPossessive(short, long)) return false;
  if (long.startsWith(`${short} `)) {
    const rest = long.slice(short.length).trim();
    return /^(?:&|and|the|club)(?:\s|$)/.test(rest);
  }
  return false;
}

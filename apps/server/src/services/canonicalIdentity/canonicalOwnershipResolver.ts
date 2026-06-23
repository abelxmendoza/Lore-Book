import { formatHouseholdName, formatOwnedPlace } from './canonicalNamingService';

const OWNED_PLACE =
  /\b(?:here\s+)?(?:at|in|from|to|inside|outside|near|visited|drove to|went to)?\s*(?:my\s+|our\s+|the\s+)?([A-Za-zÀ-ÿ.'’-]+(?:\s+[A-Za-zÀ-ÿ.'’-]+){0,2}?)'?s?\s+(house|home|apartment|condo|casa|place|office|clinic)\b/i;

export function resolveOwnedPlace(raw: string): {
  displayName: string;
  ownerDisplayName: string;
  placeKind: string;
  rulesFired: string[];
} | null {
  const trimmed = raw
    .replace(/[’‘]/g, "'")
    .replace(/[.!?]\s*(?:i|it|he|she|they|we|you)\b.*$/i, '')
    .replace(/\s+with\s+(?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ.'’-]+(?:\s+[A-Za-zÀ-ÿ.'’-]+){0,2}\s*$/i, '')
    .trim();
  const match = OWNED_PLACE.exec(trimmed);
  if (!match) return null;

  const ownerRaw = match[1];
  const placeKind = match[2];
  const displayName = formatOwnedPlace(ownerRaw, placeKind);
  const ownerDisplayName = displayName.replace(/'s\s+.+$/i, '');

  if (!ownerDisplayName || /^'?s$/i.test(ownerDisplayName)) return null;

  return {
    displayName,
    ownerDisplayName,
    placeKind,
    rulesFired: ['owned_place'],
  };
}

export function resolveHouseholdFromOwnedPlace(raw: string): {
  displayName: string;
  ownerDisplayName: string;
  rulesFired: string[];
} | null {
  const owned = resolveOwnedPlace(raw);
  if (!owned) return null;
  return {
    displayName: formatHouseholdName(owned.ownerDisplayName),
    ownerDisplayName: owned.ownerDisplayName,
    rulesFired: ['household_from_owned_place'],
  };
}

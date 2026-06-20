/**
 * Street / community association from named-street + outdoor activity context.
 */
import type {
  HistoryContext,
  InferredCommunityAssociation,
  InferredPlaceAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';

const STREET_RE =
  /\bon\s+([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,4}\s+Street)\b/i;
const HOUSE_OUTSIDE_RE =
  /\b(?:outside\s+(?:his|her|their|my)\s+house|in\s+front\s+of\s+(?:his|her|their)\s+house)\b/i;

export function inferStreetCommunityAssociations(
  text: string,
  messageId: string,
  history: HistoryContext
): {
  communities: InferredCommunityAssociation[];
  places: InferredPlaceAssociation[];
  streetName?: string;
} {
  const communities: InferredCommunityAssociation[] = [];
  const places: InferredPlaceAssociation[] = [];

  const streetMatch = STREET_RE.exec(text);
  if (!streetMatch?.[1]) return { communities, places };

  const streetName = streetMatch[1].trim();
  const evidence = [streetMatch[0]];
  if (HOUSE_OUTSIDE_RE.test(text)) {
    evidence.push(text.match(HOUSE_OUTSIDE_RE)?.[0] ?? 'outside house');
  }

  const existing = history.streetCommunities
    ? (awaitableMatch(history, streetName))
    : null;

  const communityName = `${streetName} Community`;
  communities.push({
    ...inferenceBase(messageId, evidence, 0.84, 'named_street_outdoor_activity'),
    name: communityName,
    place: streetName,
    type: 'street_community',
    privacyMode: 'coarse_location_only',
    existingCommunityId: existing?.id,
    memberCandidates: [],
  });

  places.push({
    ...inferenceBase(messageId, evidence, 0.82, 'coarse_street_association'),
    name: streetName,
    category: 'street',
    associatedPeople: [],
    coarseOnly: true,
  });

  return { communities, places, streetName };
}

function awaitableMatch(history: HistoryContext, streetName: string) {
  for (const [key, val] of history.streetCommunities) {
    if (key.includes(streetName.toLowerCase()) || val.name.toLowerCase().includes(streetName.toLowerCase())) {
      return val;
    }
  }
  return null;
}

export function extractStreetName(text: string): string | undefined {
  return STREET_RE.exec(text)?.[1]?.trim();
}

export function hasRelativeLocationCue(text: string): boolean {
  return /\baround\s+the\s+corner\b/i.test(text);
}

export function relativeLocationContext(text: string, streetName?: string): string | undefined {
  if (!hasRelativeLocationCue(text)) return undefined;
  return streetName ? `near ${streetName}` : 'same neighborhood context';
}

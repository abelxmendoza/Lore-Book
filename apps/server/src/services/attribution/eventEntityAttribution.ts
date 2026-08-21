/**
 * Event ↔ entity attribution — mention is not participation.
 *
 * This is the reusable write/read boundary for “does this event belong to X?”
 * Canonical people[] / locations[] should only contain accepted grounded roles.
 * Detected entities (mentions) can still exist upstream; they do not automatically
 * become chronology members.
 */

export type AttributionRole =
  | 'participant'
  | 'subject'
  | 'location'
  | 'organizer'
  | 'employer'
  | 'institution'
  | 'context'
  | 'referenced'
  | 'unresolved';

export type AttributionEvidence =
  | 'explicit'
  | 'grammatical'
  | 'relational'
  | 'contextual'
  | 'inferred';

export type AttributionEntityType = 'character' | 'location' | 'organization' | 'project' | 'unknown';

export type EntityAttribution = {
  entityId: string | null;
  entityType: AttributionEntityType;
  name: string;
  role: AttributionRole;
  evidence: AttributionEvidence;
  confidence: number;
  reason: string;
  accepted: boolean;
  canonical: boolean;
};

export type NamedEntityInput = {
  id: string;
  type?: string | null;
  name?: string | null;
  primary_name?: string | null;
  aliases?: string[] | null;
};

const CANONICAL_PERSON_ROLES = new Set<AttributionRole>(['participant']);
const CANONICAL_PLACE_ROLES = new Set<AttributionRole>(['location']);

const GENERIC_PLACES = new Set([
  'home',
  'house',
  'warehouse',
  'outside',
  'inside',
  'there',
  'here',
  'the place',
  'somewhere',
  'around',
]);

const SOFTWARE_OR_TOOL = /\b(claude code|chatgpt|copilot|cursor|vscode|vs code|app|software|tool)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeAttributionText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayEntityName(entity: NamedEntityInput): string {
  return (entity.primary_name || entity.name || entity.aliases?.[0] || '').trim();
}

function namePattern(name: string): string {
  return escapeRegExp(normalizeAttributionText(name));
}

function mentioned(name: string, text: string, aliases: string[] = []): boolean {
  const haystack = normalizeAttributionText(text);
  return [name, ...aliases].some((candidate) => {
    const n = normalizeAttributionText(candidate);
    if (!n) return false;
    return new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i').test(haystack);
  });
}

/** Prefer the longest name/alias actually present so "Alex Rivera" ≠ "Alex Kim". */
function surfaceForm(name: string, text: string, aliases: string[] = []): string {
  const candidates = [name, ...aliases]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return candidates.find((candidate) => mentioned(candidate, text)) ?? name;
}

function testNamed(pattern: string, name: string, text: string): boolean {
  const n = namePattern(name);
  if (!n) return false;
  return new RegExp(pattern.replaceAll('{name}', n), 'i').test(normalizeAttributionText(text));
}

function attribution(
  partial: Omit<EntityAttribution, 'canonical'> & { canonical?: boolean },
): EntityAttribution {
  const accepted = partial.accepted;
  const role = partial.role;
  const canonical =
    partial.canonical ??
    ((partial.entityType === 'location' && accepted && CANONICAL_PLACE_ROLES.has(role)) ||
      (partial.entityType !== 'location' && accepted && CANONICAL_PERSON_ROLES.has(role)));
  return { ...partial, canonical };
}

/**
 * Conservative person/event role. Negation, desire, future, hearsay, thought,
 * timing, possessive, and relational descriptions never become participants.
 */
export function classifyPersonAttribution(
  name: string,
  text: string,
  opts?: { entityId?: string | null; aliases?: string[] },
): EntityAttribution {
  const aliases = opts?.aliases ?? [];
  const entityId = opts?.entityId ?? null;
  const surface = surfaceForm(name, text, aliases);
  const base = {
    entityId,
    entityType: 'character' as const,
    name,
  };

  if (!name.trim() || !mentioned(name, text, aliases)) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'inferred',
      confidence: 0.2,
      reason: 'no_mention',
      accepted: false,
    });
  }

  const names = [surface];
  const hit = (pattern: string) => names.some((n) => testNamed(pattern, n, text));

  if (
    hit("\\b{name}\\s+(?:wasn'?t|was not|weren'?t|were not)\\s+(?:there|at|present|here)") ||
    hit("\\b(?:wasn'?t|was not|didn'?t|did not)\\s+(?:see|invite|bring|take)\\s+{name}\\b") ||
    hit("\\b{name}\\s+(?:didn'?t|did not)\\s+(?:go|come|show|make it)")
  ) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'explicit',
      confidence: 0.95,
      reason: 'negation',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:wanted|want|wished|wish|hoped|hope)\\s+{name}\\s+to\\s+(?:come|be there|go|attend)') ||
    hit('\\b(?:wanted|want)\\s+{name}\\s+there\\b')
  ) {
    return attribution({
      ...base,
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.9,
      reason: 'desire_or_plan',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:might|may|could|planning to|gonna|going to)\\s+(?:go\\s+)?(?:with\\s+)?{name}\\b') &&
    !hit('\\b(?:went|was|were|talked|saw|met)\\s+(?:to\\s+)?(?:the\\s+\\w+\\s+)?(?:with\\s+)?{name}\\b')
  ) {
    return attribution({
      ...base,
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.88,
      reason: 'future_or_planned',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:told me|said that|heard that|heard from)\\b[^.?!]{0,80}\\b{name}\\b') ||
    hit('\\b\\w+\\s+told me\\s+{name}\\s+(?:went|was|had)\\b')
  ) {
    return attribution({
      ...base,
      role: 'subject',
      evidence: 'contextual',
      confidence: 0.82,
      reason: 'hearsay_reported_attendance',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:thought about|thinking about|kept thinking about|reminded me of|reminds me of)\\s+{name}\\b')
  ) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'grammatical',
      confidence: 0.93,
      reason: 'thought_about',
      accepted: false,
    });
  }

  if (
    hit("\\bafter\\s+(?:the\\s+)?{name}(?:'s)?\\s+(?:set|show|shift|game|talk|performance|opening)") ||
    hit('\\bbefore\\s+(?:the\\s+)?{name}(?:\'s)?\\s+(?:set|show|shift)')
  ) {
    return attribution({
      ...base,
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.92,
      reason: 'timing_phrase',
      accepted: false,
    });
  }

  if (
    hit("\\b{name}'s\\s+(?:friend|colleague|coworker|boss|manager|mom|dad|brother|sister|cousin)\\b")
  ) {
    return attribution({
      ...base,
      role: 'unresolved',
      evidence: 'relational',
      confidence: 0.9,
      reason: 'relational_description',
      accepted: false,
    });
  }

  if (
    hit("\\b(?:next to|beside|near|at)\\s+{name}'s\\s+(?:desk|house|car|room|office|place|apartment)\\b") ||
    (hit("\\b{name}'s\\s+(?:desk|house|car|room|office|place)\\b") &&
      !hit('\\b(?:with|and)\\s+{name}\\b'))
  ) {
    return attribution({
      ...base,
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.9,
      reason: 'possessive_owner',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:went|go|going|drove|hung out|was|were)\\s+with\\s+{name}\\b') ||
    hit('\\bwith\\s+{name}\\b') ||
    hit('\\b{name}\\s+and\\s+i\\b') ||
    hit('\\bi\\s+and\\s+{name}\\b') ||
    hit('\\b(?:talked|spoke|met)\\s+(?:to|with)\\s+{name}\\b') ||
    hit('\\b(?:took|brought)\\s+{name}\\s+(?:to|with)\\b')
  ) {
    return attribution({
      ...base,
      role: 'participant',
      evidence: 'explicit',
      confidence: 0.96,
      reason: 'explicit_with_phrase',
      accepted: true,
    });
  }

  if (hit('\\b(?:saw|see)\\s+{name}\\b') || hit('\\b{name}\\s+(?:was|were)\\s+(?:there|at|in)\\b')) {
    return attribution({
      ...base,
      role: 'participant',
      evidence: 'grammatical',
      confidence: 0.84,
      reason: 'observed_present',
      accepted: true,
    });
  }

  return attribution({
    ...base,
    role: 'referenced',
    evidence: 'inferred',
    confidence: 0.45,
    reason: 'mention_only',
    accepted: false,
  });
}

export function classifyPlaceAttribution(
  name: string,
  text: string,
  opts?: { entityId?: string | null; aliases?: string[] },
): EntityAttribution {
  const aliases = opts?.aliases ?? [];
  const entityId = opts?.entityId ?? null;
  const base = {
    entityId,
    entityType: 'location' as const,
    name,
  };
  const normalized = normalizeAttributionText(name);

  if (!name.trim() || GENERIC_PLACES.has(normalized)) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'inferred',
      confidence: 0.9,
      reason: 'generic_or_malformed_place',
      accepted: false,
    });
  }

  if (!mentioned(name, text, aliases)) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'inferred',
      confidence: 0.2,
      reason: 'no_mention',
      accepted: false,
    });
  }

  const names = [name, ...aliases];
  const hit = (pattern: string) => names.some((n) => testNamed(pattern, n, text));

  if (
    hit('\\b(?:talking about|talked about|thinking about|mentioned|reminds me of|reminded me of)\\s+{name}\\b') ||
    hit('\\btold\\s+\\w+\\s+about\\s+{name}\\b')
  ) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'grammatical',
      confidence: 0.93,
      reason: 'discussed_not_visited',
      accepted: false,
    });
  }

  if (hit('\\b(?:drove past|drive past|passed)\\s+{name}\\b')) {
    return attribution({
      ...base,
      role: 'referenced',
      evidence: 'grammatical',
      confidence: 0.88,
      reason: 'observed_place_not_attendance',
      accepted: false,
    });
  }

  if (hit('\\b(?:graduated from|alumnus of|alumni of|degree from)\\s+{name}\\b') &&
      hit('\\b(?:coworker|colleague|friend|they|she|he)\\b')) {
    return attribution({
      ...base,
      role: 'institution',
      evidence: 'relational',
      confidence: 0.86,
      reason: 'third_party_institution',
      accepted: false,
    });
  }

  if (
    hit('\\b(?:went to|go to|going to|was at|were at|am at|at|in|inside|visited|arrived at)\\s+(?:the\\s+)?{name}\\b')
  ) {
    return attribution({
      ...base,
      role: 'location',
      evidence: 'explicit',
      confidence: 0.94,
      reason: 'locative_destination',
      accepted: true,
    });
  }

  return attribution({
    ...base,
    role: 'referenced',
    evidence: 'inferred',
    confidence: 0.4,
    reason: 'place_mention_only',
    accepted: false,
  });
}

export function classifyOrganizationAttribution(
  name: string,
  text: string,
  opts?: { entityId?: string | null; entityType?: string | null },
): EntityAttribution {
  const entityTypeRaw = (opts?.entityType ?? '').toUpperCase();
  const base = {
    entityId: opts?.entityId ?? null,
    entityType: 'organization' as const,
    name,
  };

  if (entityTypeRaw === 'APP' || entityTypeRaw === 'PRODUCT' || SOFTWARE_OR_TOOL.test(name) || SOFTWARE_OR_TOOL.test(text) && /helped me build/i.test(text)) {
    return attribution({
      ...base,
      entityType: 'project',
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.9,
      reason: 'software_or_tool_not_membership',
      accepted: false,
    });
  }

  if (testNamed('\\b{name}\\s+helped me\\b', name, text) || /helped me build/i.test(text)) {
    return attribution({
      ...base,
      role: 'context',
      evidence: 'grammatical',
      confidence: 0.9,
      reason: 'software_or_tool_not_membership',
      accepted: false,
    });
  }

  if (testNamed('\\b(?:recruits for|works at|works for|employed by)\\s+{name}\\b', name, text)) {
    return attribution({
      ...base,
      role: 'employer',
      evidence: 'explicit',
      confidence: 0.9,
      reason: 'named_employer_association',
      accepted: false,
    });
  }

  return attribution({
    ...base,
    role: 'referenced',
    evidence: 'inferred',
    confidence: 0.4,
    reason: 'org_mention_only',
    accepted: false,
  });
}

export function omegaTypeToAttributionEntityType(type?: string | null): AttributionEntityType {
  const t = (type ?? '').toUpperCase();
  if (t === 'PERSON' || t === 'CHARACTER') return 'character';
  if (t === 'LOCATION') return 'location';
  if (t === 'ORG') return 'organization';
  if (t === 'PROJECT' || t === 'APP' || t === 'PRODUCT') return 'project';
  return 'unknown';
}

export function attributeNamedEntities(entities: NamedEntityInput[], text: string): EntityAttribution[] {
  return entities.map((entity) => {
    const name = displayEntityName(entity);
    const kind = omegaTypeToAttributionEntityType(entity.type);
    const aliases = entity.aliases ?? [];
    if (kind === 'location') {
      return classifyPlaceAttribution(name, text, { entityId: entity.id, aliases });
    }
    if (kind === 'organization' || kind === 'project') {
      return classifyOrganizationAttribution(name, text, { entityId: entity.id, entityType: entity.type });
    }
    if (kind === 'character') {
      return classifyPersonAttribution(name, text, { entityId: entity.id, aliases });
    }
    return attribution({
      entityId: entity.id,
      entityType: kind,
      name,
      role: 'referenced',
      evidence: 'inferred',
      confidence: 0.3,
      reason: 'unsupported_entity_type',
      accepted: false,
    });
  });
}

export function selectCanonicalPeople(entities: NamedEntityInput[], text: string): {
  peopleIds: string[];
  attributions: EntityAttribution[];
} {
  const attributions = attributeNamedEntities(
    entities.filter((e) => {
      const t = (e.type ?? '').toUpperCase();
      return t === 'PERSON' || t === 'CHARACTER' || !e.type;
    }),
    text,
  );
  const peopleIds = [...new Set(
    attributions
      .filter((row) => row.canonical && row.entityId)
      .map((row) => row.entityId as string),
  )];
  return { peopleIds, attributions };
}

export function selectCanonicalLocations(entities: NamedEntityInput[], text: string): {
  locationIds: string[];
  attributions: EntityAttribution[];
} {
  const attributions = attributeNamedEntities(
    entities.filter((e) => (e.type ?? '').toUpperCase() === 'LOCATION'),
    text,
  );
  const locationIds = [...new Set(
    attributions
      .filter((row) => row.canonical && row.entityId)
      .map((row) => row.entityId as string),
  )];
  return { locationIds, attributions };
}

export function mergeEntityAttributions(
  existing: EntityAttribution[] | null | undefined,
  incoming: EntityAttribution[],
): EntityAttribution[] {
  const byKey = new Map<string, EntityAttribution>();
  for (const row of [...(existing ?? []), ...incoming]) {
    const key = `${row.entityId ?? 'none'}:${normalizeAttributionText(row.name)}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, row);
      continue;
    }
    // Explicit rejection (negation) wins over a weaker positive.
    if (!row.accepted && row.confidence >= prior.confidence) {
      byKey.set(key, row);
      continue;
    }
    if (row.accepted && !prior.accepted && row.confidence > prior.confidence) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export function canonicalPeopleFromAttributions(attributions: EntityAttribution[]): string[] {
  return [...new Set(
    attributions
      .filter((row) => row.canonical && row.entityType === 'character' && row.entityId)
      .map((row) => row.entityId as string),
  )];
}

export function canonicalLocationsFromAttributions(attributions: EntityAttribution[]): string[] {
  return [...new Set(
    attributions
      .filter((row) => row.canonical && row.entityType === 'location' && row.entityId)
      .map((row) => row.entityId as string),
  )];
}

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter(Boolean))];
}

function attributedIdsOfType(
  attributions: EntityAttribution[],
  entityType: AttributionEntityType,
): Set<string> {
  return new Set(
    attributions
      .filter((row) => row.entityType === entityType && row.entityId)
      .map((row) => row.entityId as string),
  );
}

/**
 * Write-path people[] / locations[] stay aligned with canonical attributions
 * without wiping grounded legacy members that never received an attribution row.
 *
 * Canonical accepted rows always win. IDs with a stored non-canonical
 * attribution are dropped. Compatibility IDs with no attribution row are kept.
 */
export function peopleIdsForEventWrite(
  compatibilityIds: Iterable<string>,
  attributions: EntityAttribution[],
): string[] {
  const ids = uniqueIds(compatibilityIds);
  if (attributions.length === 0) return ids;
  const attributed = attributedIdsOfType(attributions, 'character');
  const legacy = ids.filter((id) => !attributed.has(id));
  return uniqueIds([...canonicalPeopleFromAttributions(attributions), ...legacy]);
}

export function locationIdsForEventWrite(
  compatibilityIds: Iterable<string>,
  attributions: EntityAttribution[],
): string[] {
  const ids = uniqueIds(compatibilityIds);
  if (attributions.length === 0) return ids;
  const attributed = attributedIdsOfType(attributions, 'location');
  const legacy = ids.filter((id) => !attributed.has(id));
  return uniqueIds([...canonicalLocationsFromAttributions(attributions), ...legacy]);
}

export function participantArraysForEventWrite(args: {
  people: Iterable<string>;
  locations: Iterable<string>;
  attributions: EntityAttribution[];
}): { people: string[]; locations: string[] } {
  return {
    people: peopleIdsForEventWrite(args.people, args.attributions),
    locations: locationIdsForEventWrite(args.locations, args.attributions),
  };
}

export function readStoredAttributions(metadata: Record<string, unknown> | null | undefined): EntityAttribution[] {
  const raw = metadata?.entityAttributions;
  return Array.isArray(raw) ? (raw as EntityAttribution[]) : [];
}

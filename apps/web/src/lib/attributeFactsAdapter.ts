/**
 * Folds the structured `entity_attributes` system (occupation, workplace,
 * school, etc. — surfaced today as a small read-only "Detected from chat"
 * list in the Info tab) into the same shape as `entity_facts` rows, so both
 * systems can render in one reviewable, copyable list ("What I Know").
 *
 * These two systems are populated independently and were never merged
 * before — Copy All only ever captured entity_facts, silently leaving out
 * every structured attribute.
 */

export type RawEntityAttribute = {
  id?: string;
  attributeType?: string;
  attribute_type?: string;
  attributeValue?: string;
  attribute_value?: string;
  confidence?: number;
  isCurrent?: boolean;
  is_current?: boolean;
  startTime?: string | null;
  start_time?: string | null;
  evidence?: string;
};

export type AdaptedFact = {
  id: string;
  category: string;
  fact: string;
  confidence?: number;
  status?: string;
  previous_value?: string;
  mention_count?: number;
  first_seen_at?: string | null;
  last_confirmed_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Attribute types that map onto a "What I Know" category not in the base set. */
const CATEGORY_BY_ATTRIBUTE_TYPE: Record<string, string> = {
  occupation: 'career',
  workplace: 'career',
  title: 'career',
  role: 'career',
  company: 'career',
  industry: 'career',
  employment_status: 'career',
  school: 'education',
  degree: 'education',
  major: 'education',
  certification: 'education',
  hometown: 'location',
  current_city: 'location',
  living_situation: 'location',
  skill: 'interests',
  hobby: 'interests',
  interest: 'interests',
  health_condition: 'health',
  relationship_status: 'relationship',
  personality_trait: 'personality',
};

function categoryForAttributeType(attributeType: string): string {
  return CATEGORY_BY_ATTRIBUTE_TYPE[attributeType] ?? 'general';
}

/** Human-readable sentence, tensed by isCurrent so the existing Current/History
 * split (which reads temporal language in the fact text) partitions these
 * correctly without any extra plumbing. */
function sentenceForAttribute(attributeType: string, value: string, isCurrent: boolean): string {
  const label = attributeType.replace(/_/g, ' ');
  switch (attributeType) {
    case 'occupation':
      return isCurrent ? `Works as ${value}` : `Used to work as ${value}`;
    case 'workplace':
    case 'company':
      return isCurrent ? `Works at ${value}` : `Used to work at ${value}`;
    case 'title':
      return isCurrent ? `Holds the title ${value}` : `Previously held the title ${value}`;
    case 'role':
      return isCurrent ? `Role: ${value}` : `Previous role: ${value}`;
    case 'industry':
      return isCurrent ? `Works in the ${value} industry` : `Used to work in the ${value} industry`;
    case 'employment_status':
      return `Employment status: ${value}`;
    case 'school':
      return isCurrent ? `Attends ${value}` : `Attended ${value}`;
    case 'degree':
      return `Has a degree: ${value}`;
    case 'major':
      return isCurrent ? `Studying ${value}` : `Studied ${value}`;
    case 'certification':
      return `Certified: ${value}`;
    case 'hometown':
      return `From ${value}`;
    case 'current_city':
      return isCurrent ? `Lives in ${value}` : `Used to live in ${value}`;
    case 'living_situation':
      return isCurrent ? `Living situation: ${value}` : `Previously: ${value}`;
    case 'nationality':
      return `Nationality: ${value}`;
    case 'language':
      return `Speaks ${value}`;
    case 'skill':
      return `Has the skill: ${value}`;
    case 'hobby':
      return isCurrent ? `Enjoys ${value}` : `Used to enjoy ${value}`;
    case 'interest':
      return isCurrent ? `Interested in ${value}` : `Used to be interested in ${value}`;
    case 'health_condition':
      return isCurrent ? `Health: ${value}` : `Past health issue: ${value}`;
    case 'relationship_status':
      return isCurrent ? `Relationship status: ${value}` : `Previously: ${value}`;
    case 'personality_trait':
      return `Personality: ${value}`;
    case 'financial_status':
      return `Financial situation: ${value}`;
    case 'lifestyle_pattern':
      return isCurrent ? value : `Formerly: ${value}`;
    case 'age':
      return `Age: ${value}`;
    default:
      return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value}`;
  }
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Convert raw entity_attributes rows (typically the full current+past set,
 * i.e. characterQuery.sections.attributes.history) into "What I Know" facts.
 */
export function buildFactsFromAttributes(attributes: RawEntityAttribute[]): AdaptedFact[] {
  const seen = new Set<string>();
  const out: AdaptedFact[] = [];

  for (const attr of attributes) {
    const attributeType = String(attr.attributeType ?? attr.attribute_type ?? '').trim();
    const attributeValue = String(attr.attributeValue ?? attr.attribute_value ?? '').trim();
    if (!attributeType || !attributeValue) continue;

    const isCurrent = attr.isCurrent ?? attr.is_current ?? true;
    const dedupeKey = `${attributeType}:${attributeValue.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const id = attr.id ? `attr-${attr.id}` : `attr-${slugify(dedupeKey)}`;
    const startTime = attr.startTime ?? attr.start_time ?? null;

    out.push({
      id,
      category: categoryForAttributeType(attributeType),
      fact: sentenceForAttribute(attributeType, attributeValue, isCurrent),
      confidence: typeof attr.confidence === 'number' ? attr.confidence : undefined,
      first_seen_at: startTime,
      metadata: attr.evidence ? { source: 'entity_attributes', rawEvidence: attr.evidence } : { source: 'entity_attributes' },
    });
  }

  return out;
}

/** Merge attribute-derived facts into an existing facts list, skipping anything
 * that duplicates a fact already present by normalized text (entity_facts wins). */
export function mergeAttributeFactsIntoFacts<T extends { fact: string }>(
  baseFacts: T[],
  attributeFacts: AdaptedFact[],
): Array<T | AdaptedFact> {
  const existingText = new Set(baseFacts.map((f) => f.fact.trim().toLowerCase()));
  const additions = attributeFacts.filter((f) => !existingText.has(f.fact.trim().toLowerCase()));
  return [...baseFacts, ...additions];
}

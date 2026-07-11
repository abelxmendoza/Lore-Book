/**
 * Dating & Romance eligibility — the trust floor for romantic classification.
 *
 * A relationship card may only exist for a REAL PERSON, who is NOT FAMILY,
 * with ROMANTIC/SEXUAL EVIDENCE THAT NAMES THEM. Nearby mention in a
 * dating-flavored conversation is never enough — that is exactly how a band
 * called "Ex Lover", a software project, and Tío Juan all became "ex lovers".
 *
 * Pure classification functions (unit-tested, no DB); loadDatingEligibility
 * is the thin batch wrapper that assembles inputs from existing stores.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type DatingEligibilityReason =
  | 'eligible_explicit_romantic_evidence'
  | 'eligible_explicit_sexual_evidence'
  | 'ineligible_non_person'
  | 'ineligible_family'
  | 'ineligible_no_romantic_evidence'
  | 'ineligible_unknown_type'
  | 'ineligible_evidence_belongs_to_other_entity'
  | 'review_conflicting_evidence';

export type DatingEligibilityResult = {
  entityId: string;
  name: string;
  isEligible: boolean;
  eligibilityReason: DatingEligibilityReason;
  personConfidence: number;
  familyConflict: boolean;
  romanticEvidence: string[];
  romanticEvidenceStrength: 'strong' | 'weak' | 'none';
  visibleInDatingBook: boolean;
  reviewRequired: boolean;
};

// ── Family detection ─────────────────────────────────────────────────────────

const KINSHIP_TITLE_RE =
  /(^|\s)(t[ií]o|t[ií]a|uncle|aunt|auntie|mom|mother|mama|dad|father|papa|abuel[oa]|grandma|grandpa|grandmother|grandfather|brother|sister|hermano|hermana|cousin|prim[oa]|nephew|niece|sobrin[oa]|step\s?(mom|dad|mother|father|brother|sister))($|\s)/i;

const FAMILY_RELATION_RE =
  /\b(uncle|aunt|mother|father|mom|dad|brother|sister|cousin|grandparent|grandmother|grandfather|niece|nephew|step-?(parent|mom|dad|brother|sister)|family member|t[ií][oa]|prim[oa]|abuel[oa])\b/i;

export function hasFamilySignal(name: string, relationLabels: string[] = []): boolean {
  if (KINSHIP_TITLE_RE.test(name)) return true;
  return relationLabels.some((label) => FAMILY_RELATION_RE.test(label ?? ''));
}

// ── Person typing ────────────────────────────────────────────────────────────

const NON_PERSON_TYPES = new Set([
  'organization', 'org', 'band', 'group', 'company', 'brand',
  'project', 'product', 'app', 'software_tool', 'software', 'tool',
  'location', 'place', 'venue', 'event', 'school', 'pet', 'media',
  'vehicle', 'food_drink', 'skill', 'concept',
]);

const PERSON_TYPES = new Set(['person', 'character', 'human', 'people']);

export type PersonTyping = 'person' | 'non_person' | 'unknown';

export function classifyPersonType(
  canonicalType: string | null | undefined,
  isKnownOrganization: boolean,
): PersonTyping {
  if (isKnownOrganization) return 'non_person';
  const t = (canonicalType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PERSON_TYPES.has(t)) return 'person';
  if (NON_PERSON_TYPES.has(t)) return 'non_person';
  return 'unknown';
}

// ── Entity-specific romantic evidence ────────────────────────────────────────

const STRONG_ROMANTIC_RE = [
  /\b(dated|dating|was seeing|been seeing|went on a date with|going on a date with)\b/i,
  /\bmy (girlfriend|boyfriend|partner|wife|husband|fianc[ée]e?|ex|ex-(girlfriend|boyfriend|wife|husband))\b/i,
  /\bis my (girlfriend|boyfriend|partner|wife|husband|ex)\b/i,
  /\b(we|i) (were|was|are|am) (together|a couple|an item|in a relationship)\b/i,
  /\bbroke up\b/i,
  /\bcrush on\b/i,
  /\b(and i|we) (were|are) talking\b/i,
  /\brejected (me|my)\b/i,
];

const STRONG_SEXUAL_RE = [
  /\b(hooked up|hooking up|slept with|sleeping with|had sex|kissed|made out|one[- ]night stand|friends with benefits|fwb)\b/i,
  // Explicit vernacular — must still name the entity to count (enforced upstream).
  /\b(was|been|were) (fucking|smashing|banging)\b/i,
  /\bfucked\b/i,
];

/** Weak signals never independently create a card. */
const WEAK_SIGNAL_RE =
  /\b(attractive|cute|hot|beautiful|danced|dancing|at (a|the) (club|show|party)|follow(ed|ing)? (them|her|him)? ?on(line)?|instagram)\b/i;

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/** Does this snippet actually talk about THIS entity (not a co-mentioned one)? */
export function evidenceMentionsEntity(snippet: string, name: string, aliases: string[] = []): boolean {
  const text = snippet.toLowerCase();
  const candidates = [name, ...aliases];
  return candidates.some((n) => {
    const tokens = nameTokens(n);
    return tokens.length > 0 && tokens.some((t) => text.includes(t));
  });
}

export type EvidenceAssessment = {
  strength: 'strong' | 'weak' | 'none';
  kind: 'romantic' | 'sexual' | null;
  /** Snippets that both name the entity and carry a strong signal. */
  accepted: string[];
  /** Snippets that name the entity but only carry weak signals. */
  weak: string[];
  /** Snippets that never name the entity — leaked from someone else. */
  foreign: string[];
};

export function assessRomanticEvidence(
  snippets: string[],
  name: string,
  aliases: string[] = [],
): EvidenceAssessment {
  const accepted: string[] = [];
  const weak: string[] = [];
  const foreign: string[] = [];
  let kind: 'romantic' | 'sexual' | null = null;

  for (const raw of snippets) {
    const snippet = (raw ?? '').trim();
    if (!snippet) continue;
    if (!evidenceMentionsEntity(snippet, name, aliases)) {
      foreign.push(snippet);
      continue;
    }
    const sexual = STRONG_SEXUAL_RE.some((re) => re.test(snippet));
    const romantic = STRONG_ROMANTIC_RE.some((re) => re.test(snippet));
    if (sexual || romantic) {
      accepted.push(snippet);
      kind = kind ?? (sexual ? 'sexual' : 'romantic');
    } else if (WEAK_SIGNAL_RE.test(snippet)) {
      weak.push(snippet);
    } else {
      weak.push(snippet);
    }
  }

  const strength = accepted.length > 0 ? 'strong' : weak.length > 0 ? 'weak' : 'none';
  return { strength, kind, accepted, weak, foreign };
}

// ── The gate ─────────────────────────────────────────────────────────────────

export type DatingEligibilityInput = {
  entityId: string;
  name: string;
  canonicalType: string | null;
  isKnownOrganization: boolean;
  /** Relationship labels tied to this entity (e.g. characters.relationship). */
  relationLabels?: string[];
  aliases?: string[];
  evidenceSnippets: string[];
  /** Explicit user correction always wins. */
  userConfirmedRomantic?: boolean;
};

export function evaluateDatingEligibility(input: DatingEligibilityInput): DatingEligibilityResult {
  const family = hasFamilySignal(input.name, input.relationLabels ?? []);
  const typing = classifyPersonType(input.canonicalType, input.isKnownOrganization);
  const evidence = assessRomanticEvidence(input.evidenceSnippets, input.name, input.aliases ?? []);

  const base = {
    entityId: input.entityId,
    name: input.name,
    familyConflict: false,
    romanticEvidence: evidence.accepted,
    romanticEvidenceStrength: evidence.strength,
    personConfidence: typing === 'person' ? 0.9 : typing === 'unknown' ? 0.4 : 0.05,
  };

  // Family hard-blocks — with strong direct evidence it becomes a review case,
  // never a silent classification.
  if (family) {
    const conflicted = evidence.strength === 'strong' || input.userConfirmedRomantic === true;
    return {
      ...base,
      familyConflict: conflicted,
      isEligible: false,
      eligibilityReason: conflicted ? 'review_conflicting_evidence' : 'ineligible_family',
      visibleInDatingBook: false,
      reviewRequired: conflicted,
    };
  }

  if (input.userConfirmedRomantic === true && typing !== 'non_person') {
    return {
      ...base,
      isEligible: true,
      eligibilityReason: 'eligible_explicit_romantic_evidence',
      visibleInDatingBook: true,
      reviewRequired: false,
    };
  }

  if (typing === 'non_person') {
    return {
      ...base,
      isEligible: false,
      eligibilityReason: 'ineligible_non_person',
      visibleInDatingBook: false,
      reviewRequired: false,
    };
  }

  if (evidence.strength !== 'strong') {
    // Snippets exist but none name this entity → leaked evidence, not weak romance.
    const leaked = evidence.foreign.length > 0 && evidence.accepted.length === 0 && evidence.weak.length === 0;
    return {
      ...base,
      isEligible: false,
      eligibilityReason: leaked
        ? 'ineligible_evidence_belongs_to_other_entity'
        : 'ineligible_no_romantic_evidence',
      visibleInDatingBook: false,
      reviewRequired: false,
    };
  }

  if (typing === 'unknown') {
    // Strong, entity-specific evidence but unresolved type — review, don't show.
    return {
      ...base,
      isEligible: false,
      eligibilityReason: 'ineligible_unknown_type',
      visibleInDatingBook: false,
      reviewRequired: true,
    };
  }

  return {
    ...base,
    isEligible: true,
    eligibilityReason:
      evidence.kind === 'sexual'
        ? 'eligible_explicit_sexual_evidence'
        : 'eligible_explicit_romantic_evidence',
    visibleInDatingBook: true,
    reviewRequired: false,
  };
}

// ── Batch loader for existing romantic_relationships rows ────────────────────

type RomanticRow = {
  id: string;
  person_id: string;
  person_type: string;
  relationship_type: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export async function loadDatingEligibilityForRows(
  userId: string,
  rows: RomanticRow[],
): Promise<Map<string, DatingEligibilityResult>> {
  const out = new Map<string, DatingEligibilityResult>();
  if (rows.length === 0) return out;

  const charIds = rows.filter((r) => r.person_type === 'character').map((r) => r.person_id);
  const omegaIds = rows.filter((r) => r.person_type === 'omega_entity').map((r) => r.person_id);

  const [{ data: chars }, { data: omegas }, orgLabels] = await Promise.all([
    charIds.length
      ? supabaseAdmin.from('characters').select('id, name, alias, role, archetype, metadata').eq('user_id', userId).in('id', charIds)
      : Promise.resolve({ data: [] as any[] }),
    omegaIds.length
      ? supabaseAdmin.from('omega_entities').select('id, primary_name, aliases, type').eq('user_id', userId).in('id', omegaIds)
      : Promise.resolve({ data: [] as any[] }),
    import('../organizationService')
      .then(({ organizationService }) => organizationService.listOrganizationLabels(userId))
      .catch(() => [] as string[]),
  ]);

  const orgSet = new Set((orgLabels ?? []).map((l: string) => l.trim().toLowerCase()));
  const charById = new Map((chars ?? []).map((c: any) => [c.id, c]));
  const omegaById = new Map((omegas ?? []).map((o: any) => [o.id, o]));

  for (const row of rows) {
    const meta = row.metadata ?? {};
    const evidenceRaw = meta.evidence;
    const snippets = Array.isArray(evidenceRaw)
      ? (evidenceRaw as string[])
      : typeof evidenceRaw === 'string' && evidenceRaw
        ? [evidenceRaw]
        : [];
    const userConfirmed =
      meta.user_confirmed_romantic === true || meta.correction_source === 'user';

    let input: DatingEligibilityInput | null = null;
    if (row.person_type === 'character') {
      const c = charById.get(row.person_id);
      if (c) {
        input = {
          entityId: row.person_id,
          name: c.name,
          canonicalType: 'person',
          isKnownOrganization: orgSet.has(String(c.name ?? '').trim().toLowerCase()),
          relationLabels: [c.role, c.archetype, (c.metadata as any)?.relationship_to_user, (c.metadata as any)?.relationship].filter(Boolean),
          aliases: Array.isArray(c.alias) ? c.alias : [],
          evidenceSnippets: snippets,
          userConfirmedRomantic: userConfirmed,
        };
      }
    } else {
      const o = omegaById.get(row.person_id);
      if (o) {
        input = {
          entityId: row.person_id,
          name: o.primary_name,
          canonicalType: String(o.type ?? '').toLowerCase() === 'person' ? 'person' : String(o.type ?? '') || null,
          isKnownOrganization: orgSet.has(String(o.primary_name ?? '').trim().toLowerCase()),
          aliases: Array.isArray(o.aliases) ? o.aliases : [],
          evidenceSnippets: snippets,
          userConfirmedRomantic: userConfirmed,
        };
      }
    }

    if (!input) {
      out.set(row.id, {
        entityId: row.person_id,
        name: '(missing entity)',
        isEligible: false,
        eligibilityReason: 'ineligible_unknown_type',
        personConfidence: 0,
        familyConflict: false,
        romanticEvidence: [],
        romanticEvidenceStrength: 'none',
        visibleInDatingBook: false,
        reviewRequired: true,
      });
      continue;
    }

    try {
      out.set(row.id, evaluateDatingEligibility(input));
    } catch (err) {
      logger.warn({ err, rowId: row.id }, 'dating eligibility evaluation failed');
    }
  }
  return out;
}

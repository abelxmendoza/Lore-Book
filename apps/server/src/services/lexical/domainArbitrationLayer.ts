/**
 * Domain Arbitration Layer (DAL).
 *
 * Before a span enters a book-specific parser, classify obvious cross-domain
 * ownership. Places intentionally lose to people, organizations, roles, teams,
 * events, relationships, objects/products, and venue-area context.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { classifySpatialReference } from '../lorebook/quality/spatialContextResolver';

export type ArbitrationDomain =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'ROLE'
  | 'TEAM'
  | 'EVENT'
  | 'COMMUNITY'
  | 'RELATIONSHIP'
  | 'OBJECT'
  | 'PRODUCT'
  | 'VENUE_SUBAREA_CONTEXT'
  | 'SOCIAL_CONTEXT'
  | 'BROKEN_SPAN'
  | 'PLACE'
  | 'UNKNOWN';

export type DomainArbitrationVerdict = {
  winningDomain: ArbitrationDomain;
  allowedAsPlace: boolean;
  confidence: number;
  rulesFired: string[];
  placeType?: string;
};

const ROLE_NOUN =
  /\b(?:technician|engineer|manager|professor|pastor|teacher|student|promoter|developer|designer|operator|analyst|specialist|associate|coordinator|lead|supervisor|intern)\b/i;

const TEAM_NOUN =
  /\b(?:team|department|division|unit|group)\b/i;

const COMMUNITY_NOUN =
  /\b(?:coding|robotics|computer\s+science|football|band)\s+(?:club|crew|group|team)\b|(?:goth\s+scene|.+?\s+scene|.+?\s+vibes|weeb\s+city)\b/i;

const SKILL_DISCIPLINE =
  /^(?:electrical|mechanical|software|computer)\s+engineering$|^computer\s+science$/i;

const EVENT_BRAND =
  /^(?:ax|anime\s+expo|code\s+red|weeb\s+city)$/i;

const WORK_ORG_CONTEXT =
  /\b(?:work(?:ed|ing)?\s+at|employee|employer|manager|coworker|team|department|subsidiar(?:y|ies)|sub\s+compan(?:y|ies)|acquired|company|org(?:anization)?|startup|corporation|corp|inc|llc)\b/i;

const ORG_NAMES = new Set([
  'amazon',
  'ring',
  'google',
  'spacex',
  'antler',
  'armstrong robotics',
]);

const PERSON_CONTEXT =
  /\b(?:named|manager|coworker|co-worker|promoter|friend|met|with|kaustubh|dan|ryan|xingpeng|jimmy|khalil|hassan|ruben)\b/i;

const SOCIAL_CONTEXT = /^(?:his|her|their|my|your|our)\s+presence\b/i;

const BROKEN_WITH_TAIL = /^[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*)?\s+with$/i;

const PRONOUN_SENTENCE_BLEED =
  /\b(?:she|he|her|him|they|them|we|i|you|it)\s+(?:still|said|was|were|did|didn'?t|does|don'?t|had|has|went|came|told|asked|wanted|want)\b/i;

function verdict(
  winningDomain: ArbitrationDomain,
  rule: string,
  confidence: number,
  extra: Partial<DomainArbitrationVerdict> = {},
): DomainArbitrationVerdict {
  return {
    winningDomain,
    allowedAsPlace: winningDomain === 'PLACE' || winningDomain === 'UNKNOWN',
    confidence,
    rulesFired: [rule],
    ...extra,
  };
}

function containsKnownOrg(key: string): boolean {
  if (ORG_NAMES.has(key)) return true;
  return [...ORG_NAMES].some((org) => key.includes(org));
}

export function arbitrateCandidateDomain(span: string, contextLine = ''): DomainArbitrationVerdict {
  const text = (span ?? '').trim();
  if (!text) return verdict('BROKEN_SPAN', 'empty_span', 0.1, { allowedAsPlace: false });

  const key = normalizeNameKey(text);
  const context = `${contextLine} ${text}`;

  if (BROKEN_WITH_TAIL.test(text)) {
    return verdict('BROKEN_SPAN', 'dangling_with_fragment', 0.25, { allowedAsPlace: false });
  }

  if (SOCIAL_CONTEXT.test(text)) {
    return verdict('SOCIAL_CONTEXT', 'social_presence_phrase', 0.35, { allowedAsPlace: false });
  }

  const spatial = classifySpatialReference(text);
  if (spatial.referenceType === 'venue_area') {
    return verdict('VENUE_SUBAREA_CONTEXT', `spatial:${spatial.reason}`, 0.35, {
      allowedAsPlace: false,
      placeType: 'venue_subarea_context',
    });
  }
  if (spatial.referenceType === 'event') {
    return verdict('EVENT', `spatial:${spatial.reason}`, 0.4, { allowedAsPlace: false });
  }

  if (PRONOUN_SENTENCE_BLEED.test(text) && /^\s*(?:pit|stage|dance\s*floor|backstage|parking\s+lot)\b/i.test(text)) {
    return verdict('VENUE_SUBAREA_CONTEXT', 'venue_area_with_pronoun_bleed', 0.25, {
      allowedAsPlace: false,
      placeType: 'venue_subarea_context',
    });
  }

  if (/\bnamed\s+[A-Z][A-Za-zÀ-ÿ'-]+\b/.test(text) || /\bpromoter\s+named\s+[A-Z][A-Za-zÀ-ÿ'-]+\b/.test(context)) {
    return verdict('PERSON', 'named_person_phrase', 0.45, { allowedAsPlace: false });
  }

  if (ROLE_NOUN.test(text) && /\b(?:job|role|position|title)?\b/i.test(text)) {
    return verdict('ROLE', 'role_or_job_span', 0.45, { allowedAsPlace: false });
  }

  if (TEAM_NOUN.test(text)) {
    return verdict('TEAM', 'team_or_group_span', 0.45, { allowedAsPlace: false });
  }

  if (SKILL_DISCIPLINE.test(text.trim())) {
    return verdict('ROLE', 'skill_or_discipline_span', 0.45, { allowedAsPlace: false });
  }

  if (EVENT_BRAND.test(text.trim())) {
    return verdict(
      'EVENT',
      normalizeNameKey(text) === 'weeb city' ? 'anime_expo_contextual_alias' : 'canonical_event_brand',
      0.95,
      { allowedAsPlace: false },
    );
  }

  if (COMMUNITY_NOUN.test(text)) {
    return verdict('COMMUNITY', 'community_or_club_span', 0.4, { allowedAsPlace: false });
  }

  if (/\b(?:sub\s+compan(?:y|ies)|subsidiar(?:y|ies)|company\s+of)\b/i.test(text)) {
    return verdict('ORGANIZATION', 'organization_relationship_span', 0.45, { allowedAsPlace: false });
  }

  // Product spans win before the org lexicon — "Ring doorbell product" is the
  // product, not the Ring org, even inside work context.
  if (/\bring\s+doorbell(?:\s+product)?\b/i.test(text)) {
    return verdict('PRODUCT', 'product_span', 0.4, { allowedAsPlace: false });
  }

  if (containsKnownOrg(key) && WORK_ORG_CONTEXT.test(context)) {
    return verdict('ORGANIZATION', 'organization_work_context', 0.45, { allowedAsPlace: false });
  }

  if (/^[A-Z][A-Za-zÀ-ÿ'-]+$/.test(text) && PERSON_CONTEXT.test(contextLine)) {
    // A span sitting right after a locative preposition ("in DTLA",
    // "going to RaveLa") is being used as a place — person words elsewhere
    // in the same line ("met", "with") must not reroute it.
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const usedLocatively = new RegExp(
      `\\b(?:in|at|to|from|near|toward|inside|outside)\\s+(?:the\\s+)?${escaped}\\b`,
      'i',
    ).test(contextLine);
    if (!usedLocatively) {
      return verdict('PERSON', 'person_context_single_name', 0.35, { allowedAsPlace: false });
    }
  }

  return verdict('UNKNOWN', 'no_cross_domain_owner', 0);
}

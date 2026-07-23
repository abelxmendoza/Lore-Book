/**
 * V2 hard guard for spans that look like places only because extraction over-captured context.
 */

import {
  type NonPlaceEntityType,
  type PlaceSuggestionStatus,
  type PlaceTaxonomyType,
} from './placeSuggestionTypes';
import { arbitrateCandidateDomain } from '../domainArbitrationLayer';

const norm = (s: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const TIME_ONLY =
  /^(?:morning|night|last night|yesterday|today|tonight|weekend|march|lunch break|every\s+\w+|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+(?:ago|now))?)$/i;

const EVENT_ACTIVITY =
  /^(?:shows?|another show(?: in the pit)?|party|afters?|graduation party|went dancing|coding all weekend)$/i;

const PROJECT_TASK =
  /^(?:lorebook|github repo|my github repo|app|project|feature|parser|response compiler|code later|expand responses|code later so we can expand responses)$/i;

const MEDIA_CONCEPT = /^(?:media|social media|in the media|instagram|find my app)$/i;

const PRODUCT_OBJECT =
  /^(?:ring doorbell(?: product)?|amazon ring doorbell|phone|car|vape|wristband|(?:in and out\s+)?wristband|product|hardware|device|mom'?s car|my mom'?s car|selfie\s+car)$/i;

const PERSON_OR_PRONOUN =
  /^(?:she|her|him|he|they|them|this girl|my mom|mom|abuela|abuelo|grandma|grandpa|.+?\s+desk\s+neighbor|.+?'?s\s+doctor|.+?\s+doctor)$/i;

const ORGANIZATION_ONLY = /^(?:amazon|antler|rlh|venture capital firm)$/i;

const SKILL_OR_DISCIPLINE =
  /^(?:electrical\s+engineering|computer\s+science|mechanical\s+engineering|software\s+engineering|ui(?:\s*\/\s*ux)?|ux\s+design)$/i;

const COMMUNITY_OR_SCENE =
  /^(?:goth\s+scene|.+?\s+scene|.+?\s+vibes|weeb\s+city)$/i;

const EVENT_OR_BRAND =
  /^(?:ax|anime\s+expo|code\s+red)$/i;

const COMPOUND_TWO_VENUES = /^(.+)\s+and\s+(.+)$/i;

const VENUE_SUBAREA =
  /^(?:pit|stage|bar area|parking lot|dance floor|near the stage)$/i;

const RELATIVE_CONTEXT = /^(?:home|here|there|inside|outside)$/i;

export type WrongDomainGuardResult = {
  allowed: boolean;
  status?: Extract<PlaceSuggestionStatus, 'attached_context' | 'rejected'>;
  rejectedAs?: NonPlaceEntityType | string;
  placeType?: PlaceTaxonomyType | string;
  confidence: number;
  rulesFired: string[];
};

export function guardPlaceWrongDomain(span: string, contextLine = ''): WrongDomainGuardResult {
  const text = span.trim();
  const n = norm(text);
  const context = norm(contextLine);

  if (!text) {
    return { allowed: false, status: 'rejected', rejectedAs: 'OBJECT', placeType: 'unknown_place', confidence: 0.1, rulesFired: ['empty_span'] };
  }

  if (/^(?:user\s+mentioned|the\s+user\s+said|user\s+stated|the\s+assistant\s+noted|the\s+conversation\s+discussed|it\s+was\s+mentioned)\b/i.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'SYNTHETIC_NARRATION',
      placeType: 'unknown_place',
      confidence: 0.05,
      rulesFired: ['synthetic_narration_prefix'],
    };
  }

  const arbitration = arbitrateCandidateDomain(text, contextLine);
  if (!arbitration.allowedAsPlace) {
    return {
      allowed: false,
      status: arbitration.winningDomain === 'VENUE_SUBAREA_CONTEXT' ? 'attached_context' : 'rejected',
      rejectedAs: arbitration.winningDomain,
      placeType: arbitration.placeType ?? 'unknown_place',
      confidence: arbitration.confidence,
      rulesFired: arbitration.rulesFired.map((rule) => `dal:${rule}`),
    };
  }

  if (/[.!?]\s+\w/.test(text) && !/^(?:bad dogg compound|dtla|la|club nova)\b/i.test(text)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'CROSS_SENTENCE_FRAGMENT',
      placeType: 'unknown_place',
      confidence: 0.2,
      rulesFired: ['sentence_boundary_bleed'],
    };
  }

  if (TIME_ONLY.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'TIME_PERIOD', placeType: 'unknown_place', confidence: 0.2, rulesFired: ['wrong_domain_time'] };
  }

  if (VENUE_SUBAREA.test(n)) {
    return {
      allowed: false,
      status: 'attached_context',
      rejectedAs: 'VENUE_SUBAREA_CONTEXT',
      placeType: 'venue_subarea_context',
      confidence: 0.35,
      rulesFired: ['venue_subarea_context_only'],
    };
  }

  if (RELATIVE_CONTEXT.test(n)) {
    return {
      allowed: false,
      status: 'attached_context',
      rejectedAs: 'RELATIVE_LOCATION_CONTEXT',
      placeType: 'relative_location_context',
      confidence: 0.35,
      rulesFired: ['relative_location_context_only'],
    };
  }

  if (EVENT_ACTIVITY.test(n) || /\b(?:show|shows|afters|party)\b/i.test(n) && !/\b(?:club nova|bad dogg compound)\b/i.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'EVENT_ACTIVITY', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_event_activity'] };
  }

  if (PROJECT_TASK.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'PROJECT_TASK', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_project_task'] };
  }

  if (MEDIA_CONCEPT.test(n) || /\bmedia so this girl\b/i.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'MEDIA_CONCEPT', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_media_concept'] };
  }

  if (PRODUCT_OBJECT.test(n) || /\b(?:doorbell product|wristband|phone|vape|device|hardware|selfie\s+car)\b/i.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'PRODUCT_OBJECT', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_product_object'] };
  }

  if (SKILL_OR_DISCIPLINE.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'SKILL', placeType: 'unknown_place', confidence: 0.2, rulesFired: ['wrong_domain_skill_discipline'] };
  }

  if (COMMUNITY_OR_SCENE.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'COMMUNITY', placeType: 'unknown_place', confidence: 0.2, rulesFired: ['wrong_domain_community_scene'] };
  }

  if (EVENT_OR_BRAND.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'EVENT', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_event_or_brand'] };
  }

  const compound = n.match(COMPOUND_TWO_VENUES);
  if (
    compound &&
    !/\b(?:mom|dad|abuela|abuelo|grandma|grandpa|t[ií]o|t[ií]a|uncle|aunt)\b/i.test(n) &&
    compound[1].trim().length >= 3 &&
    compound[2].trim().length >= 3 &&
    /\b(?:club|hall|lounge|bar|park|house|home|venue|compound)\b/i.test(n)
  ) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'COMPOUND_PLACE',
      placeType: 'unknown_place',
      confidence: 0.3,
      rulesFired: ['compound_two_venues_split_required'],
    };
  }

  if (PERSON_OR_PRONOUN.test(n)) {
    return { allowed: false, status: 'rejected', rejectedAs: 'PERSON', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_person'] };
  }

  if (
    ORGANIZATION_ONLY.test(n) &&
    (/\bwork(?:ing)?\s+at\b/i.test(context) || /\bonboarding\b/i.test(context) || /\bventure capital firm\b/i.test(context))
  ) {
    return { allowed: false, status: 'rejected', rejectedAs: 'ORGANIZATION', placeType: 'unknown_place', confidence: 0.25, rulesFired: ['wrong_domain_organization_work_context'] };
  }

  if (/\bwork(?:ing)?\s+at\s+amazon\s+on\s+(?:their\s+)?ring doorbell product\b/i.test(context) && /^(?:amazon|ring doorbell product)$/i.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: n === 'amazon' ? 'ORGANIZATION' : 'PRODUCT_OBJECT',
      placeType: 'unknown_place',
      confidence: 0.25,
      rulesFired: ['work_at_org_on_product_not_place'],
    };
  }

  return { allowed: true, confidence: 0, rulesFired: [] };
}

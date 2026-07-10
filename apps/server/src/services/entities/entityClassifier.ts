/**
 * Deterministic Entity Classifier (Entity Resolution Hardening)
 *
 * Root cause this fixes: peoplePlacesService.inferType() defaulted ANY unknown
 * proper noun to 'person', and person-typed entities are promoted to Character
 * cards. So "High Noon" (product), "Find My" (app), "Moreno Valley" (place),
 * "Mom's House" (household), "Amazon Ring" (product) all became Characters.
 *
 * The rule that fixes it: **PERSON requires positive evidence.** Everything that
 * isn't provably a person/place/org/product/app/etc. becomes UNCLASSIFIED and is
 * NOT promoted to a Character until evidence arrives. No LLM — fully deterministic.
 *
 * Lexicons for apps/products/brands/orgs/skills/media are sourced from glossary.ts
 * via canonical/glossaryLexicon.ts — no parallel hardcoded sets.
 */
import {
  type EntityClass,
  type StorageType,
  type LegacyOmegaEntityType,
  type RootType,
  entityClassToRootType,
  toStorageType,
  toOmegaType,
  isUnknownEntity,
  isCharacterEligible,
  glossaryAppsLexicon,
  glossaryFoodDrinkLexicon,
  glossaryProductLexicon,
  glossaryBrandLexicon,
  glossaryOrganizationLexicon,
  glossaryMediaLexicon,
  glossarySkillLexicon,
  matchesGlossaryLexicon,
} from '../ontology/canonical';
import {
  SUPPLEMENTAL_GROUP_CLASSIFICATIONS,
  SUPPLEMENTAL_LOCATION_CLASSIFICATIONS,
} from '../ontology/classificationDefaults';
import {
  evaluateTitleOnlyPersonGuard,
} from '../lexical/intelligence/titleOnlyEntityGuard';
import { looksLikeMusicAct } from './musicActDetection';

export type { EntityClass, StorageType, LegacyOmegaEntityType, RootType };
export { toStorageType, toOmegaType, isUnknownEntity, isCharacterEligible, entityClassToRootType };

export interface Classification {
  type: EntityClass;
  rootType: RootType;
  confidence: number;
  reason: string;
  dynamicLabel?: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const has = (set: Set<string>, key: string) => set.has(key);
const singularize = (s: string) => s.endsWith('s') && s.length > 4 ? s.slice(0, -1) : s;
const normVariants = (s: string): string[] => {
  const normalized = norm(s);
  const variants = new Set([normalized]);
  variants.add(singularize(normalized));
  variants.add(normalized.replace(/['’']/g, "'"));
  return [...variants];
};

// Supplemental lexicons not yet in glossary — migrate to classifications table over time.
const COMPANIES = new Set([
  'amazon', 'google', 'apple', 'microsoft', 'meta', 'facebook', 'netflix', 'uber',
  'lyft', 'openai', 'anthropic', 'nvidia', 'tesla', 'walmart', 'target', 'costco',
  'starbucks', 'mcdonalds', 'chipotle', 'doordash', 'grubhub', 'instacart',
  'home depot', 'best buy', 'samsung', 'sony', 'intel', 'spacex', 'boeing',
]);

const PLACES = new Set([
  'moreno valley', 'los angeles', 'san diego', 'san francisco', 'new york', 'chicago',
  'riverside', 'anaheim', 'long beach', 'pasadena', 'irvine', 'santa ana', 'fontana',
  'rancho cucamonga', 'corona', 'temecula', 'ontario', 'pomona', 'fullerton',
  'california', 'texas', 'florida', 'arizona', 'nevada', 'mexico',
  // Canonical country protection. These are ontology data, not one-off merge
  // blocks: a known geographic label is typed before person-name matching.
  'argentina', 'australia', 'brazil', 'canada', 'chile', 'china', 'colombia',
  'costa rica', 'cuba', 'dominican republic', 'ecuador', 'egypt', 'el salvador',
  'france', 'germany', 'guatemala', 'honduras', 'india', 'indonesia', 'ireland',
  'italy', 'japan', 'mexico', 'nicaragua', 'nigeria', 'panama', 'peru',
  'philippines', 'portugal', 'puerto rico', 'south korea', 'spain', 'taiwan',
  'thailand', 'united kingdom', 'united states', 'venezuela', 'vietnam',
]);

const VENUES = new Set(
  SUPPLEMENTAL_LOCATION_CLASSIFICATIONS.map((s) => s.label)
);
const BANDS_AND_ORGS = new Set(
  SUPPLEMENTAL_GROUP_CLASSIFICATIONS.map((s) => s.label)
);

function result(type: EntityClass, confidence: number, reason: string, dynamicLabel?: string): Classification {
  return { type, rootType: entityClassToRootType(type), confidence, reason, dynamicLabel };
}

const GEO_SUFFIX = /\b(valley|hills?|heights|springs?|beach|city|lake|mountains?|canyon|mesa|grove|ridge|falls|gardens?|county|harbor|bay|island|park)$/i;
const VENUE_SUFFIX = /\b(house|home|apartment|apt|gym|studio|cafe|coffee|restaurant|bar|club|school|hospital|mall|store|shop|market|station|office|library|museum|stadium|arena|university|college|campus|building|tower|center|centre|church|temple|airport)$/i;
const HOUSEHOLD_RE = /^(.{1,80}?)['’]s\s+(house|home|place|apartment|apt|crib|pad|spot)$/i;
const GROUP_RE = /^(?:the\s{1,40})?(.{1,80}?)\s{1,40}(family|familia|crew|team|band|squad|gang|group|collective|household)$/i;
const EVENT_RE = /\b(party|wedding|graduation|funeral|birthday|reunion|quincea[nñ]era|barbecue|bbq|gathering|ceremony|celebration|memorial|baptism|anniversary|expo|conference|convention|festival|summit)$/i;
const HONORIFIC_WITH_NAME_RE =
  /^(?:t[íi]o|t[íi]a|uncle|aunt|auntie|coach|pastor|mr|mrs|ms|miss|dr|prof|professor|principal|officer|captain|mayor|president|senator|judge|dean|dj|abuela|abuelo|grandma|grandpa)\.?\s+[A-ZÀ-Ý]/i;

function personContextEvidence(name: string, context?: string): boolean {
  if (!context) return false;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ctx = context;
  if (new RegExp(`\\bmy\\s+(friend|cousin|brother|sister|mom|mother|dad|father|coworker|colleague|boss|manager|girlfriend|boyfriend|partner|wife|husband|uncle|aunt|t[íi]o|t[íi]a|roommate|neighbou?r|buddy|homie|ex)\\s+${n}\\b`, 'i').test(ctx)) return true;
  if (new RegExp(`\\b${n}\\s+(said|told|asked|texted|called|replied|mentioned|laughed|smiled|cried|came over|showed up|agreed|invited|hugged|drove|works|lives|loves|likes|thinks|feels|is my|was my)\\b`, 'i').test(ctx)) return true;
  if (new RegExp(`\\b${n}\\s+is\\s+(?:an?\\s+)?(?:[a-z-]+\\s+){0,3}(?:engineer|contractor|coder|developer|technician|manager|lead|coworker|colleague|friend|student|teacher|designer|doctor|nurse)\\b`, 'i').test(ctx)) return true;
  if (new RegExp(`\\b(t[íi]o|t[íi]a|uncle|aunt|cousin|mr|mrs|ms|dr)\\s+${n}\\b`, 'i').test(ctx)) return true;
  return false;
}

export function classifyEntity(name: string, context?: string): Classification {
  const raw = name.trim();
  if (!raw || raw.length < 2) return result('UNKNOWN', 0, 'empty/too-short');
  const lower = norm(raw);
  const lastWord = lower.split(' ').pop() ?? '';
  const variants = normVariants(raw);

  if (context) {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toolContext = new RegExp(`(?:chatbot|software|app|application|tool|platform)\\s+(?:called\\s+|named\\s+)?${escaped}\\b|${escaped}\\s+(?:chatbot|software|app|application|tool|platform)\\b`, 'i');
    if (toolContext.test(context)) return result('APP', 0.95, 'software/tool noun-phrase context');

    const schoolContext = new RegExp(`(?:master(?:'s|’s)?|degree|graduated|studied|school|college|university)(?:\\s+[^.!?]{0,80})?\\s+(?:from|at)\\s+${escaped}\\b`, 'i');
    if (schoolContext.test(context)) return result('ORGANIZATION', 0.93, 'school/degree context', 'school');

    const productContext = new RegExp(`${escaped}\\s+(?:camera|cameras|device|devices|product|products)\\b`, 'i');
    if (productContext.test(context)) return result('PRODUCT', 0.92, 'product noun-phrase context');

    const organizationContext = new RegExp(`(?:work|worked|working)\\s+(?:at|for)\\s+${escaped}\\b`, 'i');
    if (organizationContext.test(context)) return result('ORGANIZATION', 0.9, 'employment organization context');
  }

  const APPS = glossaryAppsLexicon();
  const FOOD_DRINKS = glossaryFoodDrinkLexicon();
  const PRODUCTS = glossaryProductLexicon();
  const BRANDS = glossaryBrandLexicon();
  const ORGS = glossaryOrganizationLexicon();
  const MEDIA = glossaryMediaLexicon();
  const SKILLS = glossarySkillLexicon();

  if (matchesGlossaryLexicon(variants, APPS)) return result('APP', 0.97, 'app lexicon (glossary)');
  if (matchesGlossaryLexicon(variants, FOOD_DRINKS)) return result('FOOD_DRINK', 0.96, 'food/drink lexicon (glossary)');
  if (matchesGlossaryLexicon(variants, PRODUCTS)) return result('PRODUCT', 0.96, 'product lexicon (glossary)');
  if (matchesGlossaryLexicon(variants, BRANDS)) return result('BRAND', 0.9, 'brand lexicon (glossary)');
  if (variants.some(v => has(COMPANIES, v))) return result('ORGANIZATION', 0.96, 'organization lexicon (supplemental)');
  if (matchesGlossaryLexicon(variants, ORGS)) return result('ORGANIZATION', 0.9, 'organization lexicon (glossary)');
  if (variants.some(v => has(BANDS_AND_ORGS, v))) {
    const label = variants.find(v => has(BANDS_AND_ORGS, v));
    return result('ORGANIZATION', 0.9, 'band/organization (dynamic classification)', label);
  }
  if (matchesGlossaryLexicon(variants, MEDIA)) return result('MEDIA', 0.9, 'media lexicon (glossary)');
  if (matchesGlossaryLexicon(variants, SKILLS)) return result('SKILL', 0.85, 'skill lexicon (glossary)');

  const firstWord = lower.split(' ')[0];
  if (lower.includes(' ') && has(COMPANIES, firstWord)) {
    return result('PRODUCT', 0.85, `company-prefixed product (${firstWord})`);
  }

  if (HOUSEHOLD_RE.test(raw)) return result('HOUSEHOLD', 0.9, 'possessive dwelling', 'household');

  if (/\bfamily|familia|household\b/i.test(raw) && GROUP_RE.test(raw)) {
    return result('FAMILY', 0.88, 'family/group suffix');
  }
  if (GROUP_RE.test(raw)) return result('GROUP', 0.85, 'group suffix');

  if (EVENT_RE.test(lower)) return result('EVENT', 0.82, 'event noun');

  if (variants.some(v => has(VENUES, v))) {
    const label = variants.find(v => has(VENUES, v));
    return result('LOCATION', 0.93, 'known venue (dynamic classification)', label);
  }
  if (variants.some(v => has(PLACES, v))) return result('PLACE', 0.92, 'known place (supplemental)');
  if (GEO_SUFFIX.test(lastWord)) return result('PLACE', 0.8, 'geographic suffix');
  if (VENUE_SUFFIX.test(lastWord)) return result('LOCATION', 0.8, 'venue suffix');
  if (context) {
    const n = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(in|at|from|near|to)\\s+${n}(?!['’]s)\\b`, 'i').test(context.toLowerCase())) {
      return result('LOCATION', 0.6, 'locative preposition context');
    }
  }

  // Band / musical act named in conversation ("Ex Lover the band", "DJ for
  // Prayers") — classify as an organization before any person heuristic so an
  // act with a person-like name isn't promoted to a Character.
  const musicAct = looksLikeMusicAct(raw, context);
  if (musicAct.isMusicAct) {
    return result('ORGANIZATION', 0.85, `music act / band (context: ${musicAct.signal})`, 'band');
  }

  const titleGuard = evaluateTitleOnlyPersonGuard(raw);
  if (titleGuard.isTitleOnly) {
    return result('UNKNOWN', 0.25, `title-only:${titleGuard.referenceType}`);
  }

  if (HONORIFIC_WITH_NAME_RE.test(raw) || titleGuard.hasAttachedName) {
    return result('PERSON', 0.88, 'honorific/kinship with attached name');
  }

  if (personContextEvidence(raw, context)) return result('PERSON', 0.75, 'person-context predicate');

  return result('UNKNOWN', 0.2, 'no classifying evidence — requires more signal');
}

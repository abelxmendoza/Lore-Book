/**
 * Glossary-derived lexicons for deterministic classification.
 * Supplements the keyword index in glossary.ts — used by entityClassifier
 * instead of maintaining parallel hardcoded sets.
 */
import { GLOSSARY, type RootType } from '../glossary';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function buildLexicon(domains: RootType[]): Set<string> {
  const set = new Set<string>();
  for (const entry of GLOSSARY) {
    if (!domains.includes(entry.domain)) continue;
    set.add(norm(entry.keyword));
    for (const alias of entry.aliases) {
      set.add(norm(alias));
    }
  }
  return set;
}

let _apps: Set<string> | undefined;
let _foodDrinks: Set<string> | undefined;
let _products: Set<string> | undefined;
let _brands: Set<string> | undefined;
let _organizations: Set<string> | undefined;
let _media: Set<string> | undefined;
let _skills: Set<string> | undefined;

export function glossaryAppsLexicon(): Set<string> {
  return (_apps ??= buildLexicon(['APP']));
}

export function glossaryFoodDrinkLexicon(): Set<string> {
  return (_foodDrinks ??= buildLexicon(['FOODDRINK']));
}

export function glossaryProductLexicon(): Set<string> {
  return (_products ??= buildLexicon(['PRODUCT']));
}

export function glossaryBrandLexicon(): Set<string> {
  return (_brands ??= buildLexicon(['BRAND']));
}

export function glossaryOrganizationLexicon(): Set<string> {
  return (_organizations ??= buildLexicon(['ORGANIZATION', 'GROUP']));
}

export function glossaryMediaLexicon(): Set<string> {
  return (_media ??= buildLexicon(['MEDIA']));
}

export function glossarySkillLexicon(): Set<string> {
  return (_skills ??= buildLexicon(['SKILL']));
}

/** Check normalized variants against a glossary lexicon set. */
export function matchesGlossaryLexicon(
  variants: string[],
  lexicon: Set<string>
): boolean {
  return variants.some((v) => lexicon.has(v));
}

export function glossaryLexiconForDomains(domains: RootType[]): Set<string> {
  return buildLexicon(domains);
}

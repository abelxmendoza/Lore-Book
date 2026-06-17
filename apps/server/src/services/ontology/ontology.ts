/**
 * Canonical ontology — the structured understanding layer.
 *
 *   ROOT TYPE → CATEGORY → SUBCATEGORY → KEYWORDS → ALIASES
 *
 * The hierarchy is derived from the glossary (single source of truth) so adding a
 * keyword automatically extends the tree. Root metadata (e.g. character-eligible)
 * lives here. Consumed by extraction, classification, search, retrieval,
 * relationships, temporal reasoning, and story synthesis.
 */
import { GLOSSARY, type GlossaryEntry, type RootType } from './glossary';

export type { RootType } from './glossary';

/** Stable root types — the governed top of the ontology (mirrors the classification sprint). */
export const ROOT_TYPES: RootType[] = [
  'PERSON', 'FAMILY', 'GROUP', 'ORGANIZATION', 'LOCATION', 'EVENT', 'PROJECT',
  'PRODUCT', 'APP', 'BRAND', 'MEDIA', 'SKILL', 'GOAL', 'PET', 'VEHICLE',
  'FOODDRINK', 'CONCEPT', 'TIME', 'UNKNOWN',
];

/** Which roots may be promoted to a Character card. */
export const CHARACTER_ELIGIBLE: ReadonlySet<RootType> = new Set<RootType>(['PERSON']);

export interface OntologySubcategory {
  subcategory: string;
  keywords: string[];
  aliases: string[];
  entries: GlossaryEntry[];
}
export interface OntologyCategory {
  category: string;
  subcategories: OntologySubcategory[];
}
export interface OntologyDomain {
  root: RootType;
  characterEligible: boolean;
  categories: OntologyCategory[];
}

/** Build the ROOT→CATEGORY→SUBCATEGORY→KEYWORDS→ALIASES tree from the glossary. */
export function buildOntology(): OntologyDomain[] {
  const byRoot = new Map<RootType, Map<string, Map<string, GlossaryEntry[]>>>();
  for (const entry of GLOSSARY) {
    const cat = entry.category || 'GENERAL';
    const sub = entry.subcategory || cat;
    if (!byRoot.has(entry.domain)) byRoot.set(entry.domain, new Map());
    const cats = byRoot.get(entry.domain)!;
    if (!cats.has(cat)) cats.set(cat, new Map());
    const subs = cats.get(cat)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(entry);
  }

  const out: OntologyDomain[] = [];
  for (const root of ROOT_TYPES) {
    const cats = byRoot.get(root);
    if (!cats) continue;
    out.push({
      root,
      characterEligible: CHARACTER_ELIGIBLE.has(root),
      categories: [...cats.entries()].map(([category, subs]) => ({
        category,
        subcategories: [...subs.entries()].map(([subcategory, entries]) => ({
          subcategory,
          keywords: entries.map((e) => e.keyword),
          aliases: [...new Set(entries.flatMap((e) => e.aliases))],
          entries,
        })),
      })),
    });
  }
  return out;
}

/** Flattened view for an Ontology Explorer UI (Phase 10) / diagnostics. */
export function ontologyRows(): Array<{
  root: RootType; category: string; subcategory: string;
  keyword: string; aliases: string[]; confidence: number; weight: number;
  relationshipHint?: string; queryHint?: string; aliasCount: number;
}> {
  return GLOSSARY.map((e) => ({
    root: e.domain,
    category: e.category,
    subcategory: e.subcategory ?? e.category,
    keyword: e.keyword,
    aliases: e.aliases,
    confidence: e.confidence,
    weight: e.weight,
    relationshipHint: e.relationshipHint,
    queryHint: e.queryHint,
    aliasCount: e.aliases.length,
  }));
}

export const ontology = { build: buildOntology, rows: ontologyRows, ROOT_TYPES, CHARACTER_ELIGIBLE };

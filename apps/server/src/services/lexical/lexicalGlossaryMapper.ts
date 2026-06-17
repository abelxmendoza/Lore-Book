/**
 * Map raw text against the canonical ontology glossary.
 */
import { glossaryAliases, type GlossaryEntry } from '../ontology/glossary';
import type { GlossaryMatch } from './lexicalTypes';
import { padForScan } from './lexicalNormalizer';

export function mapGlossaryMatches(text: string): GlossaryMatch[] {
  const padded = padForScan(text);
  const hits: GlossaryMatch[] = [];
  const seen = new Set<string>();

  for (const { alias, entry } of glossaryAliases()) {
    const key = `${entry.keyword}:${alias}`;
    if (seen.has(key)) continue;
    if (!padded.includes(alias)) continue;
    seen.add(key);
    hits.push({
      keyword: entry.keyword,
      alias,
      domain: entry.domain,
      category: entry.category,
      subcategory: entry.subcategory,
      relationshipHint: entry.relationshipHint,
      queryHint: entry.queryHint,
      actionHint: entry.actionHint,
      surfaceTarget: entry.surfaceTarget,
      confidence: entry.confidence * entry.weight,
    });
  }

  return hits.sort((a, b) => b.confidence - a.confidence);
}

export function glossaryEntriesForCategory(
  matches: GlossaryMatch[],
  category: GlossaryEntry['category']
): GlossaryMatch[] {
  return matches.filter((m) => m.category === category);
}

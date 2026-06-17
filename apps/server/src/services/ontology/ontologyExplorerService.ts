/**
 * Ontology Analytics — usage signals for glossary keywords and entity matches.
 */
import { supabaseAdmin } from '../supabaseClient';
import { GLOSSARY } from './glossary';
import { ontologyRows } from './ontology';

export type OntologyAnalyticsReport = {
  generatedAt: string;
  keywordHits: Array<{ keyword: string; entityMatches: number; aliasCount: number }>;
  unusedKeywords: string[];
  deadAliases: string[];
  highValueKeywords: Array<{ keyword: string; entityMatches: number }>;
  totals: {
    glossaryEntries: number;
    entitiesWithOntologyTags: number;
    charactersWithOntologyTags: number;
  };
};

export async function generateOntologyAnalytics(userId?: string): Promise<OntologyAnalyticsReport> {
  const rows = ontologyRows();

  let charQuery = supabaseAdmin.from('characters').select('id, metadata');
  if (userId) charQuery = charQuery.eq('user_id', userId);
  const { data: characters } = await charQuery.limit(500);

  let ppQuery = supabaseAdmin.from('people_places').select('id, metadata');
  if (userId) ppQuery = ppQuery.eq('user_id', userId);
  const { data: peoplePlaces } = await ppQuery.limit(500);

  const keywordEntityCount = new Map<string, number>();
  const aliasUsed = new Set<string>();

  const scanMetadata = (meta: Record<string, unknown> | null) => {
    if (!meta) return;
    const keywords = (meta.ontology_keywords as string[] | undefined) ?? [];
    const aliases = (meta.ontology_aliases as string[] | undefined) ?? [];
    for (const k of keywords) {
      keywordEntityCount.set(k, (keywordEntityCount.get(k) ?? 0) + 1);
    }
    for (const a of aliases) aliasUsed.add(a.toLowerCase());
  };

  for (const c of characters ?? []) scanMetadata(c.metadata as Record<string, unknown>);
  for (const p of peoplePlaces ?? []) scanMetadata(p.metadata as Record<string, unknown>);

  const keywordHits = rows.map((r) => ({
    keyword: r.keyword,
    entityMatches: keywordEntityCount.get(r.keyword) ?? 0,
    aliasCount: r.aliasCount,
  }));

  const unusedKeywords = keywordHits.filter((k) => k.entityMatches === 0).map((k) => k.keyword).slice(0, 50);
  const deadAliases = GLOSSARY.flatMap((e) => e.aliases)
    .filter((a) => !aliasUsed.has(a.toLowerCase()))
    .slice(0, 50);
  const highValueKeywords = [...keywordHits]
    .filter((k) => k.entityMatches > 0)
    .sort((a, b) => b.entityMatches - a.entityMatches)
    .slice(0, 20);

  const entitiesWithOntologyTags =
    (characters ?? []).filter((c) => (c.metadata as Record<string, unknown>)?.ontology_tags).length +
    (peoplePlaces ?? []).filter((p) => (p.metadata as Record<string, unknown>)?.ontology_tags).length;

  return {
    generatedAt: new Date().toISOString(),
    keywordHits,
    unusedKeywords,
    deadAliases,
    highValueKeywords,
    totals: {
      glossaryEntries: GLOSSARY.length,
      entitiesWithOntologyTags,
      charactersWithOntologyTags: (characters ?? []).filter((c) => (c.metadata as Record<string, unknown>)?.ontology_tags).length,
    },
  };
}

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useAccountAuthority } from '../../hooks/useAccountAuthority';
import { canAccessAdmin } from '../../middleware/roleGuard';

type OntologyResponse = {
  success: boolean;
  hierarchy: Array<{
    root: string;
    characterEligible: boolean;
    categories: Array<{
      category: string;
      subcategories: Array<{
        subcategory: string;
        keywords: string[];
        aliases: string[];
      }>;
    }>;
  }>;
  analytics: {
    totals: { glossaryEntries: number; entitiesWithOntologyTags: number };
    highValueKeywords: Array<{ keyword: string; entityMatches: number }>;
    unusedKeywords: string[];
  };
};

export function OntologyExplorer() {
  const { authority } = useAccountAuthority();
  const isAdmin = canAccessAdmin(authority);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OntologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<OntologyResponse>('/api/ontology');
      if (res.success) setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ontology');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/60">
        Admin access required.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading ontology…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-200">
        {error ?? 'Ontology unavailable'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-white">
      <header className="flex items-center gap-3">
        <Network className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Ontology Explorer</h1>
          <p className="text-sm text-white/50">
            {data.analytics.totals.glossaryEntries} glossary entries · {data.analytics.totals.entitiesWithOntologyTags} enriched entities
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-white/60">High-value keywords</h2>
        <div className="flex flex-wrap gap-2">
          {data.analytics.highValueKeywords.map((k) => (
            <span key={k.keyword} className="rounded-full bg-primary/20 px-3 py-1 text-xs text-primary">
              {k.keyword} ({k.entityMatches})
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-white/60">Hierarchy</h2>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
          {data.hierarchy.map((domain) => (
            <div key={domain.root}>
              <h3 className="font-semibold text-primary">{domain.root}</h3>
              {domain.categories.map((cat) => (
                <div key={cat.category} className="ml-4 mt-2">
                  <p className="text-white/80">{cat.category}</p>
                  {cat.subcategories.slice(0, 3).map((sub) => (
                    <p key={sub.subcategory} className="ml-4 text-xs text-white/50">
                      {sub.subcategory}:                   {sub.keywords.slice(0, 5).join(', ')}
                      {(sub.aliases?.length ?? 0) > 0 && ` (+${sub.aliases.length} aliases)`}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {data.analytics.unusedKeywords.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase text-white/60">Unused keywords (sample)</h2>
          <p className="text-xs text-white/50">{data.analytics.unusedKeywords.slice(0, 30).join(', ')}</p>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ListChecks, Loader2, NotebookPen } from 'lucide-react';

import { fetchJson } from '../../lib/api';

export type Briefing = {
  identity_baseline?: Record<string, unknown>;
  early_themes: string[];
  observations: string[];
  suggestions: string[];
  recommended_workflows: string[];
};

export const FirstWeekBriefing = () => {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchJson('/api/onboarding/briefing');
        setBriefing(data.briefing);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-white/5 px-4 py-3 text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading first-week briefing...
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-black/40 p-6 text-white shadow-panel">
      <div className="flex items-center gap-2 text-white">
        <NotebookPen className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">First-week briefing</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-widest text-white/60">Early themes</p>
          <ul className="mt-2 space-y-1 text-sm text-white/80">
            {briefing.early_themes.map((theme) => (
              <li key={theme}>• {theme}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border/60 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-widest text-white/60">Suggestions</p>
          <ul className="mt-2 space-y-1 text-sm text-white/80">
            {briefing.suggestions.map((suggestion) => (
              <li key={suggestion}>• {suggestion}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-xl border border-border/60 bg-white/5 p-4 text-sm text-white/80">
        <div className="flex items-center gap-2 text-white">
          <ListChecks className="h-4 w-4 text-primary" />
          <span>Recommended workflows</span>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {briefing.recommended_workflows.map((workflow) => (
            <li key={workflow}>{workflow}</li>
          ))}
        </ol>
      </div>
    </div>
  );
};

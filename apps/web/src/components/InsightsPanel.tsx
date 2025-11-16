import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import type { Insight } from './InsightCard';
import { InsightCard } from './InsightCard';
import { Button } from './ui/button';

export type InsightPayload = {
  patterns?: Insight[];
  correlations?: Insight[];
  cycles?: Insight[];
  motifs?: Insight[];
  identity_shifts?: Insight[];
  predictions?: Insight[];
};

export const InsightsPanel = ({
  insights,
  loading,
  onRefresh
}: {
  insights?: InsightPayload;
  loading?: boolean;
  onRefresh?: () => void;
}) => {
  const renderSection = (label: string, items?: Insight[]) => {
    if (!items || items.length === 0) {
      return (
        <div className="rounded-xl border border-border/50 bg-black/40 p-4 text-sm text-white/40">
          No {label.toLowerCase()} yet.
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((insight) => (
          <InsightCard key={insight.description} insight={insight} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border/70 bg-slate-950/50 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-white/50">Insight Engine</p>
          <h3 className="text-xl font-semibold text-white">AI-assisted Patterns</h3>
        </div>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-black/40 p-4 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Crunching signals…
        </div>
      )}

      <div className="space-y-4">
        <Section title="Patterns" content={renderSection('Patterns', insights?.patterns)} />
        <Section title="Correlations" content={renderSection('Correlations', insights?.correlations)} />
        <Section title="Cycles" content={renderSection('Cycles', insights?.cycles)} />
        <Section title="Motifs" content={renderSection('Motifs', insights?.motifs)} />
        <Section title="Identity Shifts" content={renderSection('Identity Shifts', insights?.identity_shifts)} />
        <Section title="Predictions" content={renderSection('Predictions', insights?.predictions)} />
      </div>
    </div>
  );
};

const Section = ({ title, content }: { title: string; content: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-sm text-white/70">
      <span className="font-semibold text-white">{title}</span>
    </div>
    {content}
  </div>
);

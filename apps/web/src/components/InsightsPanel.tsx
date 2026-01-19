import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import { InsightCard, type Insight } from './InsightCard';
import { Button } from './ui/button';

export type InsightPayload = {
  patterns?: Insight[];
  correlations?: Insight[];
  cycles?: Insight[];
  motifs?: Insight[];
  identity_shifts?: Insight[];
  predictions?: Insight[];
  topSkills?: Array<{
    skill: string;
    confidence: number;
    evidence: string[];
  }>;
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
        {insights?.topSkills && insights.topSkills.length > 0 && (
          <Section 
            title="Top Skills" 
            content={
              <div className="grid gap-4 md:grid-cols-2">
                {insights.topSkills.map((skill, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-border/50 bg-black/40"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">{skill.skill}</span>
                      <span className="text-xs text-white/50">
                        {Math.round(skill.confidence * 100)}%
                      </span>
                    </div>
                    {skill.evidence && skill.evidence.length > 0 && (
                      <div className="text-xs text-white/60 mt-2">
                        <span className="text-white/40">Evidence: </span>
                        {skill.evidence.slice(0, 2).join(', ')}
                        {skill.evidence.length > 2 && '...'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            }
          />
        )}
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

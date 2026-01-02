import { Trophy, Zap } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useGithubSync } from '../../hooks/useGithubSync';

export const GithubSummaryPanel = () => {
  const { summaries, latestMilestones, loading, error, refresh } = useGithubSync();

  return (
    <Card className="border border-purple-900/40 bg-gradient-to-b from-purple-950/40 to-black text-white">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Trophy className="h-4 w-4 text-primary" />
          GitHub Milestones
        </CardTitle>
        <button onClick={() => refresh()} className="text-xs text-primary hover:underline" disabled={loading}>
          Refresh
        </button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-amber-400">{error}</p>}
        {!summaries.length && !loading && <p className="text-white/60">Link a repository to see development arcs.</p>}
        {summaries.map((summary) => (
          <div key={summary.repo} className="rounded-lg border border-purple-900/50 bg-purple-950/20 p-3">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/50">
              <span>{summary.repo}</span>
              <span>{summary.milestones.length} milestones</span>
            </div>
            <div className="space-y-2">
              {summary.milestones.slice(0, 3).map((milestone, idx) => (
                <div key={`${summary.repo}-${idx}`} className="rounded border border-purple-800/40 bg-black/40 p-2">
                  <div className="flex items-center justify-between text-white/80">
                    <span className="font-medium">{milestone.title}</span>
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Zap className="h-3 w-3" />
                      {milestone.significance}
                    </span>
                  </div>
                  <p className="text-xs text-white/70">{milestone.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {latestMilestones.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-white/80">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-primary/70">Identity & arc insights</p>
            <p>
              {latestMilestones
                .map((item) => `${item.title} — ${item.summary}`)
                .join(' ')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

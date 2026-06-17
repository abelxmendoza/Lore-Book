import { useNavigate } from 'react-router-dom';
import {
  Shield,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  Archive,
  MessageCircle,
} from 'lucide-react';
import type { TrustOverview, TrustDomain } from '../../api/trust';
import { resolveTrustItemRoute, resolveUnknownGapRoute } from '../../lib/trustNavigation';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const DOMAIN_LABELS: Record<TrustDomain, string> = {
  characters: 'Characters',
  locations: 'Locations',
  organizations: 'Groups',
  projects: 'Projects',
  goals: 'Goals',
  skills: 'Skills',
  communities: 'Communities',
  relationships: 'Relationships',
  events: 'Life Log',
  households: 'Households',
};

const STATE_META = {
  known: { label: 'Known', icon: CheckCircle2, color: 'text-green-400' },
  suggested: { label: 'Suggested', icon: Sparkles, color: 'text-amber-400' },
  unverified: { label: 'Unverified', icon: HelpCircle, color: 'text-yellow-400' },
  conflicted: { label: 'Conflicted', icon: AlertTriangle, color: 'text-red-400' },
  archived: { label: 'Archived', icon: Archive, color: 'text-white/40' },
} as const;

type Props = {
  overview: TrustOverview;
  demoMode?: boolean;
};

/** Embedded trust rollup — lives inside Knowledge Gaps, not a standalone page */
export function TrustCoveragePanel({ overview, demoMode }: Props) {
  const navigate = useNavigate();
  const topReview = overview.review_queue.slice(0, 6);

  const goReview = (item: { action?: string; kind: string; domain: TrustDomain; reason: string; metadata?: Record<string, unknown> }) => {
    navigate(resolveTrustItemRoute(item));
  };

  return (
    <section className="space-y-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6" data-testid="trust-coverage-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 border border-primary/30">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Lore coverage</h2>
            <p className="text-sm text-white/50">
              What LoreBook knows, what it&apos;s unsure about, and what to review next.
            </p>
          </div>
        </div>
        {demoMode && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
            Demo data
          </span>
        )}
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <StatPill label="Coverage" value={`${overview.overall_coverage_score}%`} />
          <StatPill label="Unknowns" value={String(overview.unknowns.length)} />
          {overview.conflicts.length > 0 && (
            <StatPill label="Conflicts" value={String(overview.conflicts.length)} accent="warning" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(STATE_META) as Array<keyof typeof STATE_META>).map((key) => {
          const meta = STATE_META[key];
          const Icon = meta.icon;
          return (
            <Card key={key} className="bg-black/40 border-white/10">
              <CardContent className="pt-3 pb-2 px-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                  <span className="text-[10px] text-white/50">{meta.label}</span>
                </div>
                <p className="text-xl font-bold text-white">{overview.state_totals[key] ?? 0}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {overview.coverage
          .filter((row) => row.entity_count > 0 || row.states.suggested > 0 || row.states.conflicted > 0)
          .slice(0, 9)
          .map((row) => (
            <Card key={row.domain} className="bg-black/30 border-white/10">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-sm text-white flex justify-between items-center">
                  {DOMAIN_LABELS[row.domain]}
                  <span className="text-xs font-mono text-primary">{row.coverage_score}%</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-white/55 px-3 pb-3">
                {row.entity_count} entities
                {row.states.suggested > 0 && ` · ${row.states.suggested} suggested`}
                {row.states.conflicted > 0 && ` · ${row.states.conflicted} conflicts`}
              </CardContent>
            </Card>
          ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Review next
          </h3>
          <div className="space-y-2">
            {topReview.length === 0 ? (
              <p className="text-sm text-white/45">Nothing urgent right now.</p>
            ) : (
              topReview.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    <p className="text-xs text-white/45 line-clamp-2">{item.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs h-8"
                    onClick={() => goReview(item)}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Review
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-yellow-400" />
            Unknown references
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {overview.unknowns.slice(0, 6).map((gap) => (
              <button
                key={gap.id}
                type="button"
                onClick={() => navigate(resolveUnknownGapRoute(gap))}
                className="w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <p className="text-sm font-medium text-white">{gap.label}</p>
                <p className="text-xs text-white/45 mt-0.5">{gap.prompt}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'warning';
}) {
  return (
    <div
      className={`rounded-full border px-2.5 py-1 text-xs ${
        accent === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          : 'border-white/10 bg-white/5 text-white/80'
      }`}
    >
      <span className="text-white/45 mr-1.5">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// =====================================================
// ORGANIZATION DIFFERENTIATOR TABS — Influence, Insights, Lore
// The tabs that make a LoreBook group card feel like a living world node rather
// than a CRM record. Content comes from the org's curated/derived "world".
// =====================================================

import {
  Sparkles, TrendingUp, ArrowUpRight, Repeat, Lightbulb, Flame,
  Activity, Wand2, BookMarked, Hash, Star,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  readOrganizationWorld,
  impactBand,
  type OrgWorldInput,
  type OrgInsightKind,
} from '../../lib/organizationLore';

type PanelProps = { organization: OrgWorldInput };

const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wider text-white/45';

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-white/35 italic">Nothing tracked yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

// ── INFLUENCE TAB ─────────────────────────────────────────────────────────────
export function OrganizationInfluencePanel({ organization }: PanelProps) {
  const { influence } = readOrganizationWorld(organization);
  const band = impactBand(influence.impactScore);

  return (
    <div className="space-y-4" data-testid="org-influence-panel">
      <Card className="bg-gradient-to-br from-amber-500/10 via-black/30 to-black/40 border-amber-500/20">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={SECTION_TITLE}>Impact on you</p>
              <p className="mt-1 text-sm text-white/55">How much this group shaped who you are today.</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold tabular-nums text-amber-300 leading-none">{influence.impactScore}</p>
              <p className="text-[10px] uppercase tracking-wide text-amber-200/60 mt-1">{band}</p>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400"
              style={{ width: `${Math.max(0, Math.min(100, influence.impactScore))}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              <p className={SECTION_TITLE}>Skills gained</p>
            </div>
            <Chips items={influence.skillsGained} tone="bg-emerald-500/10 border-emerald-500/25 text-emerald-200" />
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-sky-300">
              <TrendingUp className="h-3.5 w-3.5" />
              <p className={SECTION_TITLE}>Skills strengthened</p>
            </div>
            <Chips items={influence.skillsStrengthened} tone="bg-sky-500/10 border-sky-500/25 text-sky-200" />
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-violet-300">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <p className={SECTION_TITLE}>Opportunities created</p>
            </div>
            <Chips items={influence.opportunitiesCreated} tone="bg-violet-500/10 border-violet-500/25 text-violet-200" />
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-rose-300">
              <Repeat className="h-3.5 w-3.5" />
              <p className={SECTION_TITLE}>Habits formed</p>
            </div>
            <Chips items={influence.habitsFormed} tone="bg-rose-500/10 border-rose-500/25 text-rose-200" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── INSIGHTS TAB ──────────────────────────────────────────────────────────────
const INSIGHT_STYLE: Record<OrgInsightKind, { icon: typeof Flame; label: string; cls: string }> = {
  impact: { icon: Flame, label: 'Impact', cls: 'text-amber-300 border-amber-500/25 bg-amber-500/5' },
  trend: { icon: Activity, label: 'Trend', cls: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/5' },
  prediction: { icon: Lightbulb, label: 'Prediction', cls: 'text-sky-300 border-sky-500/25 bg-sky-500/5' },
  pattern: { icon: Hash, label: 'Hidden pattern', cls: 'text-violet-300 border-violet-500/25 bg-violet-500/5' },
};

export function OrganizationInsightsPanel({ organization }: PanelProps) {
  const { insights } = readOrganizationWorld(organization);

  return (
    <div className="space-y-3" data-testid="org-insights-panel">
      <div className="flex items-center gap-2 text-white/60">
        <Wand2 className="h-4 w-4 text-primary" />
        <p className="text-sm">What LoreBook notices about this group</p>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-white/40 italic">No insights yet — they grow as you add memories.</p>
      ) : (
        insights.map((insight) => {
          const style = INSIGHT_STYLE[insight.kind];
          const Icon = style.icon;
          return (
            <Card key={insight.id} className={`border ${style.cls}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.cls.split(' ')[0]}`} />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">{style.label}</p>
                  <p className="text-sm text-white/80 leading-snug mt-0.5">{insight.text}</p>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ── LORE TAB (the secret sauce) ───────────────────────────────────────────────
export function OrganizationLorePanel({ organization }: PanelProps) {
  const { lore, archetype } = readOrganizationWorld(organization);

  return (
    <div className="space-y-4" data-testid="org-lore-panel">
      <Card className="bg-gradient-to-br from-violet-600/15 via-fuchsia-600/10 to-black/40 border-violet-500/25 overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-violet-200/70">
            <BookMarked className="h-4 w-4" />
            <p className="text-[10px] uppercase tracking-[0.2em]">Archetype</p>
          </div>
          <h3 className="mt-1.5 text-2xl font-bold text-white">{archetype.nickname}</h3>
          <p className="mt-1 text-sm text-violet-100/70 italic">"{archetype.essence}"</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] border-violet-400/30 text-violet-200 bg-violet-500/10">
              <Star className="h-2.5 w-2.5 mr-1" />
              {archetype.storyFunction}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-fuchsia-400/30 text-fuchsia-200 bg-fuchsia-500/10">
              {archetype.narrativeImportance}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black/30 border-white/10">
        <CardContent className="p-4 space-y-1.5">
          <p className={SECTION_TITLE}>Role in your story</p>
          <p className="text-sm text-white/75 leading-relaxed">{lore.roleInStory}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <p className={SECTION_TITLE}>Themes</p>
            <Chips items={lore.themes} tone="bg-white/5 border-white/15 text-white/70" />
          </CardContent>
        </Card>
        <Card className="bg-black/30 border-white/10">
          <CardContent className="p-4 space-y-2">
            <p className={SECTION_TITLE}>Symbols</p>
            <Chips items={lore.symbols} tone="bg-white/5 border-white/15 text-white/70" />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-black/30 border-white/10">
        <CardContent className="p-4 space-y-2">
          <p className={SECTION_TITLE}>Connected story arcs</p>
          <Chips items={lore.connectedArcs} tone="bg-primary/10 border-primary/25 text-primary/90" />
        </CardContent>
      </Card>
    </div>
  );
}

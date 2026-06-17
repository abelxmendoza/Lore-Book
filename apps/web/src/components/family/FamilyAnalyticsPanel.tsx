import { TrendingUp, TrendingDown, Minus, Heart } from 'lucide-react';

export type RelationshipAnalyticDTO = {
  characterId: string;
  name: string;
  kinshipLabel?: string;
  strength: number;
  mentionCount: number;
  evidenceCount: number;
  trend: 'growing' | 'stable' | 'inactive';
};

type Props = {
  analytics: RelationshipAnalyticDTO[];
  onMemberClick?: (characterId: string, name: string) => void;
};

function TrendIcon({ trend }: { trend: RelationshipAnalyticDTO['trend'] }) {
  if (trend === 'growing') return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === 'inactive') return <TrendingDown className="h-3.5 w-3.5 text-white/30" />;
  return <Minus className="h-3.5 w-3.5 text-white/40" />;
}

export function FamilyAnalyticsPanel({ analytics, onMemberClick }: Props) {
  if (!analytics.length) {
    return (
      <p className="text-sm text-white/45 py-8 text-center">
        Relationship analytics appear as you mention family in chat.
      </p>
    );
  }

  const strongest = analytics.slice(0, 5);
  const growing = analytics.filter((a) => a.trend === 'growing').slice(0, 5);
  const inactive = analytics.filter((a) => a.trend === 'inactive').slice(0, 5);

  const renderList = (items: RelationshipAnalyticDTO[], title: string) => (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-white/40">{title}</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.characterId}>
            <button
              type="button"
              onClick={() => onMemberClick?.(a.characterId, a.name)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 hover:border-purple-500/30 hover:bg-purple-500/5 transition text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.name}</p>
                {a.kinshipLabel && <p className="text-xs text-white/40">{a.kinshipLabel}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TrendIcon trend={a.trend} />
                <span className="text-sm font-mono text-purple-300">{a.strength.toFixed(2)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-white/60 text-sm">
        <Heart className="h-4 w-4 text-rose-400" />
        Strength scores combine kinship confidence, mention frequency, and evidence count.
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {renderList(strongest, 'Strongest relationships')}
        {growing.length > 0 && renderList(growing, 'Growing relationships')}
        {inactive.length > 0 && renderList(inactive, 'Inactive relationships')}
      </div>
    </div>
  );
}

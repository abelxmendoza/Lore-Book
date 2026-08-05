// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Baby, Users } from 'lucide-react';

export type KidTogether = {
  id: string;
  name: string;
  /** 'together' = both parents; 'step' = belongs to just one of them. */
  relation: 'together' | 'step';
  belongsTo?: 'both' | 'self' | 'partner';
  coParents?: Array<{ id?: string; name: string; relation_label?: string }>;
};

type KidsTogetherPanelProps = {
  kids: KidTogether[];
  loading: boolean;
  partnerName: string;
};

/** Dating & Romance — offspring, step-kids, and any other co-parents on that same kid. */
export function KidsTogetherPanel({ kids, loading, partnerName }: KidsTogetherPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Baby className="h-6 w-6 text-pink-400/50 animate-pulse" />
      </div>
    );
  }

  if (kids.length === 0) {
    return (
      <div className="text-center py-12 text-white/40 px-4" data-testid="kids-together-empty">
        <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No kids linked to this relationship yet.</p>
        <p className="text-xs text-white/30 mt-1">
          Mention a child you share with {partnerName} in chat, or add them to your Family Tree.
        </p>
      </div>
    );
  }

  const together = kids.filter((k) => k.relation === 'together');
  const step = kids.filter((k) => k.relation === 'step');

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0" data-testid="kids-together-panel">
      {together.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40 px-0.5">
            Kids together ({together.length})
          </p>
          <div className="space-y-2">
            {together.map((kid) => (
              <KidCard key={kid.id} kid={kid} partnerName={partnerName} />
            ))}
          </div>
        </div>
      )}

      {step.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40 px-0.5">
            Step-kids ({step.length})
          </p>
          <div className="space-y-2">
            {step.map((kid) => (
              <KidCard key={kid.id} kid={kid} partnerName={partnerName} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KidCard({ kid, partnerName }: { kid: KidTogether; partnerName: string }) {
  const isStep = kid.relation === 'step';
  const belongsToLabel =
    kid.belongsTo === 'self' ? 'Your child — now step-child to ' + partnerName
      : kid.belongsTo === 'partner' ? `${partnerName}'s child — now your step-child`
      : null;

  return (
    <div
      className="rounded-lg border border-pink-500/20 bg-black/40 px-3 py-2.5 sm:p-4"
      data-testid="kids-together-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Baby className="h-4 w-4 shrink-0 text-pink-300/80" />
          <span className="text-sm font-medium text-white truncate">{kid.name}</span>
        </div>
        <span
          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
            isStep
              ? 'bg-purple-500/10 text-purple-200 border-purple-500/25'
              : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/25'
          }`}
        >
          {isStep ? 'Step-child' : 'Together'}
        </span>
      </div>

      {belongsToLabel && <p className="mt-1 text-xs text-white/45">{belongsToLabel}</p>}

      {kid.coParents && kid.coParents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-1.5">
          <Users className="h-3 w-3 mt-0.5 shrink-0 text-white/35" />
          <p className="text-xs text-white/50">
            Also co-parented by{' '}
            {kid.coParents.map((cp, i) => (
              <span key={cp.id ?? cp.name}>
                <span className="text-white/70">{cp.name}</span>
                {cp.relation_label ? ` (${cp.relation_label})` : ''}
                {i < kid.coParents!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

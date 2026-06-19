import { Activity, Brain, GitBranch, Sparkles, TrendingDown } from 'lucide-react';
import type { MockRelationshipInfluence } from '../../mocks/romanticLifeImpact';

type RelationshipLifeImpactPanelProps = {
  influence: MockRelationshipInfluence;
  personName?: string;
  compact?: boolean;
};

export function RelationshipLifeImpactPanel({
  influence,
  personName,
  compact,
}: RelationshipLifeImpactPanelProps) {
  const score = Math.round((influence.autobiographical_impact ?? 0) * 100);
  const pad = compact ? 'p-3 sm:p-4' : 'p-5';
  const heading = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden ${compact ? '' : ''}`}>
      <div className={`${pad} rounded-xl border border-pink-500/25 bg-pink-950/15 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-5 min-w-0`}>
        <div className="text-center flex-shrink-0 sm:min-w-[72px] mx-auto sm:mx-0">
          <p className={`${compact ? 'text-3xl' : 'text-4xl'} font-bold text-pink-300 tabular-nums`}>{score}</p>
          <p className="text-[10px] sm:text-xs text-white/50 mt-0.5">Impact Score</p>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className={`${heading} font-semibold text-white mb-1 break-words`}>
            {influence.impact_label ?? 'Moderate'} Autobiographical Impact
          </p>
          <p className="text-[11px] sm:text-xs text-white/60 leading-relaxed break-words">
            {influence.impact_summary ??
              `How significantly ${personName ?? 'this relationship'} shaped your life arcs, beliefs, and patterns.`}
          </p>
        </div>
      </div>

      {influence.life_arcs_influenced?.length > 0 && (
        <div>
          <h3 className={`${heading} font-semibold text-white/80 mb-2 sm:mb-3 flex items-center gap-2`}>
            <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-400 shrink-0" />
            Life Arcs Influenced
          </h3>
          <div className="space-y-2">
            {influence.life_arcs_influenced.map((arc) => (
              <div
                key={arc.id}
                className="p-2.5 sm:p-3 rounded-lg bg-white/5 border border-white/10 flex items-start justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-white/85 break-words">{arc.title}</p>
                  {arc.arc_type && <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">{arc.arc_type}</p>}
                </div>
                {arc.confidence != null && (
                  <span className="text-[10px] sm:text-xs text-pink-300 font-semibold shrink-0">
                    {Math.round(arc.confidence * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {influence.knowledge_claims_crystallized?.length > 0 && (
        <div>
          <h3 className={`${heading} font-semibold text-white/80 mb-2 sm:mb-3 flex items-center gap-2`}>
            <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0" />
            What You Learned
          </h3>
          <div className="space-y-2">
            {influence.knowledge_claims_crystallized.map((item) => (
              <div
                key={item.id}
                className="p-2.5 sm:p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 min-w-0"
              >
                <p className="text-[11px] sm:text-xs text-white/75 leading-snug break-words">
                  {item.evidence_summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {influence.breakup_aftermath && (
        <div>
          <h3 className={`${heading} font-semibold text-white/80 mb-2 sm:mb-3 flex items-center gap-2`}>
            <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400 shrink-0" />
            Aftermath
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {influence.breakup_aftermath.closure_level != null && (
              <div className="p-2.5 sm:p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] sm:text-xs text-white/50 mb-0.5">Closure</p>
                <p className="text-base sm:text-lg font-bold text-orange-300">
                  {Math.round(influence.breakup_aftermath.closure_level * 100)}%
                </p>
              </div>
            )}
            {influence.breakup_aftermath.recovery_status && (
              <div className="p-2.5 sm:p-3 rounded-lg bg-white/5 border border-white/10 min-w-0">
                <p className="text-[10px] sm:text-xs text-white/50 mb-0.5">Recovery</p>
                <p className="text-xs sm:text-sm font-semibold text-white/80 capitalize break-words">
                  {influence.breakup_aftermath.recovery_status.replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {influence.relationship_patterns?.length > 0 && (
        <div>
          <h3 className={`${heading} font-semibold text-white/80 mb-2 sm:mb-3 flex items-center gap-2`}>
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />
            Patterns
          </h3>
          <div className="space-y-2">
            {influence.relationship_patterns.map((p, i) => (
              <div key={i} className="p-2.5 sm:p-3 rounded-lg bg-purple-950/20 border border-purple-500/20 min-w-0">
                <p className="text-[11px] sm:text-xs text-white/70 break-words">
                  {p.pattern_description ?? p.pattern_type}
                </p>
                {p.frequency != null && (
                  <p className="text-[10px] text-purple-400/60 mt-1">
                    Noticed {p.frequency}× across your story
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <p className="text-[10px] sm:text-xs text-white/35 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 shrink-0" />
          Impact is inferred from your journal and chat — unique to each person in your lore.
        </p>
      )}
    </div>
  );
}

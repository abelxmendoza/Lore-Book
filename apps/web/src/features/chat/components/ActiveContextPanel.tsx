import { useState, useEffect, useCallback } from 'react';
import { Layers, ChevronRight, X, Brain, GitBranch, RefreshCw } from 'lucide-react';
import { fetchJson } from '../../../lib/api';
import { KNOWLEDGE_TYPE_LABELS, KNOWLEDGE_TYPE_COLORS } from '../../../api/knowledge';

type KnowledgeClaim = {
  id: string;
  human_readable_claim: string;
  knowledge_type: string;
  confidence: number;
  status: string;
  last_reinforced_at: string;
};

type LifeArc = {
  id: string;
  title: string;
  arc_type: string;
  track: string;
  confidence: number;
  is_active: boolean;
  start_date?: string;
  dominant_emotion?: string;
  emotional_arc?: string;
};

type ChatContext = {
  knowledge_claims: KnowledgeClaim[];
  life_arcs: LifeArc[];
};

const ARC_TRACK_COLORS: Record<string, string> = {
  career: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  relationships: 'text-pink-400 bg-pink-500/10 border-pink-500/25',
  creative: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  health: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
  inner: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  mixed: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
};

const EMOTIONAL_ARC_LABELS: Record<string, string> = {
  building: '↑ Building',
  climax: '⚡ Peak',
  resolution: '→ Resolving',
  grief: '↓ Grief',
  recovery: '↑ Recovery',
  neutral: '— Stable',
};

const confColor = (v: number) =>
  v >= 0.8 ? 'text-green-400' : v >= 0.6 ? 'text-yellow-400' : 'text-orange-400';

interface ActiveContextPanelProps {
  open: boolean;
  onClose: () => void;
  lastMessageAt?: number;
}

export const ActiveContextPanel = ({ open, onClose, lastMessageAt }: ActiveContextPanelProps) => {
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<'knowledge' | 'arcs'>('knowledge');

  const load = useCallback(() => {
    setLoading(true);
    fetchJson<{ success: boolean } & ChatContext>('/api/knowledge/chat-context')
      .then(res => { if (res.success) setCtx(res); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  // Refresh when a new message arrives
  useEffect(() => { if (open && lastMessageAt) load(); }, [lastMessageAt]);

  if (!open) return null;

  return (
    <div className="w-64 flex-shrink-0 border-l border-white/10 bg-black/60 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-white/80">Active Context</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors ml-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-white/10 flex-shrink-0">
        {(['knowledge', 'arcs'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setSection(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors ${
              section === tab
                ? 'text-indigo-300 border-b border-indigo-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {tab === 'knowledge' ? (
              <><Brain className="h-3 w-3" /> Knowledge</>
            ) : (
              <><GitBranch className="h-3 w-3" /> Life Arcs</>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {loading && !ctx && (
          <div className="flex justify-center pt-8">
            <RefreshCw className="h-5 w-5 text-indigo-400/50 animate-spin" />
          </div>
        )}

        {!loading && ctx && section === 'knowledge' && (
          ctx.knowledge_claims.length === 0 ? (
            <p className="text-xs text-white/30 text-center pt-6">No active knowledge claims yet.</p>
          ) : (
            ctx.knowledge_claims.map(claim => (
              <div key={claim.id} className="p-2 rounded-lg bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-bold tabular-nums mt-0.5 flex-shrink-0 ${confColor(claim.confidence)}`}>
                    {Math.round(claim.confidence * 100)}%
                  </span>
                  <p className="text-[11px] text-white/80 leading-snug flex-1">{claim.human_readable_claim}</p>
                </div>
                <div className="mt-1.5">
                  <span className={`text-[9px] px-1 py-0 rounded border ${KNOWLEDGE_TYPE_COLORS[claim.knowledge_type] ?? 'text-white/40 border-white/10'}`}>
                    {KNOWLEDGE_TYPE_LABELS[claim.knowledge_type] ?? claim.knowledge_type}
                  </span>
                </div>
              </div>
            ))
          )
        )}

        {!loading && ctx && section === 'arcs' && (
          ctx.life_arcs.length === 0 ? (
            <p className="text-xs text-white/30 text-center pt-6">No active life arcs detected.</p>
          ) : (
            ctx.life_arcs.map(arc => (
              <div key={arc.id} className="p-2 rounded-lg bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
                <p className="text-[11px] font-medium text-white/85 leading-snug mb-1.5">{arc.title}</p>
                <div className="flex flex-wrap gap-1">
                  {arc.track && (
                    <span className={`text-[9px] px-1 py-0 rounded border ${ARC_TRACK_COLORS[arc.track] ?? 'text-white/40 border-white/10'}`}>
                      {arc.track}
                    </span>
                  )}
                  {arc.emotional_arc && (
                    <span className="text-[9px] px-1 py-0 rounded border text-white/40 border-white/10">
                      {EMOTIONAL_ARC_LABELS[arc.emotional_arc] ?? arc.emotional_arc}
                    </span>
                  )}
                  <span className={`text-[9px] px-1 py-0 rounded border ${confColor(arc.confidence)} border-current/30`}>
                    {Math.round(arc.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-white/10 flex-shrink-0">
        <p className="text-[10px] text-white/25 leading-tight">
          Why is LoreBook talking about this?<br />
          <span className="text-indigo-400/40">These are the patterns shaping its responses.</span>
        </p>
      </div>
    </div>
  );
};

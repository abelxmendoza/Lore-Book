import { useState } from 'react';
import { Eye, EyeOff, Cpu, Database, Zap, CheckCircle } from 'lucide-react';

export type ModeDecision = {
  mode: string;
  confidence: number;
  reasoning: string;
};

export type RagStats = {
  sourceCount: number;
  cacheHit: boolean;
  retrievalMs: number;
  contextItems: number;
};

interface Props {
  modeDecision?: ModeDecision;
  ragStats?: RagStats;
  activePersona?: string;
  connections?: string[];
  visible: boolean;
}

const MODE_LABELS: Record<string, string> = {
  EXPERIENCE_INGESTION: 'Storing experience',
  MEMORY_RECALL:        'Recalling memory',
  REFLECTION:           'Reflecting',
  QUESTION_ANSWER:      'Answering question',
  ACTION_LOG:           'Logging action',
  CREATIVE:             'Creative mode',
  UNKNOWN:              'General',
};

const MODE_COLORS: Record<string, string> = {
  EXPERIENCE_INGESTION: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  MEMORY_RECALL:        'text-purple-400 bg-purple-500/10 border-purple-500/30',
  REFLECTION:           'text-teal-400 bg-teal-500/10 border-teal-500/30',
  QUESTION_ANSWER:      'text-green-400 bg-green-500/10 border-green-500/30',
  ACTION_LOG:           'text-orange-400 bg-orange-500/10 border-orange-500/30',
  CREATIVE:             'text-pink-400 bg-pink-500/10 border-pink-500/30',
  UNKNOWN:              'text-white/40 bg-white/5 border-white/10',
};

export const CognitionMetaPanel = ({ modeDecision, ragStats, activePersona, connections, visible }: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;
  if (!modeDecision && !ragStats) return null;

  const modeKey = modeDecision?.mode ?? 'UNKNOWN';
  const modeColor = MODE_COLORS[modeKey] ?? MODE_COLORS.UNKNOWN;
  const modeLabel = MODE_LABELS[modeKey] ?? modeKey;

  return (
    <div className="mt-2 border border-white/5 rounded-lg bg-black/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Cpu className="h-3 w-3 text-white/30" />
          <span className="text-xs text-white/30 font-mono">cognitive trace</span>
          {modeDecision && (
            <span className={`px-1.5 py-0.5 rounded text-xs border font-medium ${modeColor}`}>
              {modeLabel}
            </span>
          )}
          {ragStats?.cacheHit && (
            <span className="flex items-center gap-0.5 text-xs text-emerald-400/70">
              <CheckCircle className="h-3 w-3" />
              cached
            </span>
          )}
        </div>
        {expanded
          ? <EyeOff className="h-3 w-3 text-white/20" />
          : <Eye className="h-3 w-3 text-white/20" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5">

          {/* Mode Router */}
          {modeDecision && (
            <div className="pt-2">
              <p className="text-xs text-white/30 uppercase tracking-wide mb-1.5">Mode Router</p>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded text-xs border font-medium ${modeColor}`}>
                  {modeLabel}
                </span>
                <span className="text-xs text-white/40">
                  {Math.round(modeDecision.confidence * 100)}% confidence
                </span>
                {activePersona && activePersona !== 'AUTO_BLEND' && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-violet-500/10 text-violet-400 border border-violet-500/30">
                    {activePersona}
                  </span>
                )}
              </div>
              {modeDecision.reasoning && (
                <p className="text-xs text-white/30 italic leading-relaxed">
                  {modeDecision.reasoning}
                </p>
              )}
            </div>
          )}

          {/* RAG Stats */}
          {ragStats && (
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide mb-1.5">Retrieval</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-white/40">
                  <Database className="h-3 w-3" />
                  {ragStats.sourceCount} source{ragStats.sourceCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-xs text-white/40">
                  <Zap className="h-3 w-3" />
                  {ragStats.contextItems} context items
                </span>
                <span className="text-xs text-white/30 font-mono">
                  {ragStats.retrievalMs}ms
                  {ragStats.cacheHit ? ' (cache)' : ' (live)'}
                </span>
              </div>
            </div>
          )}

          {/* Connections found */}
          {connections && connections.length > 0 && (
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide mb-1.5">Connections</p>
              <ul className="space-y-0.5">
                {connections.map((c, i) => (
                  <li key={i} className="text-xs text-white/40 leading-relaxed">· {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import { useState } from 'react';
import { Brain, Zap, AlertTriangle, Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import type { MemoryFeedbackEvent } from '../../hooks/useChatStream';

const TYPE_COLORS: Record<string, string> = {
  EXPERIENCE: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  FEELING:    'bg-pink-500/20 text-pink-300 border-pink-500/40',
  BELIEF:     'bg-purple-500/20 text-purple-300 border-purple-500/40',
  FACT:       'bg-green-500/20 text-green-300 border-green-500/40',
  DECISION:   'bg-orange-500/20 text-orange-300 border-orange-500/40',
  QUESTION:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
};

const INTENSITY_COLORS: Record<string, string> = {
  LOW:    'text-blue-300',
  MEDIUM: 'text-yellow-300',
  HIGH:   'text-red-400',
};

interface Props {
  feedback: MemoryFeedbackEvent;
}

export const MemoryCognitionPanel = ({ feedback }: Props) => {
  const [expanded, setExpanded] = useState(false);

  const hasContent =
    feedback.knowledgeUnits.length > 0 ||
    feedback.emotionalSignals.emotions.length > 0 ||
    feedback.entitiesDetected.length > 0 ||
    feedback.contradictionsDetected.length > 0;

  if (!hasContent) return null;

  return (
    <div className="mt-3 pt-3 border-t border-primary/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-xs font-semibold text-primary/70">Memory Formation</span>
          {feedback.knowledgeUnits.length > 0 && (
            <span className="text-xs text-white/40">
              {feedback.knowledgeUnits.length} unit{feedback.knowledgeUnits.length !== 1 ? 's' : ''} stored
            </span>
          )}
          {feedback.contradictionsDetected.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {feedback.contradictionsDetected.length} conflict{feedback.contradictionsDetected.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-white/40 group-hover:text-white/60 transition-colors" />
          : <ChevronDown className="h-3 w-3 text-white/40 group-hover:text-white/60 transition-colors" />
        }
      </button>

      {!expanded && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {feedback.knowledgeUnits.slice(0, 4).map((ku, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[ku.type] ?? TYPE_COLORS.FACT}`}
            >
              {ku.type}
            </span>
          ))}
          {feedback.knowledgeUnits.length > 4 && (
            <span className="text-xs text-white/40">+{feedback.knowledgeUnits.length - 4} more</span>
          )}
          {feedback.emotionalSignals.emotions.slice(0, 2).map((e, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-pink-500/10 text-pink-300 border border-pink-500/30">
              {e}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-4">

          {/* Knowledge units */}
          {feedback.knowledgeUnits.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wide mb-2">What was extracted</p>
              <div className="space-y-2">
                {feedback.knowledgeUnits.map((ku, i) => (
                  <div key={i} className="bg-white/5 rounded p-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[ku.type] ?? TYPE_COLORS.FACT}`}>
                        {ku.type}
                      </span>
                      <span className="text-xs text-white/40">
                        {Math.round(ku.confidence * 100)}% confidence
                      </span>
                      {ku.temporalScope !== 'UNKNOWN' && (
                        <span className="flex items-center gap-1 text-xs text-white/30">
                          <Clock className="h-3 w-3" />
                          {ku.temporalScope}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/75 leading-relaxed">{ku.content}</p>
                    {ku.certaintySource && (
                      <p className="text-xs text-white/30 italic">{ku.certaintySource}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emotional signals */}
          {feedback.emotionalSignals.emotions.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wide mb-2">Emotional signals</p>
              <div className="flex items-center gap-2 flex-wrap">
                {feedback.emotionalSignals.emotions.map((e, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-pink-500/10 text-pink-300 border border-pink-500/30">
                    {e}
                  </span>
                ))}
                {feedback.emotionalSignals.intensity && (
                  <span className={`flex items-center gap-1 text-xs font-medium ${INTENSITY_COLORS[feedback.emotionalSignals.intensity]}`}>
                    <Zap className="h-3 w-3" />
                    {feedback.emotionalSignals.intensity} intensity
                  </span>
                )}
                {feedback.emotionalSignals.isVenting && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    venting
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Entities detected */}
          {feedback.entitiesDetected.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wide mb-2">People & places mentioned</p>
              <div className="flex items-center gap-2 flex-wrap">
                {feedback.entitiesDetected.map((ent, i) => (
                  <span key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-white/5 text-white/60 border border-white/10">
                    <User className="h-3 w-3" />
                    {ent.name}
                    <span className="text-white/30">·{ent.type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Temporal anchor */}
          {feedback.temporalAnchor.detected && (
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-primary/50" />
              <span className="text-xs text-white/50">
                Time anchored
                {feedback.temporalAnchor.precision ? ` · ${feedback.temporalAnchor.precision}` : ''}
                {feedback.temporalAnchor.confidence != null
                  ? ` (${Math.round(feedback.temporalAnchor.confidence * 100)}%)`
                  : ''}
              </span>
            </div>
          )}

          {/* Contradictions */}
          {feedback.contradictionsDetected.length > 0 && (
            <div>
              <p className="text-xs text-amber-400/80 uppercase tracking-wide mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Conflicts detected
              </p>
              <div className="space-y-1">
                {feedback.contradictionsDetected.map((c, i) => (
                  <p key={i} className="text-xs text-amber-300/70 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                    {c.description}
                  </p>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-white/20">
            Processed in {feedback.processingTimeMs}ms
          </p>
        </div>
      )}
    </div>
  );
};

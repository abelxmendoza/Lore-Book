import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { knowledgeApi, KNOWLEDGE_TYPE_LABELS, KNOWLEDGE_TYPE_COLORS } from '../../../api/knowledge';
import type { KnowledgeClaim } from '../../../api/knowledge';
import { useNavigate } from 'react-router-dom';

const MAX_VISIBLE = 4;

const confidenceColor = (v: number) =>
  v >= 0.75 ? 'text-green-400' : v >= 0.5 ? 'text-yellow-400' : 'text-orange-400';

export const WhatLoreBookKnows = () => {
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    knowledgeApi
      .getClaims({ status: 'ACTIVE', min_confidence: 0.6, include_evidence: false })
      .then(res => {
        if (res.success) {
          const loaded = res.claims.slice(0, 10);
          setClaims(loaded);
          // Auto-open for users with few claims — they need to see the evidence forming.
          // Users with many claims have already discovered the panel; collapsed default is fine.
          if (loaded.length > 0 && loaded.length <= 3) {
            setPanelOpen(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (claims.length === 0) return null;

  const visible = expanded ? claims : claims.slice(0, MAX_VISIBLE);

  return (
    <div className="mx-4 mb-1">
      {/* Collapsed trigger */}
      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors py-1"
        >
          <Brain className="h-3 w-3" />
          <span>{claims.length} thing{claims.length !== 1 ? 's' : ''} forming in your record</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-500/15">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">What LoreBook Knows</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/perceptions')}
                className="text-[10px] text-indigo-400/60 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                title="View all in Perceptions"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                View all
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-indigo-400/50 hover:text-indigo-300 transition-colors ml-1"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Claims list */}
          <div className="px-3 py-2 space-y-1.5">
            {visible.map(claim => (
              <div key={claim.id} className="flex items-start gap-2.5">
                <span className={`text-[10px] font-bold tabular-nums mt-0.5 w-7 flex-shrink-0 ${confidenceColor(claim.confidence)}`}>
                  {Math.round(claim.confidence * 100)}%
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 leading-snug">{claim.human_readable_claim}</p>
                  <span className={`text-[9px] mt-0.5 inline-block px-1 py-0 rounded border ${KNOWLEDGE_TYPE_COLORS[claim.knowledge_type] ?? 'text-white/40 border-white/10'}`}>
                    {KNOWLEDGE_TYPE_LABELS[claim.knowledge_type] ?? claim.knowledge_type}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Expand / collapse */}
          {claims.length > MAX_VISIBLE && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="w-full text-center text-[10px] text-indigo-400/50 hover:text-indigo-300 py-1.5 border-t border-indigo-500/15 transition-colors"
            >
              {expanded ? `Show less` : `+${claims.length - MAX_VISIBLE} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

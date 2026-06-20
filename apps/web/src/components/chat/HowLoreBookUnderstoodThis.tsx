import { useState, useCallback, useMemo } from 'react';
import { Brain, ChevronDown, ChevronRight, RefreshCw, FileCode2, AlertTriangle } from 'lucide-react';
import { getLoreAgentTrace, type LoreAgentTrace } from '../../api/loreAgents';
import { buildDemoLoreAgentTrace } from '../../lib/demoAgentTrace';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import { LoreEntityLegend } from '../lore/LoreEntityLegend';
import { loreKindForChip, type LoreEntityKind } from '../../lib/loreEntities';
import type { EntityChip } from '../../features/chat/message/EntityChipsRow';
import { compileChatLoreContext, toMessageMentionedEntities } from '../../lib/chatLoreContext';
import { DEMO_ENTITY_FALLBACKS } from '../../lib/demoEntityFallbacks';

interface Props {
  /** The user message id the agents observed. */
  messageId: string;
  visible: boolean;
  messageContent?: string;
  mentionedEntities?: EntityChip[];
}

const ROUTE_LABELS: Record<string, string> = {
  memory_review_queue: 'Memory Review Queue',
  entity_authority: 'Entity Authority',
  correction_authority: 'Correction Authority',
  none: 'Informational',
};

const AGENT_COLORS: Record<string, string> = {
  MemoryAgent: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  IdentityAgent: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  ContradictionAgent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  NarrativeAgent: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  SystemAgent: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
};

/**
 * "How LoreBook Understood This" — developer/admin panel that surfaces the
 * System Cognition / Agent Layer output for a single message: pipeline stages,
 * agents triggered, observations, proposed actions, confidence, and evidence.
 */
export const HowLoreBookUnderstoodThis = ({
  messageId,
  visible,
  messageContent,
  mentionedEntities,
}: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [trace, setTrace] = useState<LoreAgentTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoMode = shouldUseMockData();

  const activeKinds = useMemo((): LoreEntityKind[] => {
    const kinds = new Set<LoreEntityKind>();
    const source =
      mentionedEntities ??
      (messageContent
        ? toMessageMentionedEntities(
            compileChatLoreContext(messageContent, { fallbackEntities: DEMO_ENTITY_FALLBACKS }).entities,
          )
        : []);
    for (const entity of source) {
      kinds.add(loreKindForChip(entity));
    }
    return [...kinds];
  }, [mentionedEntities, messageContent]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (demoMode && messageContent) {
        setTrace(buildDemoLoreAgentTrace(messageId, messageContent, mentionedEntities));
        return;
      }
      setTrace(await getLoreAgentTrace(messageId));
    } catch {
      if (demoMode && messageContent) {
        setTrace(buildDemoLoreAgentTrace(messageId, messageContent, mentionedEntities));
      } else {
        setError('Could not load agent trace.');
      }
    } finally {
      setLoading(false);
    }
  }, [demoMode, messageContent, mentionedEntities, messageId]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !trace && !loading) void load();
  };

  if (!visible) return null;

  const agentName = (name: string) => (
    <span className={`px-1.5 py-0.5 rounded text-[11px] border font-medium ${AGENT_COLORS[name] ?? 'text-white/50 border-white/10 bg-white/5'}`}>
      {name}
    </span>
  );

  return (
    <div className="mt-2 border border-white/5 rounded-lg bg-black/20 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-3 w-3 text-white/30" />
          <span className="text-xs text-white/40 font-medium">How LoreBook understood this</span>
          {demoMode && (
            <span className="text-[10px] text-cyan-300/50 border border-cyan-500/20 rounded px-1">demo</span>
          )}
          {trace && (
            <span className="text-[11px] text-white/30">
              {trace.runs.length} agent{trace.runs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3 w-3 text-white/20" /> : <ChevronRight className="h-3 w-3 text-white/20" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-2">
          {loading && <p className="text-xs text-white/30">Loading agent trace…</p>}
          {error && <p className="text-xs text-red-400/70">{error}</p>}

          {trace && !loading && (
            <>
              {trace.enabled === false && (
                <p className="text-[11px] text-amber-300/70">
                  Agent layer is disabled (ENABLE_LORE_AGENTS=false). Showing any prior trace.
                </p>
              )}

              {demoMode && trace.pipeline?.factuality === 'simulated' && (
                <p className="text-[11px] text-cyan-200/60">
                  Demo simulation — lexical entity resolution and agent proposals without server calls.
                </p>
              )}

              {activeKinds.length > 0 && (
                <LoreEntityLegend
                  compact
                  title="Entity types in this message"
                  activeKinds={activeKinds}
                  className="border-white/8 bg-black/30"
                />
              )}

              {/* Pipeline stages */}
              {trace.pipeline?.phases?.length ? (
                <div>
                  <p className="text-[11px] text-white/30 uppercase tracking-wide mb-1">Pipeline</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {trace.pipeline.phases.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded text-[11px] bg-white/5 text-white/50 border border-white/10">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Agents triggered */}
              {trace.runs.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/30 uppercase tracking-wide mb-1">Agents triggered</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {trace.runs.map((r) => (
                      <span key={r.run_id + r.agent_name} className="flex items-center gap-1">
                        {agentName(r.agent_name)}
                        {typeof r.confidence === 'number' && (
                          <span className="text-[10px] text-white/30">{Math.round(r.confidence * 100)}%</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Observations */}
              {trace.observations.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/30 uppercase tracking-wide mb-1">Observations</p>
                  <ul className="space-y-1">
                    {trace.observations.map((o, i) => (
                      <li key={i} className="text-[11px] text-white/50 leading-relaxed">
                        {agentName(o.agent_name)} <span className="text-white/70">{o.summary}</span>
                        {o.evidence?.[0]?.sourceFile && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-white/25">
                            <FileCode2 className="h-2.5 w-2.5" />
                            {o.evidence[0].sourceFile.split('/').slice(-1)[0]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Proposed actions */}
              {trace.proposedActions.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/30 uppercase tracking-wide mb-1">Proposed actions (require confirmation)</p>
                  <ul className="space-y-1">
                    {trace.proposedActions.map((a, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-[11px]">
                        {agentName(a.agent_name)}
                        <span className="text-white/70 font-mono">{a.action_type}</span>
                        {a.routed_to && (
                          <span className="text-white/30">→ {ROUTE_LABELS[a.routed_to] ?? a.routed_to}</span>
                        )}
                        {typeof a.confidence === 'number' && (
                          <span className="text-white/30">· {Math.round(a.confidence * 100)}%</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {trace.runs.some((r) => (r.warnings?.length ?? 0) > 0) && (
                <div>
                  <p className="text-[11px] text-white/30 uppercase tracking-wide mb-1">Warnings</p>
                  <ul className="space-y-1">
                    {trace.runs.flatMap((r) => (r.warnings ?? []).map((w, i) => (
                      <li key={r.agent_name + i} className="flex items-center gap-1 text-[11px] text-amber-300/70">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {w.message}
                      </li>
                    )))}
                  </ul>
                </div>
              )}

              {trace.runs.length === 0 && (
                <p className="text-xs text-white/30">No agent activity recorded for this message.</p>
              )}

              <button
                onClick={() => void load()}
                className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
              >
                <RefreshCw className="h-2.5 w-2.5" /> Refresh
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

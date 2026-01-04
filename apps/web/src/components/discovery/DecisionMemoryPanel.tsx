/**
 * Decision Memory Panel
 * Where Lore-Keeper stops feeling like "AI" and starts feeling like your past self
 */

import { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Heart,
  Briefcase,
  DollarSign,
  Palette,
  Users,
  User,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Plus
} from 'lucide-react';
import { useDecisionMemory, type DecisionSummary, type DecisionType, type OutcomeSentiment } from '../../hooks/useDecisionMemory';

const DecisionTypeIcon = ({ type }: { type: DecisionType }) => {
  const icons = {
    RELATIONSHIP: Heart,
    CAREER: Briefcase,
    HEALTH: AlertCircle,
    FINANCIAL: DollarSign,
    CREATIVE: Palette,
    SOCIAL: Users,
    PERSONAL: User,
    OTHER: MoreHorizontal,
  };
  const Icon = icons[type] || MoreHorizontal;
  return <Icon className="h-4 w-4" />;
};

const SentimentBadge = ({ sentiment }: { sentiment?: OutcomeSentiment }) => {
  if (!sentiment) return null;

  const colors = {
    POSITIVE: 'bg-green-500/20 text-green-400 border-green-500/50',
    NEGATIVE: 'bg-red-500/20 text-red-400 border-red-500/50',
    MIXED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    UNCLEAR: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[sentiment]}`}>
      {sentiment}
    </span>
  );
};

const DecisionCard = ({ summary, onOutcomeRecord }: { summary: DecisionSummary; onOutcomeRecord: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [outcomeText, setOutcomeText] = useState('');
  const [outcomeSentiment, setOutcomeSentiment] = useState<OutcomeSentiment>('UNCLEAR');
  const [recording, setRecording] = useState(false);
  const { recordOutcome } = useDecisionMemory();

  const handleRecordOutcome = async () => {
    if (!outcomeText.trim()) return;
    setRecording(true);
    try {
      await recordOutcome(summary.decision.id, {
        outcome_text: outcomeText,
        sentiment: outcomeSentiment,
      });
      setOutcomeText('');
      setShowOutcomeForm(false);
      onOutcomeRecord();
    } catch (error) {
      console.error('Failed to record outcome:', error);
    } finally {
      setRecording(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <DecisionTypeIcon type={summary.decision.decision_type} />
            <span className="text-xs text-white/60">{summary.decision.decision_type}</span>
            <span className="text-xs text-white/40">•</span>
            <span className="text-xs text-white/60">{formatDate(summary.decision.created_at)}</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">{summary.decision.title}</h3>
          <p className="text-sm text-white/80 leading-relaxed">{summary.decision.description}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-white/70" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white/70" />
          )}
        </button>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1 text-white/60">
          <CheckCircle2 className="h-4 w-4" />
          <span>{summary.options.length} {summary.options.length === 1 ? 'option' : 'options'}</span>
        </div>
        {summary.outcomes.length > 0 && (
          <div className="flex items-center gap-1 text-white/60">
            <Clock className="h-4 w-4" />
            <span>{summary.outcomes.length} {summary.outcomes.length === 1 ? 'outcome' : 'outcomes'}</span>
          </div>
        )}
        {summary.decision.uncertainty_notes && (
          <div className="flex items-center gap-1 text-yellow-400">
            <AlertCircle className="h-4 w-4" />
            <span>Uncertainty noted</span>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="space-y-4 pt-4 border-t border-white/10">
          {/* Options */}
          {summary.options.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Options Considered</h4>
              <div className="space-y-2">
                {summary.options.map((option) => (
                  <div key={option.id} className="bg-white/5 rounded p-3">
                    <p className="text-sm text-white/90 mb-2">{option.option_text}</p>
                    {option.perceived_risks && (
                      <div className="text-xs text-red-400 mb-1">
                        <strong>Risks:</strong> {option.perceived_risks}
                      </div>
                    )}
                    {option.perceived_rewards && (
                      <div className="text-xs text-green-400">
                        <strong>Rewards:</strong> {option.perceived_rewards}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rationale */}
          {summary.rationale && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Reasoning</h4>
              <p className="text-sm text-white/80 mb-3">{summary.rationale.reasoning}</p>
              
              {summary.rationale.values_considered && summary.rationale.values_considered.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-white/60">Values: </span>
                  <span className="text-xs text-white/80">
                    {summary.rationale.values_considered.join(', ')}
                  </span>
                </div>
              )}
              
              {summary.rationale.emotions_present && summary.rationale.emotions_present.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-white/60">Emotions: </span>
                  <span className="text-xs text-white/80">
                    {summary.rationale.emotions_present.join(', ')}
                  </span>
                </div>
              )}
              
              {summary.rationale.constraints && summary.rationale.constraints.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-white/60">Constraints: </span>
                  <span className="text-xs text-white/80">
                    {summary.rationale.constraints.join(', ')}
                  </span>
                </div>
              )}
              
              {summary.rationale.known_unknowns && (
                <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <span className="text-xs font-medium text-yellow-400">Known Unknowns:</span>
                  <p className="text-xs text-white/80 mt-1">{summary.rationale.known_unknowns}</p>
                </div>
              )}
            </div>
          )}

          {/* Outcomes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">Outcomes</h4>
              {!showOutcomeForm && (
                <button
                  onClick={() => setShowOutcomeForm(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/20 text-primary border border-primary/50 rounded hover:bg-primary/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add Outcome
                </button>
              )}
            </div>

            {showOutcomeForm && (
              <div className="bg-white/5 border border-white/10 rounded p-3 mb-3 space-y-2">
                <textarea
                  value={outcomeText}
                  onChange={(e) => setOutcomeText(e.target.value)}
                  placeholder="What happened as a result of this decision?"
                  className="w-full bg-white/5 border border-white/10 rounded p-2 text-white text-sm resize-none"
                  rows={3}
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-white/60">Sentiment:</label>
                  <select
                    value={outcomeSentiment}
                    onChange={(e) => setOutcomeSentiment(e.target.value as OutcomeSentiment)}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="UNCLEAR">Unclear</option>
                    <option value="POSITIVE">Positive</option>
                    <option value="NEGATIVE">Negative</option>
                    <option value="MIXED">Mixed</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRecordOutcome}
                    disabled={!outcomeText.trim() || recording}
                    className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {recording ? 'Recording...' : 'Record Outcome'}
                  </button>
                  <button
                    onClick={() => {
                      setShowOutcomeForm(false);
                      setOutcomeText('');
                    }}
                    className="px-3 py-1 bg-white/10 text-white rounded text-xs hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {summary.outcomes.length > 0 ? (
              <div className="space-y-2">
                {summary.outcomes.map((outcome) => (
                  <div key={outcome.id} className="bg-white/5 rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <SentimentBadge sentiment={outcome.sentiment} />
                      <span className="text-xs text-white/60">
                        {formatDate(outcome.recorded_at)}
                      </span>
                    </div>
                    <p className="text-sm text-white/80">{outcome.outcome_text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40 italic">No outcomes recorded yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const DecisionMemoryPanel = () => {
  const { decisions, loading, error, refetch } = useDecisionMemory({ limit: 20 });

  // Group by decision type
  const grouped = decisions.reduce((acc, summary) => {
    const type = summary.decision.decision_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(summary);
    return acc;
  }, {} as Record<DecisionType, DecisionSummary[]>);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-white/60">Loading decisions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load decisions</p>
        <p className="text-sm text-white/60 mb-4">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
        <Clock className="h-12 w-12 mx-auto mb-4 text-white/40" />
        <p className="text-white/60 mb-2">No decisions recorded yet</p>
        <p className="text-sm text-white/40">
          Decisions you make will appear here, preserving the context, options, and reasoning from that moment in time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Decision Memory</h3>
            <p className="text-sm text-white/70">
              These are snapshots of decisions you've made, preserving the context, options, and reasoning 
              from that moment. No decision is labeled "right" or "wrong" — they're just records of your past self.
            </p>
          </div>
        </div>
      </div>

      {/* Decisions List - Grouped by Type */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([type, summaries]) => (
          <div key={type}>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <DecisionTypeIcon type={type as DecisionType} />
              {type} ({summaries.length})
            </h3>
            <div className="space-y-3">
              {summaries.map((summary) => (
                <DecisionCard key={summary.decision.id} summary={summary} onOutcomeRecord={refetch} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


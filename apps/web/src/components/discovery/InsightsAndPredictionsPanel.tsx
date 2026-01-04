/**
 * Insights & Predictions Panel
 * Read-only observations with dismiss functionality
 * Immediate perceived intelligence, zero risk (no writes)
 */

import { useState } from 'react';
import { 
  Sparkles, 
  TrendingUp, 
  X,
  Info,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  useInsightsAndPredictions, 
  type Insight, 
  type Prediction,
  type InsightType,
  type PredictionType
} from '../../hooks/useInsightsAndPredictions';

const ConfidenceBar = ({ confidence }: { confidence: number }) => {
  const percentage = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right">{percentage}%</span>
    </div>
  );
};

const ProbabilityBar = ({ probability }: { probability: number }) => {
  const percentage = Math.round(probability * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right">{percentage}%</span>
    </div>
  );
};

const InsightTypeBadge = ({ type }: { type: InsightType }) => {
  const colors = {
    PATTERN: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    TREND: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    DIVERGENCE: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    SHIFT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    RECURRING_THEME: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[type] || colors.PATTERN}`}>
      {type.replace('_', ' ')}
    </span>
  );
};

const PredictionTypeBadge = ({ type }: { type: PredictionType }) => {
  const colors = {
    BEHAVIORAL: 'bg-green-500/20 text-green-400 border-green-500/50',
    RELATIONAL: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
    CAREER: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    EMOTIONAL: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    DECISION_OUTCOME: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    PATTERN_CONTINUATION: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[type] || colors.BEHAVIORAL}`}>
      {type.replace('_', ' ')}
    </span>
  );
};

const InsightCard = ({ insight, onDismiss, onExplain }: { 
  insight: Insight; 
  onDismiss: (id: string) => Promise<void>;
  onExplain: (id: string) => Promise<any>;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss(insight.id);
    } catch (error) {
      console.error('Failed to dismiss insight:', error);
    } finally {
      setDismissing(false);
    }
  };

  const handleExplain = async () => {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }
    setLoadingExplanation(true);
    try {
      const exp = await onExplain(insight.id);
      setExplanation(exp);
      setExpanded(true);
    } catch (error) {
      console.error('Failed to explain insight:', error);
    } finally {
      setLoadingExplanation(false);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <InsightTypeBadge type={insight.type} />
            <ConfidenceBar confidence={insight.confidence} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{insight.title}</h3>
          <p className="text-sm text-white/80 leading-relaxed">{insight.description}</p>
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

      {expanded && (
        <div className="pt-3 border-t border-white/10 space-y-2">
          {explanation ? (
            <>
              {explanation.evidence && explanation.evidence.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-white/60 mb-1">Evidence</h4>
                  <div className="space-y-1">
                    {explanation.evidence.map((ev: any, idx: number) => (
                      <p key={idx} className="text-xs text-white/70 ml-2">• {ev.explanation}</p>
                    ))}
                  </div>
                </div>
              )}
              {explanation.disclaimer && (
                <p className="text-xs text-yellow-400 italic">{explanation.disclaimer}</p>
              )}
            </>
          ) : loadingExplanation ? (
            <p className="text-xs text-white/60">Loading explanation...</p>
          ) : (
            <button
              onClick={handleExplain}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Show evidence
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="flex items-center gap-1 px-3 py-1 bg-white/10 text-white rounded text-xs hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <EyeOff className="h-3 w-3" />
          {dismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
        {!explanation && (
          <button
            onClick={handleExplain}
            disabled={loadingExplanation}
            className="flex items-center gap-1 px-3 py-1 bg-primary/20 text-primary border border-primary/50 rounded text-xs hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye className="h-3 w-3" />
            {loadingExplanation ? 'Loading...' : 'Why am I seeing this?'}
          </button>
        )}
      </div>
    </div>
  );
};

const PredictionCard = ({ prediction, onDismiss, onExplain }: { 
  prediction: Prediction; 
  onDismiss: (id: string) => Promise<void>;
  onExplain: (id: string) => Promise<any>;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss(prediction.id);
    } catch (error) {
      console.error('Failed to dismiss prediction:', error);
    } finally {
      setDismissing(false);
    }
  };

  const handleExplain = async () => {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }
    setLoadingExplanation(true);
    try {
      const exp = await onExplain(prediction.id);
      setExplanation(exp);
      setExpanded(true);
    } catch (error) {
      console.error('Failed to explain prediction:', error);
    } finally {
      setLoadingExplanation(false);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <PredictionTypeBadge type={prediction.prediction_type} />
            <ProbabilityBar probability={prediction.probability} />
            <span className="text-xs text-white/60">({prediction.time_horizon})</span>
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{prediction.title}</h3>
          <p className="text-sm text-white/80 leading-relaxed">{prediction.description}</p>
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

      {expanded && (
        <div className="pt-3 border-t border-white/10 space-y-2">
          {explanation ? (
            <>
              {explanation.evidence && explanation.evidence.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-white/60 mb-1">Evidence</h4>
                  <div className="space-y-1">
                    {explanation.evidence.map((ev: any, idx: number) => (
                      <p key={idx} className="text-xs text-white/70 ml-2">• {ev.explanation}</p>
                    ))}
                  </div>
                </div>
              )}
              {explanation.disclaimer && (
                <p className="text-xs text-yellow-400 italic">{explanation.disclaimer}</p>
              )}
            </>
          ) : loadingExplanation ? (
            <p className="text-xs text-white/60">Loading explanation...</p>
          ) : (
            <button
              onClick={handleExplain}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Show evidence
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="flex items-center gap-1 px-3 py-1 bg-white/10 text-white rounded text-xs hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <EyeOff className="h-3 w-3" />
          {dismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
        {!explanation && (
          <button
            onClick={handleExplain}
            disabled={loadingExplanation}
            className="flex items-center gap-1 px-3 py-1 bg-primary/20 text-primary border border-primary/50 rounded text-xs hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye className="h-3 w-3" />
            {loadingExplanation ? 'Loading...' : 'Why am I seeing this?'}
          </button>
        )}
      </div>
    </div>
  );
};

export const InsightsAndPredictionsPanel = () => {
  const { insights, predictions, loading, error, refetch, dismissInsight, dismissPrediction, explainInsight, explainPrediction } = useInsightsAndPredictions();

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-white/60">Loading insights and predictions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Info className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load</p>
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

  const hasContent = insights.length > 0 || predictions.length > 0;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Insights & Predictions</h3>
            <p className="text-sm text-white/70">
              These are observations and probabilistic projections based on your patterns. 
              They are <strong>not facts</strong> and never write to memory. You can dismiss any that don't resonate.
            </p>
          </div>
        </div>
      </div>

      {!hasContent ? (
        <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p className="text-white/60 mb-2">No insights or predictions yet</p>
          <p className="text-sm text-white/40">
            Insights and predictions will appear here as patterns are detected in your memory.
          </p>
        </div>
      ) : (
        <>
          {/* Insights */}
          {insights.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                Insights ({insights.length})
              </h3>
              <div className="space-y-3">
                {insights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onDismiss={dismissInsight}
                    onExplain={explainInsight}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Predictions */}
          {predictions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-400" />
                Predictions ({predictions.length})
              </h3>
              <div className="space-y-3">
                {predictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.id}
                    prediction={prediction}
                    onDismiss={dismissPrediction}
                    onExplain={explainPrediction}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, Eye, HelpCircle, Loader2, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { reactionApi } from '../../api/reactions';
import { perceptionReactionEngineApi } from '../../api/perceptionReactionEngine';
import type { ReactionPatterns } from '../../types/reaction';
import type { PatternInsight, StabilityMetrics } from '../../api/perceptionReactionEngine';

/**
 * Reflective View (Therapist Mode)
 * 
 * Shows patterns, not advice.
 * Asks questions, never asserts conclusions.
 */
export const ReflectiveView: React.FC = () => {
  const [patterns, setPatterns] = useState<ReactionPatterns | null>(null);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [stabilityMetrics, setStabilityMetrics] = useState<StabilityMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [patternData, insightData, stabilityData] = await Promise.all([
        reactionApi.getReactionPatterns(),
        perceptionReactionEngineApi.getPatterns(),
        perceptionReactionEngineApi.getStabilityMetrics()
      ]);
      setPatterns(patternData);
      setInsights(insightData);
      setStabilityMetrics(stabilityData);
    } catch (error) {
      console.error('Failed to load reflective data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patterns && insights.length === 0 && !stabilityMetrics) {
    return (
      <div className="text-center py-12 text-white/60">
        <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">No reaction patterns yet</p>
        <p className="text-sm">Add reactions to memories and perceptions to see patterns emerge.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Common Patterns */}
      {patterns && patterns.commonPatterns.length > 0 && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Common Patterns
            </h3>
            <p className="text-sm text-white/60 mt-1">
              These patterns appear frequently. What do you notice?
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.commonPatterns.map((pattern, idx) => (
              <div
                key={idx}
                className="bg-black/40 border border-border/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {pattern.trigger_type === 'memory' ? 'Memory' : 'Perception'} → {pattern.reaction_label}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {pattern.count} {pattern.count === 1 ? 'time' : 'times'}
                    </Badge>
                  </div>
                  {pattern.avg_intensity > 0 && (
                    <span className="text-xs text-white/50">
                      Avg intensity: {Math.round(pattern.avg_intensity * 100)}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/60 italic">
                  {pattern.trigger_type === 'memory' ? (
                    <>This reaction appears when you experience something. Does this feel accurate?</>
                  ) : (
                    <>This reaction appears when you believe or hear something. What do you notice about this pattern?</>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Reaction Types Distribution */}
      {patterns && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Reaction Types
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(patterns.byType).map(([type, count]) => (
                <div key={type} className="text-center">
                  <div className="text-2xl font-bold text-white">{count}</div>
                  <div className="text-xs text-white/60 capitalize">{type}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Reactions */}
      {patterns && Object.keys(patterns.byLabel).length > 0 && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Most Common Reactions
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(patterns.byLabel)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([label, count]) => (
                  <div key={label} className="flex items-center justify-between p-2 bg-black/40 rounded">
                    <span className="text-sm text-white capitalize">{label}</span>
                    <div className="flex items-center gap-3">
                      {patterns.intensityAverages[label] && (
                        <span className="text-xs text-white/50">
                          Avg: {Math.round(patterns.intensityAverages[label] * 100)}%
                        </span>
                      )}
                      <span className="text-xs text-white/70">{count} {count === 1 ? 'time' : 'times'}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Engine Insights - Pattern Detection */}
      {insights.length > 0 && (
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-400" />
              Pattern Insights
            </h3>
            <p className="text-sm text-white/60 mt-1">
              Patterns detected in your perceptions and reactions. Questions, not conclusions.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className="bg-black/40 border border-blue-500/30 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-white/90 mb-1">{insight.description}</p>
                    <p className="text-sm text-blue-300 font-medium italic">
                      {insight.question}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs ml-2">
                    {Math.round(insight.confidence * 100)}% confidence
                  </Badge>
                </div>
                {insight.data.avg_intensity && (
                  <p className="text-xs text-white/50 mt-2">
                    Avg intensity: {Math.round(insight.data.avg_intensity * 100)}%
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stability Metrics - Resilience Focus */}
      {stabilityMetrics && (
        <Card className="bg-green-500/10 border-green-500/30">
          <CardHeader>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Stability & Resilience
            </h3>
            <p className="text-sm text-white/60 mt-1">
              Focus on recovery and resilience, not emotion
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {stabilityMetrics.avg_recovery_time_minutes !== null && (
              <div>
                <div className="text-sm text-white/70 mb-1">Average Recovery Time</div>
                <div className="text-2xl font-bold text-white">
                  {Math.floor(stabilityMetrics.avg_recovery_time_minutes / 60)}h{' '}
                  {stabilityMetrics.avg_recovery_time_minutes % 60}m
                </div>
                {stabilityMetrics.recovery_trend !== 'unknown' && (
                  <div className="text-xs text-white/50 mt-1">
                    Trend: {stabilityMetrics.recovery_trend}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-white/70 mb-1">Recurrence Rate</div>
                <div className="text-xl font-bold text-white">
                  {Math.round(stabilityMetrics.recurrence_rate * 100)}%
                </div>
                <div className="text-xs text-white/50 mt-1">
                  {stabilityMetrics.recurrence_rate < 0.3 ? 'Low recurrence' : 'Some recurrence'}
                </div>
              </div>

              {stabilityMetrics.resilience_score !== null && (
                <div>
                  <div className="text-sm text-white/70 mb-1">Resilience</div>
                  <div className="text-xl font-bold text-white">
                    {Math.round(stabilityMetrics.resilience_score * 100)}%
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Based on recovery time and recurrence
                  </div>
                </div>
              )}
            </div>

            {stabilityMetrics.intensity_trend !== 'unknown' && (
              <div>
                <div className="text-sm text-white/70 mb-1">Intensity Trend</div>
                <div className="text-lg font-semibold text-white capitalize">
                  {stabilityMetrics.intensity_trend}
                </div>
                <div className="text-xs text-white/50 mt-1">
                  {stabilityMetrics.intensity_trend === 'decreasing' && 'Reactions becoming less intense over time'}
                  {stabilityMetrics.intensity_trend === 'stable' && 'Reaction intensity remains consistent'}
                  {stabilityMetrics.intensity_trend === 'increasing' && 'Reaction intensity increasing - what do you notice?'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Questions Section */}
      <Card className="bg-purple-500/10 border-purple-500/30">
        <CardHeader>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-purple-400" />
            Questions to Consider
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-white/80 space-y-2">
            {insights.length > 0 && (
              <p>
                • {insights[0].question}
              </p>
            )}
            {stabilityMetrics && stabilityMetrics.recovery_trend === 'improving' && (
              <p>
                • Your recovery times are improving. What's changed?
              </p>
            )}
            {stabilityMetrics && stabilityMetrics.recurrence_rate > 0.5 && (
              <p>
                • Some reactions recur. What patterns do you notice?
              </p>
            )}
            {patterns && patterns.commonPatterns.length > 0 && (
              <p>
                • This perception triggered {patterns.commonPatterns[0].reaction_label} {patterns.commonPatterns[0].count} times. 
                Does that feel accurate?
              </p>
            )}
            <p>
              • How have your coping responses changed over time? What do you notice?
            </p>
            <p>
              • Are there patterns you'd like to explore further?
            </p>
            <p className="text-xs text-white/50 italic mt-3 pt-3 border-t border-purple-500/20">
              Remember: These are patterns, not diagnoses. Your reactions are valid responses, not character flaws.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

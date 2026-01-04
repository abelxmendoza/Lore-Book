import React, { useState, useEffect } from 'react';
import { HeartPulse, TrendingUp, AlertTriangle, Eye, HelpCircle, Loader2, Brain, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MetricCard } from './MetricCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { reactionApi } from '../../api/reactions';
import { perceptionReactionEngineApi } from '../../api/perceptionReactionEngine';
import type { ReactionPatterns } from '../../types/reaction';
import type { PatternInsight, StabilityMetrics } from '../../api/perceptionReactionEngine';

/**
 * Reactions & Resilience Panel
 * 
 * Shows patterns in how you react to memories and perceptions.
 * Focuses on recovery, resilience, and therapeutic reflection.
 * 
 * Part of Discovery Hub - all insights in one place.
 */
export const ReactionsResiliencePanel: React.FC = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [patterns, setPatterns] = useState<ReactionPatterns | null>(null);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [stabilityMetrics, setStabilityMetrics] = useState<StabilityMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, [isMockDataEnabled]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [patternData, insightData, stabilityData] = await Promise.all([
        reactionApi.getReactionPatterns().catch(() => null),
        perceptionReactionEngineApi.getPatterns().catch(() => []),
        perceptionReactionEngineApi.getStabilityMetrics().catch(() => null)
      ]);

      // Use mock data if API calls fail or return empty
      const mockPatterns: ReactionPatterns = {
        byTrigger: { 'memory-1': 3, 'perception-1': 5, 'memory-2': 2 },
        byLabel: { anxiety: 8, anger: 3, sadness: 4, avoidance: 5, rumination: 6 },
        byType: { emotional: 12, behavioral: 6, cognitive: 4, physical: 2 },
        intensityAverages: { anxiety: 0.7, anger: 0.8, sadness: 0.6, avoidance: 0.5, rumination: 0.75 },
        commonPatterns: [
          {
            trigger_type: 'perception',
            reaction_label: 'anxiety',
            count: 5,
            avg_intensity: 0.7
          },
          {
            trigger_type: 'memory',
            reaction_label: 'anger',
            count: 3,
            avg_intensity: 0.8
          },
          {
            trigger_type: 'perception',
            reaction_label: 'rumination',
            count: 4,
            avg_intensity: 0.75
          }
        ]
      };

      const mockInsights: PatternInsight[] = [
        {
          type: 'perception_reaction_loop',
          description: 'This belief about Sarah triggered 5 reactions',
          question: 'What do you notice about how this belief affected you?',
          data: {
            perception_count: 1,
            reaction_count: 5,
            avg_intensity: 0.7,
            confidence_levels: [0.4]
          },
          confidence: 0.8
        },
        {
          type: 'false_alarm',
          description: '3 low-confidence beliefs triggered strong reactions',
          question: 'What do you notice about beliefs you weren\'t sure about but still affected you strongly?',
          data: {
            perception_count: 3,
            reaction_count: 8,
            avg_intensity: 0.75,
            confidence_levels: [0.3, 0.35, 0.4]
          },
          confidence: 0.7
        },
        {
          type: 'regulation_trend',
          description: 'Your recovery times have decreased over time',
          question: 'What do you notice about how you\'ve been handling reactions differently?',
          data: {
            recovery_times: [120, 90, 75, 60, 45],
            time_span_days: 30
          },
          confidence: 0.7
        }
      ];

      const mockStabilityMetrics: StabilityMetrics = {
        avg_recovery_time_minutes: 75,
        recovery_trend: 'improving',
        recurrence_rate: 0.3,
        intensity_trend: 'decreasing',
        resilience_score: 0.72
      };

      // Only use mock data if toggle is enabled
      setPatterns(patternData || (isMockDataEnabled ? mockPatterns : { byTrigger: {}, byLabel: {}, byType: {}, intensityAverages: {}, commonPatterns: [] }));
      setInsights(insightData.length > 0 ? insightData : (isMockDataEnabled ? mockInsights : []));
      setStabilityMetrics(stabilityData || (isMockDataEnabled ? mockStabilityMetrics : { avg_recovery_time_minutes: 0, recovery_trend: 'stable', recurrence_rate: 0, intensity_trend: 'stable', resilience_score: 0 }));
    } catch (err) {
      console.error('Failed to load reactions data:', err);
      // Use mock data on error only if toggle is enabled
      const mockPatterns: ReactionPatterns = {
        byTrigger: { 'memory-1': 3, 'perception-1': 5, 'memory-2': 2 },
        byLabel: { anxiety: 8, anger: 3, sadness: 4, avoidance: 5, rumination: 6 },
        byType: { emotional: 12, behavioral: 6, cognitive: 4, physical: 2 },
        intensityAverages: { anxiety: 0.7, anger: 0.8, sadness: 0.6, avoidance: 0.5, rumination: 0.75 },
        commonPatterns: [
          {
            trigger_type: 'perception',
            reaction_label: 'anxiety',
            count: 5,
            avg_intensity: 0.7
          },
          {
            trigger_type: 'memory',
            reaction_label: 'anger',
            count: 3,
            avg_intensity: 0.8
          }
        ]
      };

      const mockInsights: PatternInsight[] = [
        {
          type: 'perception_reaction_loop',
          description: 'This belief about Sarah triggered 5 reactions',
          question: 'What do you notice about how this belief affected you?',
          data: {
            perception_count: 1,
            reaction_count: 5,
            avg_intensity: 0.7,
            confidence_levels: [0.4]
          },
          confidence: 0.8
        }
      ];

      const mockStabilityMetrics: StabilityMetrics = {
        avg_recovery_time_minutes: 75,
        recovery_trend: 'improving',
        recurrence_rate: 0.3,
        intensity_trend: 'decreasing',
        resilience_score: 0.72
      };

      if (isMockDataEnabled) {
        setPatterns(mockPatterns);
        setInsights(mockInsights);
        setStabilityMetrics(mockStabilityMetrics);
      } else {
        setPatterns({ byTrigger: {}, byLabel: {}, byType: {}, intensityAverages: {}, commonPatterns: [] });
        setInsights([]);
        setStabilityMetrics({ avg_recovery_time_minutes: 0, recovery_trend: 'stable', recurrence_rate: 0, intensity_trend: 'stable', resilience_score: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to Load Data"
        description={error}
      />
    );
  }

  const hasData = patterns || insights.length > 0 || stabilityMetrics;

  if (!hasData) {
    return (
      <EmptyState
        title="No Reaction Patterns Yet"
        description="Add reactions to memories and perceptions to see patterns emerge."
        icon={<Brain className="h-12 w-12 text-white/20" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-orange-900/30 border-purple-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <HeartPulse className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Reactions & Resilience</CardTitle>
              <CardDescription className="text-white/70">
                Patterns in how you respond to experiences and beliefs. Questions, not conclusions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics */}
      {stabilityMetrics && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Key Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stabilityMetrics.avg_recovery_time_minutes !== null && (
              <MetricCard
                label="Avg Recovery Time"
                value={`${Math.floor(stabilityMetrics.avg_recovery_time_minutes / 60)}h ${stabilityMetrics.avg_recovery_time_minutes % 60}m`}
              />
            )}
            <MetricCard
              label="Recurrence Rate"
              value={`${Math.round(stabilityMetrics.recurrence_rate * 100)}%`}
            />
            {stabilityMetrics.resilience_score !== null && (
              <MetricCard
                label="Resilience Score"
                value={`${Math.round(stabilityMetrics.resilience_score * 100)}%`}
              />
            )}
            {patterns && (
              <MetricCard
                label="Total Reactions"
                value={Object.values(patterns.byType).reduce((sum, count) => sum + count, 0)}
              />
            )}
          </div>
        </div>
      )}

      {/* Stability & Resilience Card */}
      {stabilityMetrics && (
        <Card className="bg-green-500/10 border-green-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-white">Stability & Resilience</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              Focus on recovery and resilience, not emotion
            </CardDescription>
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
                  <div className="text-xs text-white/50 mt-1 capitalize">
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

      {/* Pattern Insights */}
      {insights.length > 0 && (
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-white">Pattern Insights</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              Patterns detected in your perceptions and reactions. Questions, not conclusions.
            </CardDescription>
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

      {/* Common Patterns */}
      {patterns && patterns.commonPatterns.length > 0 && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Common Patterns</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              These patterns appear frequently. What do you notice?
            </CardDescription>
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
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Reaction Types</CardTitle>
            </div>
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
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Most Common Reactions</CardTitle>
            </div>
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

      {/* Questions to Consider */}
      <Card className="bg-purple-500/10 border-purple-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-purple-400" />
            <CardTitle className="text-white">Questions to Consider</CardTitle>
          </div>
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

import { useState, useEffect } from 'react';
import { getModuleByKey } from '../../config/analyticsModules';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { InsightCard } from './InsightCard';
import { AISummaryCard } from './AISummaryCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AlertCircle } from 'lucide-react';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import type { AnalyticsPayload } from '../../../server/src/services/analytics/types';

// Mock data for development
const MOCK_SHADOW_DATA: AnalyticsPayload = {
  metrics: {
    shadowArchetypes: 3,
    dominantShadow: 'The Perfectionist',
    shadowLoops: 5,
    shadowTriggers: 8,
    conflictScore: 0.65
  },
  metadata: {
    shadowArchetypes: [
      { name: 'The Perfectionist', confidence: 0.85, description: 'Suppressed need for control and flawlessness' },
      { name: 'The People Pleaser', confidence: 0.72, description: 'Hidden need for approval and fear of rejection' },
      { name: 'The Inner Critic', confidence: 0.68, description: 'Suppressed self-doubt and harsh self-judgment' }
    ],
    shadowLoops: [
      { pattern: 'Perfectionism → Burnout → Self-criticism', frequency: 12, strength: 0.8 },
      { pattern: 'People pleasing → Resentment → Withdrawal', frequency: 8, strength: 0.7 },
      { pattern: 'Self-doubt → Procrastination → Guilt', frequency: 6, strength: 0.65 }
    ],
    shadowTriggers: [
      { trigger: 'Work deadlines', impact: 0.9, frequency: 15 },
      { trigger: 'Social situations', impact: 0.75, frequency: 10 },
      { trigger: 'Creative projects', impact: 0.7, frequency: 8 }
    ],
    projection: {
      dominant_future: 'Continued perfectionism cycles unless addressed',
      risk_level: 'medium',
      trajectory: 'Stable but potentially escalating'
    }
  },
  insights: [
    { id: '1', text: 'Perfectionism appears most frequently in work-related entries, suggesting it\'s a primary shadow pattern', category: 'shadow', score: 0.85 },
    { id: '2', text: 'Shadow loops tend to intensify during high-stress periods (deadlines, conflicts)', category: 'pattern', score: 0.78 },
    { id: '3', text: 'The People Pleaser archetype shows up most in relationship entries', category: 'relationship', score: 0.72 }
  ],
  summary: 'Your shadow profile shows three dominant archetypes: The Perfectionist (strongest), The People Pleaser, and The Inner Critic. These patterns create recurring loops, especially around work deadlines and social situations. The shadow appears stable but could escalate if triggers increase.'
};

export const ShadowAnalyticsPanel = () => {
  const analyticsModule = getModuleByKey('shadow');
  const { data: realData, loading, error } = useAnalytics('shadow');
  const isMockDataEnabled = useShouldUseMockData();
  
  // Use mock data if toggle is on AND (no real data OR error)
  const shouldUseMockData = isMockDataEnabled && (!realData || error);

  if (!analyticsModule) {
    return (
      <EmptyState
        title="Module Not Found"
        description="The Shadow analytics module does not exist."
      />
    );
  }

  if (loading && !shouldUseMockData) {
    return <LoadingSkeleton />;
  }

  const data = shouldUseMockData ? MOCK_SHADOW_DATA : realData;

  if (!data) {
    return (
      <EmptyState
        title="Failed to Load Data"
        description={error || 'Unable to fetch analytics data. Please try again later.'}
      />
    );
  }

  const isMockData = shouldUseMockData;
  const metadata = data.metadata || {};
  const shadowArchetypes = Array.isArray(metadata.shadowArchetypes) ? metadata.shadowArchetypes : [];
  const shadowLoops = Array.isArray(metadata.shadowLoops) ? metadata.shadowLoops : [];
  const shadowTriggers = Array.isArray(metadata.shadowTriggers) ? metadata.shadowTriggers : [];
  const projection = metadata.projection || {};

  return (
    <div className="space-y-6">
      {/* Mock Data Banner */}
      {isMockData && (
        <div className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
          📊 Showing mock data for demonstration. Real shadow insights will appear as suppressed patterns are detected.
        </div>
      )}

      {/* Header */}
      <Card className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border-red-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Shadow Profile</CardTitle>
              <CardDescription className="text-white/70">
                Suppressed topics, negative loops, and inner archetypes
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Section */}
      {data.metrics && Object.keys(data.metrics).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Key Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              label="Shadow Archetypes"
              value={data.metrics.shadowArchetypes || 0}
            />
            <MetricCard
              label="Shadow Loops"
              value={data.metrics.shadowLoops || 0}
            />
            <MetricCard
              label="Shadow Triggers"
              value={data.metrics.shadowTriggers || 0}
            />
            {data.metrics.dominantShadow && (
              <MetricCard
                label="Dominant Shadow"
                value={data.metrics.dominantShadow}
              />
            )}
            {typeof data.metrics.conflictScore === 'number' && (
              <MetricCard
                label="Conflict Score"
                value={(data.metrics.conflictScore * 100).toFixed(0) + '%'}
              />
            )}
          </div>
        </div>
      )}

      {/* Shadow Archetypes */}
      {shadowArchetypes.length > 0 && (
        <Card className="bg-black/40 border-red-500/30">
          <CardHeader>
            <CardTitle className="text-white">Shadow Archetypes</CardTitle>
            <CardDescription className="text-white/60">
              Suppressed aspects of your personality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shadowArchetypes.map((archetype: any, index: number) => (
                <div key={index} className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-white">{archetype.name}</h4>
                    <span className="text-xs text-red-400">
                      {(archetype.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-white/70">{archetype.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shadow Loops */}
      {shadowLoops.length > 0 && (
        <Card className="bg-black/40 border-orange-500/30">
          <CardHeader>
            <CardTitle className="text-white">Shadow Loops</CardTitle>
            <CardDescription className="text-white/60">
              Recurring negative patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shadowLoops.map((loop: any, index: number) => (
                <div key={index} className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-white">{loop.pattern}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-orange-400">
                        {loop.frequency}x
                      </span>
                      <div className="w-16 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-orange-400 h-2 rounded-full"
                          style={{ width: `${loop.strength * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shadow Triggers */}
      {shadowTriggers.length > 0 && (
        <Card className="bg-black/40 border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-white">Shadow Triggers</CardTitle>
            <CardDescription className="text-white/60">
              What activates shadow patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shadowTriggers.map((trigger: any, index: number) => (
                <div key={index} className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-white">{trigger.trigger}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-yellow-400">
                        Impact: {(trigger.impact * 100).toFixed(0)}%
                      </span>
                      <span className="text-yellow-300">
                        {trigger.frequency}x
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projection */}
      {projection.dominant_future && (
        <Card className="bg-black/40 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-white">Shadow Projection</CardTitle>
            <CardDescription className="text-white/60">
              Where shadow patterns are heading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <p className="text-white mb-2">{projection.dominant_future}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-purple-400">
                    Risk: {projection.risk_level || 'unknown'}
                  </span>
                  <span className="text-purple-300">
                    Trajectory: {projection.trajectory || 'unknown'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights Section */}
      {data.insights && Array.isArray(data.insights) && data.insights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Insights</h3>
          <div className="space-y-3">
            {data.insights.map((insight, index) => {
              const insightText = typeof insight === 'string' ? insight : (insight?.text || '');
              const insightTitle = typeof insight === 'object' ? insight?.title : undefined;
              const insightCategory = typeof insight === 'object' ? insight?.category : undefined;
              const insightScore = typeof insight === 'object' ? insight?.score : undefined;

              return (
                <InsightCard
                  key={insight?.id || index}
                  title={insightTitle}
                  body={insightText}
                  category={insightCategory}
                  score={insightScore}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {data.summary && (
        <div>
          <AISummaryCard summary={data.summary} />
        </div>
      )}
    </div>
  );
};


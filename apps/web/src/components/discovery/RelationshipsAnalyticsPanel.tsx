import { useState, useEffect } from 'react';
import { getModuleByKey } from '../../config/analyticsModules';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { InsightCard } from './InsightCard';
import { AISummaryCard } from './AISummaryCard';
import { GraphVis } from './GraphVis';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Users } from 'lucide-react';
import { RelationshipSentimentTimeline } from './RelationshipSentimentTimeline';
import { RelationshipHeatmapCard } from './RelationshipHeatmapCard';
import { RelationshipArchetypeCard } from './RelationshipArchetypeCard';
import { AttachmentGravityCard } from './AttachmentGravityCard';
import { RelationshipForecastCard } from './RelationshipForecastCard';
import { ArcAppearanceCard } from './ArcAppearanceCard';
import { useMockData } from '../../contexts/MockDataContext';
import type { AnalyticsPayload } from '../../../server/src/services/analytics/types';

// Mock data for development/demo
const MOCK_RELATIONSHIPS_DATA: AnalyticsPayload = {
  metrics: {
    totalCharacters: 12,
    totalRelationships: 18,
    averageCloseness: 0.72,
    mostCentralCharacter: 'Sarah',
    activeRelationships: 8
  },
  graph: {
    nodes: [
      { id: 'you', label: 'You', group: 0, size: 20 },
      { id: 'sarah', label: 'Sarah', group: 1, size: 15 },
      { id: 'mike', label: 'Mike', group: 1, size: 12 },
      { id: 'emma', label: 'Emma', group: 2, size: 10 },
      { id: 'dad', label: 'Dad', group: 3, size: 14 },
      { id: 'mom', label: 'Mom', group: 3, size: 14 }
    ],
    edges: [
      { source: 'you', target: 'sarah', value: 0.9, label: 'Close Friend' },
      { source: 'you', target: 'mike', value: 0.7, label: 'Friend' },
      { source: 'you', target: 'emma', value: 0.6, label: 'Acquaintance' },
      { source: 'you', target: 'dad', value: 0.8, label: 'Family' },
      { source: 'you', target: 'mom', value: 0.85, label: 'Family' },
      { source: 'sarah', target: 'mike', value: 0.5, label: 'Mutual' }
    ]
  },
  metadata: {
    sentimentTimeline: [
      { character: 'Sarah', date: '2025-01-01', sentiment: 0.8, context: 'Had a great conversation' },
      { character: 'Sarah', date: '2025-01-15', sentiment: 0.9, context: 'Supported me through tough time' },
      { character: 'Mike', date: '2025-01-10', sentiment: 0.6, context: 'Casual hangout' },
      { character: 'Dad', date: '2025-01-05', sentiment: 0.7, context: 'Weekly check-in' }
    ],
    archetypes: [
      { character: 'Sarah', archetype: 'Mentor', confidence: 0.85 },
      { character: 'Mike', archetype: 'Friend', confidence: 0.7 },
      { character: 'Dad', archetype: 'Family', confidence: 0.9 }
    ],
    attachmentGravity: [
      { character: 'Sarah', score: 0.9, trend: 'increasing' },
      { character: 'Mom', score: 0.85, trend: 'stable' },
      { character: 'Mike', score: 0.7, trend: 'stable' }
    ],
    forecast: [
      { character: 'Sarah', prediction: 'Relationship deepening', confidence: 0.8 },
      { character: 'Emma', prediction: 'Potential new friendship', confidence: 0.6 }
    ],
    arcAppearances: [
      { character: 'Sarah', arc: 'Growth Arc', appearances: 15 },
      { character: 'Mike', arc: 'Friendship Arc', appearances: 8 }
    ],
    heatmap: [
      { character: 'Sarah', month: '2025-01', intensity: 0.9 },
      { character: 'Mike', month: '2025-01', intensity: 0.6 },
      { character: 'Dad', month: '2025-01', intensity: 0.7 }
    ]
  },
  insights: [
    { id: '1', text: 'Sarah appears most frequently in your entries and shows consistently positive sentiment', category: 'relationship', score: 0.9 },
    { id: '2', text: 'Family relationships (Dad, Mom) show stable, high closeness scores', category: 'family', score: 0.85 },
    { id: '3', text: 'New connections like Emma are emerging in your social network', category: 'network', score: 0.6 }
  ],
  summary: 'Your relationship network shows strong connections with Sarah and family members. Sarah appears to be a central figure in your social landscape with consistently positive interactions.'
};

export const RelationshipsAnalyticsPanel = () => {
  const analyticsModule = getModuleByKey('relationships');
  const { data: realData, loading, error } = useAnalytics('relationships');
  const { useMockData: isMockDataEnabled } = useMockData();
  
  // Use mock data if toggle is on AND (no real data OR error)
  const useMockData = isMockDataEnabled && (!realData || error);

  if (!analyticsModule) {
    return (
      <EmptyState
        title="Module Not Found"
        description="The Relationships analytics module does not exist."
      />
    );
  }

  if (loading && !useMockData) {
    return <LoadingSkeleton />;
  }

  const data = useMockData ? MOCK_RELATIONSHIPS_DATA : realData;

  if (!data) {
    return (
      <EmptyState
        title="Failed to Load Data"
        description={error || 'Unable to fetch analytics data. Please try again later.'}
      />
    );
  }

  const isMockData = useMockData;

  const metadata = data.metadata || {};
  const sentimentTimeline = Array.isArray(metadata.sentimentTimeline) ? metadata.sentimentTimeline : [];
  const archetypes = Array.isArray(metadata.archetypes) ? metadata.archetypes : [];
  const attachmentGravity = Array.isArray(metadata.attachmentGravity) ? metadata.attachmentGravity : [];
  const forecast = Array.isArray(metadata.forecast) ? metadata.forecast : [];
  const arcAppearances = Array.isArray(metadata.arcAppearances) ? metadata.arcAppearances : [];
  const heatmap = Array.isArray(metadata.heatmap) ? metadata.heatmap : [];

  return (
    <div className="space-y-6">
      {/* Mock Data Banner */}
      {isMockData && (
        <div className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
          📊 Showing mock data for demonstration. Real data will appear as you build relationships.
        </div>
      )}

      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Users className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Relationship Intelligence</CardTitle>
              <CardDescription className="text-white/70">
                Deep analysis of your relational world
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
              label="Total Characters"
              value={data.metrics.totalCharacters || 0}
            />
            <MetricCard
              label="Total Relationships"
              value={data.metrics.totalRelationships || 0}
            />
            <MetricCard
              label="Average Closeness"
              value={typeof data.metrics.averageCloseness === 'number' 
                ? data.metrics.averageCloseness.toFixed(2) 
                : '0.00'}
            />
            {data.metrics.mostCentralCharacter && (
              <MetricCard
                label="Most Central Character"
                value={data.metrics.mostCentralCharacter}
              />
            )}
            <MetricCard
              label="Active Relationships"
              value={data.metrics.activeRelationships || 0}
            />
          </div>
        </div>
      )}

      {/* Relationship Network Graph */}
      {data.graph && data.graph.nodes && Array.isArray(data.graph.nodes) && data.graph.nodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Relationship Network</h3>
          <GraphVis
            nodes={data.graph.nodes}
            edges={Array.isArray(data.graph.edges) ? data.graph.edges : []}
            title="Relationship Network"
            height={500}
          />
        </div>
      )}

      {/* Sentiment Timeline */}
      {sentimentTimeline.length > 0 && (
        <RelationshipSentimentTimeline data={sentimentTimeline} />
      )}

      {/* Heatmap */}
      {heatmap.length > 0 && (
        <RelationshipHeatmapCard heatmap={heatmap} />
      )}

      {/* Charts Section */}
      {data.charts && Array.isArray(data.charts) && data.charts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Visualizations</h3>
          <div className="space-y-6">
            {data.charts.map((chart, index) => (
              <ChartCard
                key={chart.id || index}
                title={chart.title || 'Chart'}
                chartType={chart.type || 'line'}
                data={Array.isArray(chart.data) ? chart.data : []}
                description={chart.description}
                xAxis={chart.xAxis}
                yAxis={chart.yAxis}
                series={Array.isArray(chart.series) ? chart.series : []}
              />
            ))}
          </div>
        </div>
      )}

      {/* Archetypes */}
      {archetypes.length > 0 && (
        <RelationshipArchetypeCard archetypes={archetypes} />
      )}

      {/* Attachment Gravity */}
      {attachmentGravity.length > 0 && (
        <AttachmentGravityCard scores={attachmentGravity} />
      )}

      {/* Forecast */}
      {forecast.length > 0 && (
        <RelationshipForecastCard forecast={forecast} />
      )}

      {/* Arc Appearances */}
      {arcAppearances.length > 0 && (
        <ArcAppearanceCard arcData={arcAppearances} />
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

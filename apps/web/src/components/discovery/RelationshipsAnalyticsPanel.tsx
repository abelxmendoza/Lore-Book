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

export const RelationshipsAnalyticsPanel = () => {
  const analyticsModule = getModuleByKey('relationships');
  const { data, loading, error } = useAnalytics('relationships');

  if (!analyticsModule) {
    return (
      <EmptyState
        title="Module Not Found"
        description="The Relationships analytics module does not exist."
      />
    );
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Failed to Load Data"
        description={error || 'Unable to fetch analytics data. Please try again later.'}
      />
    );
  }

  const metadata = data.metadata || {};
  const sentimentTimeline = metadata.sentimentTimeline || [];
  const archetypes = metadata.archetypes || [];
  const attachmentGravity = metadata.attachmentGravity || [];
  const forecast = metadata.forecast || [];
  const arcAppearances = metadata.arcAppearances || [];
  const heatmap = metadata.heatmap || [];

  return (
    <div className="space-y-6">
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
      {data.graph && data.graph.nodes && data.graph.nodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Relationship Network</h3>
          <GraphVis
            nodes={data.graph.nodes}
            edges={data.graph.edges}
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
      {data.charts && data.charts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Visualizations</h3>
          <div className="space-y-6">
            {data.charts.map((chart, index) => (
              <ChartCard
                key={chart.id || index}
                title={chart.title}
                chartType={chart.type}
                data={chart.data}
                description={chart.description}
                xAxis={chart.xAxis}
                yAxis={chart.yAxis}
                series={chart.series}
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
      {data.insights && data.insights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Insights</h3>
          <div className="space-y-3">
            {data.insights.map((insight, index) => {
              const insightText = typeof insight === 'string' ? insight : insight.text;
              const insightTitle = typeof insight === 'object' ? insight.title : undefined;
              const insightCategory = typeof insight === 'object' ? insight.category : undefined;
              const insightScore = typeof insight === 'object' ? insight.score : undefined;

              return (
                <InsightCard
                  key={insight.id || index}
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

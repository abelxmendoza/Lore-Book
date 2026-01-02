import { getModuleByKey } from '../../config/analyticsModules';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { InsightCard } from './InsightCard';
import { AISummaryCard } from './AISummaryCard';
import { ClusterGrid } from './ClusterGrid';
import { GraphVis } from './GraphVis';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export const CharactersAnalyticsPanel = () => {
  const analyticsModule = getModuleByKey('characters');
  const { data, loading, error } = useAnalytics('characters');

  if (!analyticsModule) {
    return (
      <EmptyState
        title="Module Not Found"
        description="The Characters analytics module does not exist."
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

  const Icon = analyticsModule.icon;

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Icon className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">{analyticsModule.title}</CardTitle>
              <CardDescription className="text-white/70">
                {analyticsModule.description}
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
            {analyticsModule.metrics.map((metricKey) => {
              const value = data.metrics[metricKey];
              if (value === undefined || value === null) return null;

              return (
                <MetricCard
                  key={metricKey}
                  label={metricKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  value={value}
                />
              );
            })}
            {/* Also show any additional metrics from the API */}
            {Object.entries(data.metrics)
              .filter(([key]) => !analyticsModule.metrics.includes(key))
              .map(([key, value]) => (
                <MetricCard
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  value={value}
                />
              ))}
          </div>
        </div>
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

      {/* Clusters Section */}
      {data.clusters && data.clusters.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Clusters</h3>
          <ClusterGrid clusters={data.clusters} />
        </div>
      )}

      {/* Graph Section */}
      {data.graph && data.graph.nodes && data.graph.nodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Network Graph</h3>
          <GraphVis
            nodes={data.graph.nodes}
            edges={data.graph.edges}
            title="Relationship Graph"
            height={500}
          />
        </div>
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


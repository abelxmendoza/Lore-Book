// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { BarChart3, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

type RelationshipAnalyticsData = {
  relationshipId: string;
  personId: string;
  personName: string;
  affectionScore: number;
  compatibilityScore: number;
  healthScore: number;
  intensityScore: number;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  redFlags: string[];
  greenFlags: string[];
  insights: string[];
  recommendations: string[];
  affectionTrend: string;
  healthTrend: string;
  calculatedAt: string;
};

interface RelationshipAnalyticsProps {
  relationshipId: string;
  analytics: RelationshipAnalyticsData;
}

const getScoreColor = (score: number) => {
  if (score >= 0.7) return 'text-green-400';
  if (score >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'increasing':
    case 'improving':
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    case 'decreasing':
    case 'declining':
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-yellow-400" />;
  }
};

export const RelationshipAnalytics = ({ analytics }: RelationshipAnalyticsProps) => {
  return (
    <div className="space-y-6">
      {/* Health Dashboard */}
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <BarChart3 className="w-5 h-5 text-pink-400" />
            Relationship Health Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
              <p className="text-xs text-white/50 mb-1">Affection</p>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-bold ${getScoreColor(analytics.affectionScore)}`}>
                  {Math.round(analytics.affectionScore * 100)}%
                </p>
                {getTrendIcon(analytics.affectionTrend)}
              </div>
              <p className="text-xs text-white/50 mt-1 capitalize">{analytics.affectionTrend}</p>
            </div>
            <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
              <p className="text-xs text-white/50 mb-1">Compatibility</p>
              <p className={`text-2xl font-bold ${getScoreColor(analytics.compatibilityScore)}`}>
                {Math.round(analytics.compatibilityScore * 100)}%
              </p>
            </div>
            <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
              <p className="text-xs text-white/50 mb-1">Health</p>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-bold ${getScoreColor(analytics.healthScore)}`}>
                  {Math.round(analytics.healthScore * 100)}%
                </p>
                {getTrendIcon(analytics.healthTrend)}
              </div>
              <p className="text-xs text-white/50 mt-1 capitalize">{analytics.healthTrend}</p>
            </div>
            <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
              <p className="text-xs text-white/50 mb-1">Intensity</p>
              <p className={`text-2xl font-bold ${getScoreColor(analytics.intensityScore)}`}>
                {Math.round(analytics.intensityScore * 100)}%
              </p>
            </div>
          </div>

          {/* Simple Radar Chart Representation */}
          <div className="p-4 rounded-lg border border-border/60 bg-black/60">
            <h4 className="text-sm font-semibold text-white mb-4">Score Overview</h4>
            <div className="space-y-3">
              {[
                { label: 'Affection', value: analytics.affectionScore, color: 'bg-pink-500' },
                { label: 'Compatibility', value: analytics.compatibilityScore, color: 'bg-blue-500' },
                { label: 'Health', value: analytics.healthScore, color: 'bg-green-500' },
                { label: 'Intensity', value: analytics.intensityScore, color: 'bg-purple-500' },
              ].map((metric) => (
                <div key={metric.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/70">{metric.label}</span>
                    <span className={`text-xs font-semibold ${getScoreColor(metric.value)}`}>
                      {Math.round(metric.value * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${metric.color} transition-all duration-500`}
                      style={{ width: `${metric.value * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {analytics.strengths.length > 0 && (
          <Card className="border-green-500/30 bg-green-950/10">
            <CardHeader>
              <CardTitle className="text-green-300 text-lg">Strengths</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analytics.strengths.map((strength, idx) => (
                  <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {analytics.weaknesses.length > 0 && (
          <Card className="border-red-500/30 bg-red-950/10">
            <CardHeader>
              <CardTitle className="text-red-300 text-lg">Weaknesses</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analytics.weaknesses.map((weakness, idx) => (
                  <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                    <span className="text-red-400 mt-1">⚠</span>
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Insights & Recommendations */}
      {analytics.insights.length > 0 && (
        <Card className="border-primary/30 bg-primary/10">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analytics.insights.map((insight, idx) => (
                <li key={idx} className="text-sm text-white/80">• {insight}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {analytics.recommendations.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-950/10">
          <CardHeader>
            <CardTitle className="text-blue-300 text-lg">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analytics.recommendations.map((rec, idx) => (
                <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                  <span className="text-blue-400 mt-1">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

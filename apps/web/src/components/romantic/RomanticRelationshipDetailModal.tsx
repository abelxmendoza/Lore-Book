// =====================================================
// ROMANTIC RELATIONSHIP DETAIL MODAL
// Purpose: Show detailed analytics for a relationship
// =====================================================

import { useState, useEffect } from 'react';
import { X, Heart, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';

interface RomanticRelationshipDetailModalProps {
  relationshipId: string;
  onClose: () => void;
}

type RelationshipAnalytics = {
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

type DateEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

export const RomanticRelationshipDetailModal: React.FC<RomanticRelationshipDetailModalProps> = ({
  relationshipId,
  onClose,
}) => {
  const [analytics, setAnalytics] = useState<RelationshipAnalytics | null>(null);
  const [dates, setDates] = useState<DateEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [relationshipId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsData, datesData] = await Promise.all([
        fetchJson<{ success: boolean; analytics: RelationshipAnalytics }>(
          `/api/conversation/romantic-relationships/${relationshipId}/analytics`
        ),
        fetchJson<{ success: boolean; dates: DateEvent[] }>(
          `/api/conversation/romantic-relationships/${relationshipId}/dates`
        ),
      ]);

      if (analyticsData.success) {
        setAnalytics(analyticsData.analytics);
      }
      if (datesData.success) {
        setDates(datesData.dates);
      }
    } catch (error) {
      console.error('Failed to load relationship data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black border-border">
          <div className="text-center text-white/60 py-8">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!analytics) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black border-border">
          <div className="text-center text-white/60 py-8">Relationship not found</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-black border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5" />
            {analytics.personName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="analytics" className="mt-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="dates">Dates & Milestones</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4 space-y-4">
            {/* Scores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <p className="text-xs text-white/50 mb-1">Affection</p>
                <p className={`text-2xl font-bold ${getScoreColor(analytics.affectionScore)}`}>
                  {Math.round(analytics.affectionScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <p className="text-xs text-white/50 mb-1">Compatibility</p>
                <p className={`text-2xl font-bold ${getScoreColor(analytics.compatibilityScore)}`}>
                  {Math.round(analytics.compatibilityScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <p className="text-xs text-white/50 mb-1">Health</p>
                <p className={`text-2xl font-bold ${getScoreColor(analytics.healthScore)}`}>
                  {Math.round(analytics.healthScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <p className="text-xs text-white/50 mb-1">Intensity</p>
                <p className={`text-2xl font-bold ${getScoreColor(analytics.intensityScore)}`}>
                  {Math.round(analytics.intensityScore * 100)}%
                </p>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/10">
                <h3 className="font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Strengths
                </h3>
                <ul className="space-y-1">
                  {analytics.strengths.length > 0 ? (
                    analytics.strengths.map((s, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        • {s}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-white/50">No strengths identified yet</li>
                  )}
                </ul>
              </div>

              <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                <h3 className="font-semibold text-red-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Weaknesses
                </h3>
                <ul className="space-y-1">
                  {analytics.weaknesses.length > 0 ? (
                    analytics.weaknesses.map((w, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        • {w}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-white/50">No weaknesses identified yet</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Pros & Cons */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <h3 className="font-semibold text-white mb-2">Pros</h3>
                <ul className="space-y-1">
                  {analytics.pros.length > 0 ? (
                    analytics.pros.map((p, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        ✓ {p}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-white/50">No pros identified yet</li>
                  )}
                </ul>
              </div>

              <div className="p-4 rounded-lg border border-white/10 bg-black/20">
                <h3 className="font-semibold text-white mb-2">Cons</h3>
                <ul className="space-y-1">
                  {analytics.cons.length > 0 ? (
                    analytics.cons.map((c, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        ✗ {c}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-white/50">No cons identified yet</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Red & Green Flags */}
            {(analytics.redFlags.length > 0 || analytics.greenFlags.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {analytics.redFlags.length > 0 && (
                  <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                    <h3 className="font-semibold text-red-300 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Red Flags
                    </h3>
                    <ul className="space-y-1">
                      {analytics.redFlags.map((flag, idx) => (
                        <li key={idx} className="text-sm text-white/80">
                          ⚠ {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analytics.greenFlags.length > 0 && (
                  <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/10">
                    <h3 className="font-semibold text-green-300 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Green Flags
                    </h3>
                    <ul className="space-y-1">
                      {analytics.greenFlags.map((flag, idx) => (
                        <li key={idx} className="text-sm text-white/80">
                          ✓ {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="dates" className="mt-4">
            <div className="space-y-3">
              {dates.length === 0 ? (
                <div className="text-center text-white/60 py-8">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No dates or milestones recorded yet</p>
                </div>
              ) : (
                dates.map((date) => (
                  <div key={date.id} className="p-4 rounded-lg border border-white/10 bg-black/20">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {date.date_type.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-white/60">
                            {new Date(date.date_time).toLocaleDateString()}
                          </span>
                          {date.was_positive !== undefined && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${date.was_positive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}
                            >
                              {date.was_positive ? 'Positive' : 'Negative'}
                            </Badge>
                          )}
                        </div>
                        {date.location && (
                          <p className="text-xs text-white/50 mb-1">📍 {date.location}</p>
                        )}
                        {date.description && (
                          <p className="text-sm text-white/80">{date.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-4">
            <div className="space-y-4">
              {analytics.insights.length > 0 && (
                <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10">
                  <h3 className="font-semibold text-blue-300 mb-2">Insights</h3>
                  <ul className="space-y-2">
                    {analytics.insights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        💡 {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analytics.recommendations.length > 0 && (
                <div className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/10">
                  <h3 className="font-semibold text-purple-300 mb-2">Recommendations</h3>
                  <ul className="space-y-2">
                    {analytics.recommendations.map((rec, idx) => (
                      <li key={idx} className="text-sm text-white/80">
                        📋 {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

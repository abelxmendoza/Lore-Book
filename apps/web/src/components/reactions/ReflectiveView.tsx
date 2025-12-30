import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, Eye, HelpCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { reactionApi } from '../../api/reactions';
import type { ReactionPatterns } from '../../types/reaction';

/**
 * Reflective View (Therapist Mode)
 * 
 * Shows patterns, not advice.
 * Asks questions, never asserts conclusions.
 */
export const ReflectiveView: React.FC = () => {
  const [patterns, setPatterns] = useState<ReactionPatterns | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadPatterns();
  }, []);

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const data = await reactionApi.getReactionPatterns();
      setPatterns(data);
    } catch (error) {
      console.error('Failed to load reaction patterns:', error);
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

  if (!patterns) {
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
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-orange-500/10 border border-purple-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Brain className="h-6 w-6 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Reflective View</h2>
            <p className="text-sm text-white/70">
              Patterns, not advice. Questions, not conclusions.
            </p>
          </div>
        </div>
      </div>

      {/* Common Patterns */}
      {patterns.commonPatterns.length > 0 && (
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

      {/* Top Reactions */}
      {Object.keys(patterns.byLabel).length > 0 && (
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
            {patterns.commonPatterns.length > 0 && (
              <p>
                • This perception triggered {patterns.commonPatterns[0].reaction_label} {patterns.commonPatterns[0].count} times. 
                Does that feel accurate?
              </p>
            )}
            {Object.entries(patterns.byType).find(([_, count]) => count > 5) && (
              <p>
                • You have more {Object.entries(patterns.byType).sort(([, a], [, b]) => b - a)[0][0]} reactions than others. 
                What do you notice about that?
              </p>
            )}
            {patterns.commonPatterns.some(p => p.trigger_type === 'perception' && p.avg_intensity > 0.7) && (
              <p>
                • Some beliefs trigger strong reactions even with low confidence. 
                What might that mean?
              </p>
            )}
            <p>
              • How have your coping responses changed over time?
            </p>
            <p>
              • Are there patterns you'd like to understand better?
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

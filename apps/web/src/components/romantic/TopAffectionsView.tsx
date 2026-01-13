// =====================================================
// TOP AFFECTIONS VIEW
// Purpose: Show who you like most (ranked list)
// =====================================================

import { useState, useEffect } from 'react';
import { Heart, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

type AffectionScore = {
  personId: string;
  personName: string;
  personType: 'character' | 'omega_entity';
  relationshipId: string;
  relationshipType: string;
  affectionScore: number;
  emotionalIntensity: number;
  physicalAttraction: number;
  emotionalConnection: number;
  mentionFrequency: number;
  sentimentAverage: number;
  timeInvestment: number;
  recencyScore: number;
  rankAmongAll: number;
  rankAmongActive: number;
  affectionTrend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  calculatedAt: string;
};

export const TopAffectionsView: React.FC = () => {
  const [affections, setAffections] = useState<AffectionScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAffections();
  }, []);

  const loadAffections = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ success: boolean; affections: AffectionScore[] }>(
        '/api/conversation/romantic-relationships/top-affections?limit=10'
      );
      if (data.success) {
        setAffections(data.affections);
      }
    } catch (error) {
      console.error('Failed to load affections:', error);
    } finally {
      setLoading(false);
    }
  };

  const recalculate = async () => {
    setLoading(true);
    try {
      await fetchJson('/api/conversation/romantic-relationships/calculate-affection', {
        method: 'POST',
      });
      await loadAffections();
    } catch (error) {
      console.error('Failed to recalculate:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      case 'volatile':
        return <Minus className="w-4 h-4 text-yellow-400" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-black/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5" />
              Who You Like Most
            </CardTitle>
            <CardDescription>Ranked by affection score</CardDescription>
          </div>
          <Button onClick={recalculate} variant="outline" size="sm">
            Recalculate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {affections.length === 0 ? (
          <div className="text-center text-white/60 py-8">
            <p>No romantic relationships found</p>
            <p className="text-sm mt-2">Start talking about your relationships to see rankings!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {affections.map((affection, index) => (
              <div
                key={affection.relationshipId}
                className="flex items-center gap-4 p-4 rounded-lg border border-white/10 bg-black/20 hover:bg-black/30 transition-colors"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 border border-primary/30">
                  {index === 0 ? (
                    <Trophy className="w-6 h-6 text-yellow-400" />
                  ) : (
                    <span className="text-xl font-bold text-white">{index + 1}</span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white">{affection.personName}</h3>
                    <Badge variant="outline" className="text-xs">
                      {affection.relationshipType.replace('_', ' ')}
                    </Badge>
                    {getTrendIcon(affection.affectionTrend)}
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-2">
                    <div>
                      <p className="text-xs text-white/50">Affection</p>
                      <p className={`text-sm font-semibold ${getScoreColor(affection.affectionScore)}`}>
                        {Math.round(affection.affectionScore * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-white/50">Intensity</p>
                      <p className={`text-sm font-semibold ${getScoreColor(affection.emotionalIntensity)}`}>
                        {Math.round(affection.emotionalIntensity * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-white/50">Mentions</p>
                      <p className="text-sm font-semibold text-white/80">{affection.mentionFrequency}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white/50">Recency</p>
                      <p className={`text-sm font-semibold ${getScoreColor(affection.recencyScore)}`}>
                        {Math.round(affection.recencyScore * 100)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

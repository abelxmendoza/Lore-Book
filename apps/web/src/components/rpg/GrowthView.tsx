/**
 * Growth View
 * Displays "Your Growth Journey" with challenge stories
 * No win/loss records - just growth stories
 */

import { useEffect, useState } from 'react';
import { TrendingUp, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Challenge {
  name: string;
  type: string;
  outcome: string | null;
  period: {
    start: string | null;
    end: string | null;
  };
  insights: Array<{
    text: string;
    type: string;
    suggestion?: string;
  }>;
}

interface GrowthResponse {
  challenges: Challenge[];
  summary: string;
}

export const GrowthView = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGrowth = async () => {
      try {
        const data = await fetchJson<GrowthResponse>('/api/rpg/growth');
        setChallenges(data.challenges || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load growth journey:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadGrowth();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your growth journey...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Growth Journey</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="space-y-4">
        {challenges.map((challenge, idx) => (
          <Card key={idx} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {challenge.name}
                {challenge.outcome && (
                  <span className={`text-xs font-normal ml-2 ${
                    challenge.outcome === 'victory' ? 'text-green-400' :
                    challenge.outcome === 'ongoing' ? 'text-blue-400' :
                    'text-yellow-400'
                  }`}>
                    {challenge.outcome}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {challenge.period.start && (
                <p className="text-white/60 text-sm">
                  {new Date(challenge.period.start).toLocaleDateString()}
                  {challenge.period.end && ` - ${new Date(challenge.period.end).toLocaleDateString()}`}
                </p>
              )}
              <div className="space-y-2">
                {challenge.insights.map((insight, insightIdx) => (
                  <div key={insightIdx} className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-white/80 text-sm">{insight.text}</p>
                      {insight.suggestion && (
                        <p className="text-primary/70 text-xs mt-1 italic">{insight.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {challenges.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Your growth journey is just beginning. Keep journaling to see your resilience.</p>
        </div>
      )}
    </div>
  );
};

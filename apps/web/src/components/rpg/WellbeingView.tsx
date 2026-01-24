/**
 * Wellbeing View
 * Displays "Your Wellbeing" with resource insights
 * No resource bars - just wellbeing patterns
 */

import { useEffect, useState } from 'react';
import { Heart, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface WellbeingInsight {
  text: string;
  type: string;
  suggestion?: string;
}

interface WellbeingResponse {
  insights: WellbeingInsight[];
  summary: string;
}

export const WellbeingView = () => {
  const [insights, setInsights] = useState<WellbeingInsight[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWellbeing = async () => {
      try {
        const data = await fetchJson<WellbeingResponse>('/api/rpg/wellbeing');
        setInsights(data.insights || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load wellbeing:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadWellbeing();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your wellbeing...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Wellbeing</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="space-y-4">
        {insights.map((insight, idx) => (
          <Card key={idx} className="border-border/40 bg-black/40">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-white/80">{insight.text}</p>
                  {insight.suggestion && (
                    <p className="text-primary/70 text-sm mt-2 italic">{insight.suggestion}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {insights.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Keep journaling to discover your wellbeing patterns</p>
        </div>
      )}
    </div>
  );
};

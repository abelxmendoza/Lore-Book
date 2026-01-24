/**
 * Companion View
 * Displays "People in Your Life" with relationship insights
 * No numbers or stats - only stories
 */

import { useEffect, useState } from 'react';
import { Users, Heart, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Companion {
  id: string;
  name: string;
  summary: string | null;
  insights: Array<{
    text: string;
    type: string;
    suggestion?: string;
  }>;
}

interface CompanionsResponse {
  companions: Companion[];
  summary: string;
}

export const CompanionView = () => {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCompanions = async () => {
      try {
        const data = await fetchJson<CompanionsResponse>('/api/rpg/companions');
        setCompanions(data.companions || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load companions:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadCompanions();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your relationships...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">People in Your Life</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companions.map((companion) => (
          <Card key={companion.id} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                {companion.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {companion.summary && (
                <p className="text-white/60 text-sm">{companion.summary}</p>
              )}
              <div className="space-y-2">
                {companion.insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2">
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

      {companions.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Keep journaling to discover the people in your life</p>
        </div>
      )}
    </div>
  );
};

/**
 * Social World View
 * Displays "Your Social World" with faction insights
 * No reputation numbers - just relationship patterns
 */

import { useEffect, useState } from 'react';
import { Users, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Faction {
  name: string;
  type: string | null;
  insights: Array<{
    text: string;
    type: string;
  }>;
}

interface SocialWorldResponse {
  factions: Faction[];
  summary: string;
}

export const SocialWorldView = () => {
  const [factions, setFactions] = useState<Faction[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSocialWorld = async () => {
      try {
        const data = await fetchJson<SocialWorldResponse>('/api/rpg/social-world');
        setFactions(data.factions || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load social world:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadSocialWorld();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your social world...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Social World</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {factions.map((faction, idx) => (
          <Card key={idx} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {faction.name}
                {faction.type && (
                  <span className="text-xs text-white/40 font-normal">({faction.type})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {faction.insights.map((insight, insightIdx) => (
                  <div key={insightIdx} className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-white/80 text-sm">{insight.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {factions.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Keep journaling to discover your social connections</p>
        </div>
      )}
    </div>
  );
};

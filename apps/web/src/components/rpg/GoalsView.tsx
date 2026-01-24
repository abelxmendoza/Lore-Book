/**
 * Goals View
 * Displays "Your Goals & Projects" with quest chains
 * No quest completion stats - just story connections
 */

import { useEffect, useState } from 'react';
import { Target, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Goal {
  id: string;
  name: string;
  description: string | null;
  insights: Array<{
    text: string;
    type: string;
    suggestion?: string;
  }>;
}

interface GoalsResponse {
  goals: Goal[];
  summary: string;
}

export const GoalsView = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const data = await fetchJson<GoalsResponse>('/api/rpg/goals');
        setGoals(data.goals || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load goals:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadGoals();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Target className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Goals & Projects</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="space-y-4">
        {goals.map((goal) => (
          <Card key={goal.id} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                {goal.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {goal.description && (
                <p className="text-white/60 text-sm">{goal.description}</p>
              )}
              <div className="space-y-2">
                {goal.insights.map((insight, idx) => (
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

      {goals.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Your goals and projects will appear here as you journal</p>
        </div>
      )}
    </div>
  );
};

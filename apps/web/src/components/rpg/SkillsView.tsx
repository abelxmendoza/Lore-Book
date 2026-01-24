/**
 * Skills View
 * Displays "Your Skills & Growth" with progression stories
 * No skill levels - just growth insights
 */

import { useEffect, useState } from 'react';
import { Award, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Skill {
  id: string;
  name: string;
  category: string;
  insights: Array<{
    text: string;
    type: string;
  }>;
}

interface SkillsResponse {
  skills: Skill[];
  summary: string;
}

export const SkillsView = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSkills = async () => {
      try {
        const data = await fetchJson<SkillsResponse>('/api/rpg/skills');
        setSkills(data.skills || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load skills:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadSkills();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your skills...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Award className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Skills & Growth</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {skills.map((skill) => (
          <Card key={skill.id} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                {skill.name}
                <span className="text-xs text-white/40 font-normal">({skill.category})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {skill.insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-white/80 text-sm">{insight.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {skills.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Keep journaling to discover your skills and growth</p>
        </div>
      )}
    </div>
  );
};

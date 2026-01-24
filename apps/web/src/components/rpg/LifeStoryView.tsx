/**
 * Life Story View
 * Displays "Your Life Story" with chapter navigation
 * No completion percentages - just narrative flow
 */

import { useEffect, useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Chapter {
  id: string | null;
  title: string;
  period: {
    start: string | null;
    end: string | null;
  };
  status: string;
  insights: Array<{
    text: string;
    type: string;
    suggestion?: string;
  }>;
}

interface LifeStoryResponse {
  chapters: Chapter[];
  summary: string;
}

export const LifeStoryView = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLifeStory = async () => {
      try {
        const data = await fetchJson<LifeStoryResponse>('/api/rpg/life-story');
        setChapters(data.chapters || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load life story:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadLifeStory();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your life story...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Your Life Story</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="space-y-4">
        {chapters.map((chapter, idx) => (
          <Card key={chapter.id || idx} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {chapter.title}
                <span className={`text-xs font-normal ml-2 ${
                  chapter.status === 'completed' ? 'text-green-400' :
                  chapter.status === 'active' ? 'text-blue-400' :
                  'text-yellow-400'
                }`}>
                  {chapter.status}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {chapter.period.start && (
                <p className="text-white/60 text-sm">
                  {new Date(chapter.period.start).toLocaleDateString()}
                  {chapter.period.end && ` - ${new Date(chapter.period.end).toLocaleDateString()}`}
                </p>
              )}
              <div className="space-y-2">
                {chapter.insights.map((insight, insightIdx) => (
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

      {chapters.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Your story is just beginning. Keep journaling to see your chapters unfold.</p>
        </div>
      )}
    </div>
  );
};

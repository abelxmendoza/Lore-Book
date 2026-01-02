import { useState } from 'react';
import { BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';

export const MemoirGenerator = () => {
  const [memoir, setMemoir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState('');
  const [period, setPeriod] = useState({ from: '', to: '' });

  const generateMemoir = async () => {
    setLoading(true);
    setMemoir(null);
    try {
      const result = await fetchJson<{ memoir: string }>('/api/naming/memoir', {
        method: 'POST',
        body: JSON.stringify({
          focus: focus || undefined,
          period: period.from || period.to ? period : undefined
        })
      });
      setMemoir(result.memoir);
    } catch (error) {
      console.error('Failed to generate memoir:', error);
      setMemoir('Failed to generate memoir. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Memoir Generator
        </CardTitle>
        <p className="text-sm text-white/60 mt-2">
          Generate a personal memoir based on your journal entries
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm text-white/70 mb-1 block">Focus (optional)</label>
            <Input
              type="text"
              placeholder="e.g., 'My journey as a developer', 'Relationships', 'Career growth'"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="bg-black/60 border-border/50 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-white/70 mb-1 block">From Date (optional)</label>
              <Input
                type="date"
                value={period.from}
                onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                className="bg-black/60 border-border/50 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-white/70 mb-1 block">To Date (optional)</label>
              <Input
                type="date"
                value={period.to}
                onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                className="bg-black/60 border-border/50 text-white"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={generateMemoir}
          disabled={loading}
          leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          className="w-full"
        >
          {loading ? 'Generating...' : 'Generate Memoir'}
        </Button>

        {memoir && (
          <div className="mt-6 p-4 rounded-lg border border-primary/30 bg-black/60">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-white">Your Memoir</h3>
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{memoir}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const blob = new Blob([memoir], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `memoir-${new Date().toISOString().split('T')[0]}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(memoir);
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


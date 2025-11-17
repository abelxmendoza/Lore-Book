import { useState } from 'react';
import { Database, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

type PopulateDummyDataProps = {
  compact?: boolean;
  onSuccess?: () => void;
};

export const PopulateDummyData = ({ compact = false, onSuccess }: PopulateDummyDataProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; results?: any; error?: string } | null>(null);
  const { refreshEntries, refreshChapters, refreshTimeline } = useLoreKeeper();

  const handlePopulate = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const data = await fetchJson<{ success: boolean; message: string; results: any }>('/api/dev/populate-dummy-data', {
        method: 'POST'
      });
      
      setResult({
        success: true,
        message: data.message,
        results: data.results
      });

      // Refresh all data after successful population
      await Promise.all([
        refreshEntries(),
        refreshChapters(),
        refreshTimeline()
      ]);

      if (onSuccess) {
        onSuccess();
      }

      // Clear success message after 5 seconds
      setTimeout(() => setResult(null), 5000);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to populate dummy data'
      });
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="relative">
        <Button
          onClick={handlePopulate}
          disabled={loading}
          size="sm"
          variant="outline"
          leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        >
          {loading ? 'Populating...' : 'Populate Data'}
        </Button>
        {result && (
          <div className={`absolute top-full left-0 mt-2 p-3 rounded-lg border min-w-[200px] z-50 ${
            result.success 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                {result.success ? (
                  <div>
                    <p className="text-xs font-medium text-green-400 mb-1">{result.message}</p>
                    {result.results && (
                      <div className="text-xs text-white/60 space-y-0.5">
                        <p>• {result.results.chapters} chapters</p>
                        <p>• {result.results.entries} entries</p>
                        <p>• {result.results.characters} characters</p>
                        <p>• {result.results.memoirSections} memoir sections</p>
                        {result.results.tasks && <p>• {result.results.tasks} tasks</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-red-400">{result.error}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Populate Dummy Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-white/60">
          Fill your app with sample data including journal entries, chapters, characters, and memoir sections.
          This is useful for testing and seeing how the app works with data.
        </p>
        
        <Button
          onClick={handlePopulate}
          disabled={loading}
          className="w-full"
          leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        >
          {loading ? 'Populating...' : 'Populate Dummy Data'}
        </Button>

        {result && (
          <div className={`p-4 rounded-lg border ${
            result.success 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            {result.success ? (
              <div>
                <p className="text-sm font-medium text-green-400 mb-2">{result.message}</p>
                {result.results && (
                  <div className="text-xs text-white/60 space-y-1">
                    <p>• {result.results.chapters} chapters created</p>
                    <p>• {result.results.entries} journal entries created</p>
                    <p>• {result.results.characters} characters/places created</p>
                    <p>• {result.results.memoirSections} memoir sections created</p>
                    {result.results.tasks && <p>• {result.results.tasks} tasks created</p>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-400">{result.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

